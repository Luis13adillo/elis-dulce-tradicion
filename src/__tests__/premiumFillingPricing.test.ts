import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { buildPremiumFillingSizes } from '@/lib/premiumFillings';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

describe('premium filling pricing (H5)', () => {
  it('sends a size only for selected premium fillings', () => {
    const fillings = [
      { value: 'fresa', premium: false },
      { value: 'tiramisu', premium: true },
      { value: 'nutella', premium: true },
    ];
    expect(buildPremiumFillingSizes(['fresa', 'tiramisu', 'nutella'], fillings,
      { fresa: '8-round', tiramisu: '10-round' })).toEqual({ tiramisu: '10-round' });
    expect(buildPremiumFillingSizes([], fillings, { tiramisu: '8-round' })).toEqual({});
  });

  const sql = read('supabase/migrations/20261027T190000_server_premium_filling_pricing.sql');

  it('server ignores the client upcharge and prices from the DB table', () => {
    expect(sql).not.toContain("(payload->>'premium_filling_upcharge')");
    expect(sql).toContain('v_server_prem := public.price_premium_fillings(v_filling_values, v_prem_sizes);');
    expect(sql).toContain('v_expected_total := v_base_price + v_server_prem + v_delivery_fee;');
    expect(sql).toContain('FROM premium_filling_upcharges');
    expect(sql).toContain("RAISE EXCEPTION 'Select a size for premium filling %'");
  });

  it('keeps create_pending_order_secure service_role only', () => {
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.create_pending_order_secure(jsonb, jsonb) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.price_premium_fillings(jsonb, jsonb) FROM PUBLIC, anon, authenticated;');
  });

  it('the wizard sends premium_filling_sizes', () => {
    expect(read('src/pages/Order.tsx')).toContain('premium_filling_sizes: buildPremiumFillingSizes(');
  });
});
