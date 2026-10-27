import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Source-level guards for H1/H3. The logic is SQL + Deno, which vitest
// can't execute; these pin the invariants.
const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('webhook payment matching (H1, H3)', () => {
  const sql = read('supabase/migrations/20261027T180000_webhook_payment_matching.sql');
  const webhook = read('supabase/functions/stripe-webhook/index.ts');

  it('webhook promotes only through the verified RPC with amount_received + currency', () => {
    expect(webhook).toContain('rpc("promote_pending_order_verified"');
    expect(webhook).toContain('p_amount_received_cents: pi.amount_received');
    expect(webhook).toContain('p_currency: pi.currency');
    expect(webhook).not.toContain('rpc("promote_pending_order",');
  });

  it('verifies amount, currency, PI id and duplicates before promoting', () => {
    for (const reason of ['amount_mismatch', 'currency_mismatch', 'payment_intent_mismatch', 'duplicate_payment']) {
      expect(sql).toContain(`'${reason}'`);
    }
    expect(sql).toMatch(/lower\(COALESCE\(p_currency, ''\)\) <> 'usd'/);
    // flagged rows return before the promote call
    expect(sql.indexOf("'flagged', true")).toBeLessThan(sql.indexOf('RETURN promote_pending_order('));
  });

  it('verified RPC is service_role only', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.promote_pending_order_verified(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.promote_pending_order_verified(uuid, text, integer, text) TO service_role;');
  });

  it('mark_pending_order_failed skips promoted rows and the webhook honours it', () => {
    expect(sql).toMatch(/IF v_row.status = 'promoted' THEN\s+--[^\n]*\n[^\n]*\n\s+RETURN jsonb_build_object\('skipped', true/);
    expect(webhook).toContain('if (pending?.skipped)');
  });
});
