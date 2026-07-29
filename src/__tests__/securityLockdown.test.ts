import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';

/**
 * Regression guards for the 2026-07-28 security lockdown.
 *
 * These are source-level assertions, not behavioural tests. Each one pins a
 * specific hole that was proven exploitable against live production, so that
 * a future refactor cannot quietly reopen it. They are deliberately cheap and
 * dependency-free — they read files and assert on their contents.
 */

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('DB lockdown: frontend calls the guarded staff_* wrappers', () => {
  // The raw RPCs carry no role check of their own. Calling them directly from
  // the browser is what let any anonymous caller mutate orders and read
  // revenue. The staff_* wrappers enforce owner/baker.
  const orders = read('src/lib/api/modules/orders.ts');
  const analytics = read('src/lib/api/modules/analytics.ts');

  it('uses staff_transition_order_status, never the raw RPC', () => {
    expect(orders).toContain("rpc('staff_transition_order_status'");
    expect(orders).not.toContain("rpc('transition_order_status'");
  });

  it('does not send a client-supplied p_user_id (audit-trail forgery)', () => {
    // changed_by must be derived from auth.uid() server-side. Match the
    // argument position specifically — the word still appears in a comment
    // explaining why it is absent.
    expect(orders).not.toMatch(/^\s*p_user_id\s*:/m);
  });

  it('uses staff_create_new_order, never the raw walk-in RPC', () => {
    expect(orders).toContain("rpc('staff_create_new_order'");
    expect(orders).not.toContain("rpc('create_new_order'");
  });

  it('uses the staff_ wrappers for the revenue/reporting RPCs', () => {
    expect(analytics).toContain("rpc('staff_get_dashboard_summary'");
    expect(analytics).toContain("rpc('staff_get_orders_by_status'");
    expect(analytics).not.toContain("rpc('get_dashboard_summary'");
    expect(analytics).not.toContain("rpc('get_orders_by_status'");
  });

  it('still calls the genuinely public customer RPCs directly', () => {
    // Guard against over-correction: locking these would break ordering.
    expect(orders).toContain("rpc('create_pending_order'");
    expect(orders).toContain("rpc('get_public_order'");
    expect(orders).toContain("rpc('get_pending_order'");
  });
});

describe('Edge Function lockdown: sensitive functions are guarded', () => {
  const GUARDED = [
    'send-order-confirmation',
    'send-status-update',
    'send-ready-notification',
    'send-payment-failed-customer',
    'send-failed-payment-notification',
    'send-contact-notification',
    'send-order-issue-notification',
    'send-daily-report',
  ];

  it.each(GUARDED)('%s requires staff or service-role auth', (fn) => {
    const src = read(`supabase/functions/${fn}/index.ts`);
    expect(src).toContain('requireStaffOrService');
    expect(src).toContain('_shared/authz.ts');
  });

  it('send-daily-report no longer accepts any bearer token', () => {
    const src = read('supabase/functions/send-daily-report/index.ts');
    // The old check was: authHeader.startsWith("Bearer ") => authorized.
    expect(src).not.toMatch(/isBearerAuth\s*=\s*authHeader/);
  });

  it('the stripe webhook stays unauthenticated but verifies its signature', () => {
    // Stripe cannot present a Supabase JWT, so this one must remain open —
    // its protection is the signature check, which must not be removed.
    const src = read('supabase/functions/stripe-webhook/index.ts');
    expect(src).toContain('constructEventAsync');
    expect(src).not.toContain('requireStaffOrService');
  });

  it('the auth guard fails closed and compares the key in constant time', () => {
    const src = read('supabase/functions/_shared/authz.ts');
    expect(src).toContain('timingSafeEqual');
    // Every rejection path must return 401/403 rather than falling through.
    expect(src).toMatch(/return json\(\{ error: "Unauthorized" \}, 401\)/);
    expect(src).toMatch(/return json\(\{ error: "Forbidden" \}, 403\)/);
  });
});

describe('Payments: no caller-supplied amount path remains', () => {
  const src = read('supabase/functions/create-payment-intent/index.ts');

  it('rejects requests without a pending_order_id', () => {
    expect(src).toContain('PENDING_ORDER_REQUIRED');
  });

  it('never destructures an amount from the request body', () => {
    // The removed legacy branch did:
    //   const { amount, currency, metadata, idempotencyKey } = body;
    // The surviving Tier A path also computes `Math.round(amount * 100)`, but
    // there `amount` is Number(pending.total_amount) read from the database —
    // so the meaningful assertion is that no amount is taken from the body.
    expect(src).not.toMatch(/const \{[^}]*\bamount\b[^}]*\}\s*=\s*body/);
    expect(src).not.toMatch(/\bbody\.amount\b/);
  });

  it('derives the charge from the pending order row', () => {
    expect(src).toContain('Number(pending.total_amount)');
  });

  it('the webhook legacy branch verifies amount and refuses to re-pay', () => {
    const wh = read('supabase/functions/stripe-webhook/index.ts');
    expect(wh).toContain('expectedCents');
    expect(wh).toContain('.neq("payment_status", "paid")');
  });
});

describe('Secrets: no service-role key literals in tracked source', () => {
  const SCRIPTS = join(ROOT, 'scripts');

  it('scripts read credentials from the environment', () => {
    if (!existsSync(SCRIPTS)) return;
    const offenders: string[] = [];
    for (const f of readdirSync(SCRIPTS)) {
      if (!f.endsWith('.ts') && !f.endsWith('.js')) continue;
      const src = readFileSync(join(SCRIPTS, f), 'utf8');
      // A hardcoded Supabase JWT literal, of any role.
      if (/["']eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\./.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('documents the required rotation of the exposed key', () => {
    const doc = read('SECURITY_KEY_ROTATION.md');
    expect(doc).toContain('rnszrscxwkdwvvlsihqc');
    expect(doc.toLowerCase()).toContain('rotate');
  });
});

describe('Storage: reference photos are private', () => {
  const migration = read(
    'supabase/migrations/20260728T211000_private_reference_images.sql',
  );

  it('flips the bucket to private', () => {
    expect(migration).toMatch(/UPDATE storage\.buckets\s+SET public = false/);
  });

  it('drops the anonymous read policy', () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "reference_images_public_read"');
  });

  it('scopes delete/update to staff instead of any authenticated user', () => {
    expect(migration).toContain('reference_images_staff_delete');
    expect(migration).toContain('reference_images_staff_update');
    expect(migration).toContain('public.is_staff_or_service()');
  });

  it('keeps anonymous upload working (guest checkout depends on it)', () => {
    expect(migration).toContain('reference_images_anon_insert');
  });
});
