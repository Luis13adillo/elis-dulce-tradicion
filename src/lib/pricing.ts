/**
 * Pricing Calculation Service
 * Handles all pricing calculations for cake orders
 */


export interface PricingBreakdown {
  basePrice: number;
  fillingCost: number;
  themeCost: number;
  deliveryFee: number;
  tax: number;
  subtotal: number;
  discount: number;
  total: number;
}

export interface OrderDetails {
  size: string;
  filling: string;
  theme: string;
  deliveryOption: 'delivery' | 'pickup';
  deliveryAddress?: string;
  zipCode?: string;
}

export interface PricingData {
  cakePricing: Array<{ size: string; base_price: number }>;
  fillingPricing: Array<{ name: string; additional_cost: number }>;
  themePricing: Array<{ name: string; additional_cost: number }>;
  deliveryZones: Array<{
    zone_name: string;
    base_fee: number;
    per_mile_rate: number;
    max_distance: number | null;
    zip_codes: string[];
    active?: boolean;
  }>;
  taxRates: Array<{
    state: string;
    county: string | null;
    rate: number;
  }>;
}


/**
 * Calculate base cake price
 */
export function calculateCakePrice(
  size: string,
  pricing: PricingData
): number {
  const cakePrice = pricing.cakePricing.find(
    (p) => p.size === size && p.base_price !== null
  );
  
  if (!cakePrice) {
    console.warn(`No pricing found for size: ${size}`);
    return 0;
  }
  
  return parseFloat(cakePrice.base_price.toString());
}

/**
 * Calculate filling additional cost
 */
export function calculateFillingCost(
  filling: string,
  pricing: PricingData
): number {
  const fillingPrice = pricing.fillingPricing.find(
    (p) => p.name === filling && p.additional_cost !== null
  );
  
  if (!fillingPrice) {
    console.warn(`No pricing found for filling: ${filling}`);
    return 0;
  }
  
  return parseFloat(fillingPrice.additional_cost.toString());
}

/**
 * Calculate theme additional cost
 */
export function calculateThemeCost(
  theme: string,
  pricing: PricingData
): number {
  const themePrice = pricing.themePricing.find(
    (p) => p.name === theme && p.additional_cost !== null
  );
  
  if (!themePrice) {
    console.warn(`No pricing found for theme: ${theme}`);
    return 0;
  }
  
  return parseFloat(themePrice.additional_cost.toString());
}

/**
 * Calculate delivery fee based on zone and distance
 */
export async function calculateDeliveryFee(
  address: string,
  zipCode: string,
  pricing: PricingData
): Promise<number> {
  // Find zone by zip code
  const zone = pricing.deliveryZones.find((z) =>
    z.zip_codes.includes(zipCode)
  );
  
  if (!zone) {
    // Default to highest zone if zip not found
    const defaultZone = pricing.deliveryZones
      .filter((z) => z.active)
      .sort((a, b) => b.base_fee - a.base_fee)[0];
    
    if (defaultZone) {
      return parseFloat(defaultZone.base_fee.toString());
    }
    
    return 15.00; // Fallback default
  }
  
  // DEAD CODE PATH (kept only because this module exports formatPrice used
  // by live pages): the real delivery fee is computed server-side by the
  // delivery-quote / create-pending-order Edge Functions since 2026-07-29.
  // Zone-based per-mile pricing is not used by the live order flow.
  return parseFloat(zone.base_fee.toString());
}

/**
 * Calculate tax based on delivery address
 */
export function calculateTax(
  subtotal: number,
  state: string = 'CA',
  county: string | undefined,
  pricing: PricingData
): number {
  // Find the most specific tax rate: county-level first, then state-level fallback
  let taxRate = undefined;

  if (county) {
    // Try county-specific rate first
    taxRate = pricing.taxRates.find(
      (r) => r.state === state && r.county !== null && r.county.toLowerCase() === county.toLowerCase()
    );
  }

  if (!taxRate) {
    // Fall back to state-level rate (county === null)
    taxRate = pricing.taxRates.find(
      (r) => r.state === state && r.county === null
    );
  }
  
  if (!taxRate) {
    // Default to 8% if no rate found
    console.warn(`No tax rate found for ${state}/${county}, using default 8%`);
    return subtotal * 0.08;
  }
  
  const rate = parseFloat(taxRate.rate.toString());
  return subtotal * rate;
}

/**
 * Format price for display
 */
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
