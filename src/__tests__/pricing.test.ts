/**
 * Unit tests for pricing.ts pure functions
 *
 * These functions are pure — they accept PricingData directly.
 * No API calls are made in the tests. The api module is mocked at
 * import time so Supabase does not attempt to open connections.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock the api module to prevent Supabase from initializing during import.
// The pure pricing functions (calculateCakePrice etc.) never call api —
// only fetchCurrentPricing, applyPromoCode, and calculateTotal do, and
// those are not tested here.
vi.mock('@/lib/api', () => ({
  api: {},
  default: {},
}));
import {
  calculateCakePrice,
  calculateFillingCost,
  calculateThemeCost,
  calculateTax,
  formatPrice,
  type PricingData,
} from '@/lib/pricing';

// ---------------------------------------------------------------------------
// Shared mock pricing data — passed directly to each function
// ---------------------------------------------------------------------------
const mockPricingData: PricingData = {
  cakePricing: [
    { size: 'small', base_price: 35 },
    { size: 'medium', base_price: 55 },
    { size: 'large', base_price: 75 },
  ],
  fillingPricing: [
    { name: 'chocolate', additional_cost: 5 },
    { name: 'vanilla', additional_cost: 0 },
  ],
  themePricing: [
    { name: 'birthday', additional_cost: 10 },
    { name: 'none', additional_cost: 0 },
  ],
  deliveryZones: [],
  taxRates: [{ state: 'PA', county: null, rate: 0.06 }],
};

// ---------------------------------------------------------------------------
// calculateCakePrice
// ---------------------------------------------------------------------------
describe('calculateCakePrice', () => {
  it('returns the base price for a medium cake', () => {
    expect(calculateCakePrice('medium', mockPricingData)).toBe(55);
  });

  it('returns the base price for a small cake', () => {
    expect(calculateCakePrice('small', mockPricingData)).toBe(35);
  });

  it('returns the base price for a large cake', () => {
    expect(calculateCakePrice('large', mockPricingData)).toBe(75);
  });

  it('returns 0 for an unknown size', () => {
    expect(calculateCakePrice('unknown_size', mockPricingData)).toBe(0);
  });

  it('returns 0 when cakePricing array is empty', () => {
    const emptyPricing: PricingData = { ...mockPricingData, cakePricing: [] };
    expect(calculateCakePrice('medium', emptyPricing)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateFillingCost
// ---------------------------------------------------------------------------
describe('calculateFillingCost', () => {
  it('returns the additional cost for a premium filling (chocolate)', () => {
    expect(calculateFillingCost('chocolate', mockPricingData)).toBe(5);
  });

  it('returns 0 for a standard filling with no additional cost (vanilla)', () => {
    expect(calculateFillingCost('vanilla', mockPricingData)).toBe(0);
  });

  it('returns 0 for an unknown filling', () => {
    expect(calculateFillingCost('unknown_filling', mockPricingData)).toBe(0);
  });

  it('returns 0 when fillingPricing array is empty', () => {
    const emptyPricing: PricingData = { ...mockPricingData, fillingPricing: [] };
    expect(calculateFillingCost('chocolate', emptyPricing)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateThemeCost
// ---------------------------------------------------------------------------
describe('calculateThemeCost', () => {
  it('returns the additional cost for a birthday theme', () => {
    expect(calculateThemeCost('birthday', mockPricingData)).toBe(10);
  });

  it('returns 0 for a "none" theme with no additional cost', () => {
    expect(calculateThemeCost('none', mockPricingData)).toBe(0);
  });

  it('returns 0 for an unknown theme', () => {
    expect(calculateThemeCost('unknown_theme', mockPricingData)).toBe(0);
  });

  it('returns 0 when themePricing array is empty', () => {
    const emptyPricing: PricingData = { ...mockPricingData, themePricing: [] };
    expect(calculateThemeCost('birthday', emptyPricing)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// calculateTax
// ---------------------------------------------------------------------------
describe('calculateTax', () => {
  it('applies the PA rate (6%) to a $100 subtotal', () => {
    expect(calculateTax(100, 'PA', undefined, mockPricingData)).toBeCloseTo(6, 5);
  });

  it('falls back to 8% for an unknown state', () => {
    expect(calculateTax(100, 'XX', undefined, mockPricingData)).toBeCloseTo(8, 5);
  });

  it('applies the rate proportionally to a $50 subtotal', () => {
    expect(calculateTax(50, 'PA', undefined, mockPricingData)).toBeCloseTo(3, 5);
  });

  it('returns 0 tax on a $0 subtotal', () => {
    expect(calculateTax(0, 'PA', undefined, mockPricingData)).toBe(0);
  });

  it('uses county-specific rate when county matches', () => {
    const pricingWithCounty: PricingData = {
      ...mockPricingData,
      taxRates: [
        { state: 'PA', county: null, rate: 0.06 },
        { state: 'PA', county: 'Montgomery', rate: 0.07 },
      ],
    };
    expect(calculateTax(100, 'PA', 'Montgomery', pricingWithCounty)).toBeCloseTo(7, 5);
  });

  it('falls back to state rate when county has no match', () => {
    expect(calculateTax(100, 'PA', 'UnknownCounty', mockPricingData)).toBeCloseTo(6, 5);
  });
});

// ---------------------------------------------------------------------------
// formatPrice
// ---------------------------------------------------------------------------
describe('formatPrice', () => {
  it('formats a whole dollar amount as USD currency string', () => {
    expect(formatPrice(55)).toBe('$55.00');
  });

  it('formats zero as $0.00', () => {
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('formats a fractional dollar amount with two decimal places', () => {
    expect(formatPrice(55.5)).toBe('$55.50');
  });

  it('formats amounts with two decimal places correctly', () => {
    expect(formatPrice(99.99)).toBe('$99.99');
  });
});
