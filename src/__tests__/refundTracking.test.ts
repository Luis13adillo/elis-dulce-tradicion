import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Source-level guards for M5 (refund tracking). The behaviour lives in SQL
// and Deno Edge Functions, which vitest can't execute; these pin the
// invariants so a refactor can't quietly drop them.
const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('refund tracking (M5)', () => {
  const sql = read('supabase/migrations/20261027T170000_refund_tracking.sql');
  const webhook = read('supabase/functions/stripe-webhook/index.ts');
  const cancel = read('supabase/functions/order-cancel/index.ts');

  it('caps refunded_cents at the order total in the database', () => {
    expect(sql).toMatch(/CHECK \(refunded_cents >= 0 AND refunded_cents <= round\(COALESCE\(total_amount, 0\) \* 100\)\)/);
  });

  it('apply_stripe_refund is service_role only and sets refund_status', () => {
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.apply_stripe_refund(text, integer) TO service_role;');
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.apply_stripe_refund(text, integer) FROM PUBLIC, anon, authenticated;");
    expect(sql).toContain("refund_status       = CASE WHEN v_new > 0 THEN 'processed'");
    expect(sql).toContain("'partially_refunded'");
  });

  it('webhook records refunds through the RPC and throws on DB errors', () => {
    expect(webhook).toContain('rpc("apply_stripe_refund"');
    expect(webhook).toContain('throw new Error(`apply_stripe_refund failed');
    expect(webhook).not.toContain('if (error) console.error("Refund update failed:", error);');
  });

  it('order-cancel caps at the remaining refundable amount and reports errors', () => {
    expect(cancel).toContain('Number(order.total_amount) - alreadyRefunded');
    expect(cancel).toContain('error: refundError');
  });
});
