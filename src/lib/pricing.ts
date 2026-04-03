/**
 * Pricing Calculation Service
 * Handles all pricing calculations for cake orders
 */

import { api } from './api';

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
  promoCode?: string;
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
  }>;
  taxRates: Array<{
    state: string;
    county: string | null;
    rate: number;
  }>;
}

let cachedPricing: PricingData | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current pricing from API
 */
export async function fetchCurrentPricing(): Promise<PricingData> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (cachedPricing && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedPricing;
  }

  try {
    const data = await api.getCurrentPricing();
    cachedPricing = data;
    cacheTimestamp = now;
    return data;
  } catch (error) {
    console.error('Error fetching pricing:', error);
    
    // Return cached data if available, even if expired
    if (cachedPricing) {
      return cachedPricing;
    }
    
    throw error;
  }
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
  
  // Calculate distance (would use Google Maps API in production)
  // For now, use base fee + estimate based on zone
  let distance = 0;
  
  try {
    // Use Google Maps Distance Matrix API if available
    const { calculateDistance } = await import('./googleMaps');
    distance = await calculateDistance(address);
  } catch (error) {
    console.warn('Could not calculate distance, using base fee:', error);
    // Use base fee if distance calculation fails
    return parseFloat(zone.base_fee.toString());
  }
  
  // Apply max distance limit if set
  if (zone.max_distance && distance > zone.max_distance) {
    // Use max distance for calculation
    distance = zone.max_distance;
  }
  
  const baseFee = parseFloat(zone.base_fee.toString());
  const perMileRate = parseFloat(zone.per_mile_rate.toString());
  
  return baseFee + (distance * perMileRate);
}

/**
 * Calculate tax based on delivery address
 */
export function calculateTax(
  subtotal: number,
  state: string = 'CA',
  county?: string,
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
 * Validate and apply promo code
 */
export async function applyPromoCode(
  code: string,
  subtotal: number
): Promise<{ discount: number; valid: boolean; message?: string }> {
  try {
    const promoData = await api.validatePromoCode(code, subtotal);
    
    if (!promoData.valid) {
      return {
        discount: 0,
        valid: false,
        message: promoData.message || 'Invalid promo code',
      };
    }
    
    let discount = 0;
    
    if (promoData.discount_type === 'percentage') {
      discount = subtotal * (parseFloat(promoData.discount_value.toString()) / 100);
      
      // Apply max discount if set
      if (promoData.max_discount_amount) {
        const maxDiscount = parseFloat(promoData.max_discount_amount.toString());
        discount = Math.min(discount, maxDiscount);
      }
    } else if (promoData.discount_type === 'fixed') {
      discount = parseFloat(promoData.discount_value.toString());
      // Don't allow discount to exceed subtotal
      discount = Math.min(discount, subtotal);
    }
    
    return {
      discount,
      valid: true,
    };
  } catch (error) {
    console.error('Error applying promo code:', error);
    return {
      discount: 0,
      valid: false,
      message: 'Error validating promo code',
    };
  }
}

/**
 * Calculate total order price with breakdown
 */
export async function calculateTotal(
  orderDetails: OrderDetails,
  pricing?: PricingData
): Promise<PricingBreakdown> {
  // Fetch pricing if not provided
  const currentPricing = pricing || await fetchCurrentPricing();
  
  // Calculate base price
  const basePrice = calculateCakePrice(orderDetails.size, currentPricing);
  
  // Calculate add-ons
  const fillingCost = calculateFillingCost(orderDetails.filling, currentPricing);
  const themeCost = calculateThemeCost(orderDetails.theme, currentPricing);
  
  // Calculate subtotal (before delivery and tax)
  const subtotal = basePrice + fillingCost + themeCost;
  
  // Calculate delivery fee
  let deliveryFee = 0;
  if (orderDetails.deliveryOption === 'delivery' && orderDetails.deliveryAddress && orderDetails.zipCode) {
    deliveryFee = await calculateDeliveryFee(
      orderDetails.deliveryAddress,
      orderDetails.zipCode,
      currentPricing
    );
  }
  
  // Calculate tax (on subtotal + delivery)
  const taxableAmount = subtotal + deliveryFee;
  const tax = calculateTax(taxableAmount, 'CA', undefined, currentPricing);
  
  // Apply promo code if provided
  let discount = 0;
  if (orderDetails.promoCode) {
    const promoResult = await applyPromoCode(orderDetails.promoCode, taxableAmount + tax);
    if (promoResult.valid) {
      discount = promoResult.discount;
    }
  }
  
  // Calculate total
  const total = taxableAmount + tax - discount;
  
  return {
    basePrice,
    fillingCost,
    themeCost,
    deliveryFee,
    tax,
    subtotal,
    discount,
    total: Math.max(0, total), // Ensure total is never negative
  };
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

/**
 * Clear pricing cache (useful after admin updates)
 */
export function clearPricingCache(): void {
  cachedPricing = null;
  cacheTimestamp = 0;
}
