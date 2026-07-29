import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Regression guards for the 2026-07-28 support-flows fix.
 *
 * Three production flows were broken or leaking:
 *   1. Contact form — inserts relied on anon table grants that never existed
 *      on prod (0 rows ever stored), and the owner notification 401'd after
 *      the Edge Function lockdown.
 *   2. Report-a-problem — looked the order up with the staff-wide
 *      getAllOrders() (anon has no grant on orders), same missing grants,
 *      and uploads treated the UploadResult object as a URL string.
 *   3. verify-payment — returned the ENTIRE orders row (select *) to any
 *      unauthenticated caller.
 *
 * These are source-level pins in the securityLockdown.test.ts style: cheap,
 * dependency-free assertions that a refactor cannot quietly reopen a hole.
 */

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('contact + order-issue submissions go through Edge Functions', () => {
  const support = read('src/lib/support.ts');

  it('the browser never inserts into contact_submissions or order_issues', () => {
    expect(support).not.toContain("from('contact_submissions')\n      .insert");
    expect(support).not.toMatch(/from\('contact_submissions'\)\s*\.insert/);
    expect(support).not.toMatch(/from\('order_issues'\)\s*\.insert/);
  });

  it('submits via the submit-contact / submit-order-issue functions', () => {
    expect(support).toContain("'submit-contact'");
    expect(support).toContain("'submit-order-issue'");
  });

  it('the broken client-side rate limiter (hardcoded ip=unknown) is gone', () => {
    expect(support).not.toContain('checkRateLimit');
    expect(support).not.toContain("contact_rate_limits");
  });

  it('both submissions carry an idempotency client_token', () => {
    expect(support).toMatch(/client_token:\s*data\.client_token/);
  });

  it('the browser no longer invokes the guarded send-* functions directly', () => {
    // Post-lockdown those functions reject anonymous customers; only the
    // submit-* functions (service role) may trigger them.
    expect(support).not.toContain("invoke(\n        'send-contact-notification'");
    expect(support).not.toMatch(/functions\.invoke\(\s*'send-contact-notification'/);
    expect(support).not.toMatch(/functions\.invoke\(\s*'send-order-issue-notification'/);
  });
});

describe('Contact.tsx handles uploads and retries honestly', () => {
  const contact = read('src/pages/Contact.tsx');

  it('aborts the submit when the attachment upload fails', () => {
    // uploadReferenceImage returns { success, path } — the page must check
    // it and stop, not silently continue without the photo.
    expect(contact).toMatch(/!uploadResult\.success \|\| !uploadResult\.path/);
    expect(contact).not.toContain('You can continue without it');
  });

  it('sends the storage path, not the old attachment_url', () => {
    expect(contact).toContain('attachment_path: attachmentPath');
    expect(contact).not.toMatch(/attachment_url:\s*attachmentUrl/);
  });

  it('reuses one client_token across retries and rotates it after success', () => {
    expect(contact).toContain('clientTokenRef.current = crypto.randomUUID()');
    expect(contact).toContain('client_token: clientTokenRef.current');
  });
});

describe('OrderIssue.tsx uses the public lookup and verified email', () => {
  const page = read('src/pages/OrderIssue.tsx');

  it('looks the order up via the rate-limited public RPC, not getAllOrders', () => {
    expect(page).toContain('api.getOrderByNumber');
    expect(page).not.toContain('api.getAllOrders');
  });

  it('collects the order email for server-side verification', () => {
    expect(page).toMatch(/email:\s*formData\.email/);
  });

  it('never sends client-supplied customer identity fields', () => {
    expect(page).not.toMatch(/customer_name:/);
    expect(page).not.toMatch(/customer_email:/);
    expect(page).not.toMatch(/customer_id:/);
  });

  it('aborts the submit when a photo upload fails', () => {
    expect(page).toMatch(/!r\.success \|\| !r\.path/);
    expect(page).not.toContain('You can continue without them');
  });

  it('reuses one client_token across retries', () => {
    expect(page).toContain('client_token: clientTokenRef.current');
  });
});

describe('submit Edge Functions enforce the server-side protections', () => {
  const contact = read('supabase/functions/submit-contact/index.ts');
  const issue = read('supabase/functions/submit-order-issue/index.ts');

  it.each([
    ['submit-contact', contact],
    ['submit-order-issue', issue],
  ])('%s validates, rate-limits, and dedupes', (_name, src) => {
    expect(src).toContain('bump_submission_rate');
    expect(src).toContain('client_token');
    expect(src).toContain('honeypot');
    expect(src).toContain('validation_failed');
    expect(src).toContain('23505'); // unique-violation race treated as dedupe
  });

  it('submit-order-issue authorizes by order number + order email match', () => {
    expect(issue).toContain('order_not_found_or_email_mismatch');
    expect(issue).toMatch(/customer_email.*toLowerCase\(\) !== email/s);
  });

  it('submit-order-issue copies identity from the order row, never the body', () => {
    expect(issue).toContain('customer_name: order.customer_name');
    expect(issue).not.toMatch(/customer_name:\s*body/);
  });

  it('rate limit runs before the order lookup (no order-number oracle)', () => {
    const rateIdx = issue.indexOf('bump_submission_rate');
    const lookupIdx = issue.indexOf(".from(\"orders\")");
    expect(rateIdx).toBeGreaterThan(0);
    expect(lookupIdx).toBeGreaterThan(rateIdx);
  });

  it('notifications are invoked with the service-role key, not fatal on failure', () => {
    for (const src of [contact, issue]) {
      expect(src).toContain('Bearer ${SUPABASE_SERVICE_ROLE_KEY}');
      expect(src).toContain('notification_sent');
    }
  });
});

describe('verify-payment returns only the customer-safe whitelist', () => {
  const src = read('supabase/functions/verify-payment/index.ts');

  it('never selects or returns the full orders row', () => {
    expect(src).not.toContain('select("*")');
    expect(src).toContain('SAFE_ORDER_COLUMNS');
    expect(src).toContain('toSafeOrder(');
  });

  it('exposes no private fields', () => {
    for (const forbidden of [
      'customer_name',
      'customer_phone',
      'delivery_address',
      'delivery_apartment',
      'special_instructions',
      'admin_notes',
      'stripe_payment_id',
    ]) {
      expect(src, `verify-payment must not expose ${forbidden}`).not.toContain(forbidden);
    }
    // Email only leaves masked.
    expect(src).toContain('customer_email_masked');
    expect(src).toContain('maskEmail');
  });

  it('accepts only a validated pending_order_id (raw PI path removed)', () => {
    expect(src).toContain('isUuid(pendingOrderId)');
    expect(src).not.toMatch(/body\.payment_intent_id/);
  });

  it('does not leak internal error messages', () => {
    expect(src).not.toContain('(err as Error).message');
  });
});

describe('notification emails escape user input', () => {
  it('send-contact-notification escapes every user-controlled field', () => {
    const src = read('supabase/functions/send-contact-notification/index.ts');
    expect(src).toContain('function escapeHtml');
    for (const field of ['submission.name', 'submission.email', 'submission.message']) {
      expect(src, `${field} must be escaped`).not.toMatch(
        new RegExp(`\\$\\{${field.replace('.', '\\.')}[}.]`)
      );
    }
    expect(src).toContain('escapeHtml(submission.message)');
  });

  it('send-order-issue-notification escapes photo URLs in attributes', () => {
    const src = read('supabase/functions/send-order-issue-notification/index.ts');
    expect(src).toContain('escapeHtml(url)');
  });
});

describe('migration restores staff access and locks the write path', () => {
  const mig = read('supabase/migrations/20260728T235000_support_forms_fix.sql');

  it('grants staff dashboard read/update (the grants lost in the cutover)', () => {
    expect(mig).toContain('GRANT SELECT, UPDATE ON public.contact_submissions TO authenticated');
    expect(mig).toContain('GRANT SELECT, UPDATE ON public.order_issues TO authenticated');
  });

  it('adds unique idempotency tokens to both tables', () => {
    expect(mig).toContain('contact_submissions_client_token_key');
    expect(mig).toContain('order_issues_client_token_key');
  });

  it('drops the direct-from-browser INSERT policies', () => {
    expect(mig).toContain('DROP POLICY IF EXISTS "Anyone can submit contact form"');
    expect(mig).toContain('DROP POLICY IF EXISTS "Anyone can submit order issues"');
  });

  it('never grants anon anything', () => {
    expect(mig).not.toMatch(/GRANT[^;]*TO anon/i);
  });

  it('locks the rate-limit counter to the service role', () => {
    expect(mig).toContain('REVOKE EXECUTE ON FUNCTION public.bump_submission_rate');
  });
});
