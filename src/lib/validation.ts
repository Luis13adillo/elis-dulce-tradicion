import { api } from './api';

/**
 * Validates that the order date/time is more than 24 hours in the future
 */
export function validateOrderDateTime(dateNeeded: string, timeNeeded: string): {
  isValid: boolean;
  error?: string;
  hoursUntilEvent?: number;
} {
  if (!dateNeeded || !timeNeeded) {
    return {
      isValid: false,
      error: 'Date and time are required'
    };
  }

  const orderDateTime = new Date(`${dateNeeded}T${timeNeeded}`);
  const now = new Date();

  // Check if date is valid
  if (isNaN(orderDateTime.getTime())) {
    return {
      isValid: false,
      error: 'Invalid date or time format'
    };
  }

  // Check if date is in the past
  if (orderDateTime <= now) {
    return {
      isValid: false,
      error: 'Order date and time must be in the future'
    };
  }

  // Calculate hours until event
  const hoursUntilEvent = (orderDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  // Must be MORE than 24 hours (not equal to)
  if (hoursUntilEvent <= 24) {
    return {
      isValid: false,
      error: 'Orders must be placed more than 24 hours in advance',
      hoursUntilEvent
    };
  }

  return {
    isValid: true,
    hoursUntilEvent
  };
}

/**
 * Formats hours until event for display
 */
export function formatHoursUntilEvent(hours: number, isSpanish: boolean = false): string {
  if (hours < 24) {
    const roundedHours = Math.round(hours);
    return isSpanish 
      ? `${roundedHours} ${roundedHours === 1 ? 'hora' : 'horas'}`
      : `${roundedHours} hour${roundedHours !== 1 ? 's' : ''}`;
  }
  
  const days = Math.floor(hours / 24);
  const remainingHours = Math.round(hours % 24);
  
  if (remainingHours === 0) {
    return isSpanish
      ? `${days} ${days === 1 ? 'día' : 'días'}`
      : `${days} day${days !== 1 ? 's' : ''}`;
  }
  
  return isSpanish
    ? `${days} ${days === 1 ? 'día' : 'días'} y ${remainingHours} ${remainingHours === 1 ? 'hora' : 'horas'}`
    : `${days} day${days !== 1 ? 's' : ''} and ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
}

/**
 * Validate order date - check capacity, lead time, holidays, and business hours
 */
export async function validateOrderDate(date: string): Promise<{
  isValid: boolean;
  error?: string;
  available?: boolean;
  currentOrders?: number;
  maxOrders?: number;
  reason?: string;
}> {
  if (!date) {
    return { isValid: false, error: 'Date is required' };
  }

  try {
    const response = await api.getCapacityByDate(date);
    return {
      isValid: response.available,
      available: response.available,
      currentOrders: response.current_orders,
      maxOrders: response.max_orders,
      reason: response.reason,
      error: response.available ? undefined : response.reason || 'Date not available',
    };
  } catch (error) {
    console.warn('Capacity check unavailable:', error);
    // Return valid if API is unavailable - don't block orders
    return { isValid: true, available: true };
  }
}

/**
 * Validate lead time. Pass `minHours` from business_settings.minimum_lead_time_hours
 * so the admin-configured value takes effect. Defaults to 48 if omitted, which
 * preserves behavior for any older caller that hasn't been updated yet.
 */
export function validateLeadTime(
  date: string,
  time: string,
  minHours: number = 48
): {
  isValid: boolean;
  error?: string;
  hoursUntilEvent?: number;
  minHours?: number;
} {
  if (!date || !time) {
    return { isValid: false, error: 'Date and time are required' };
  }

  const orderDateTime = new Date(`${date}T${time}`);
  const now = new Date();

  if (isNaN(orderDateTime.getTime())) {
    return { isValid: false, error: 'Invalid date or time format' };
  }

  if (orderDateTime <= now) {
    return { isValid: false, error: 'Order date and time must be in the future' };
  }

  const hoursUntilEvent = (orderDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilEvent < minHours) {
    return {
      isValid: false,
      error: `Orders must be placed at least ${minHours} hours in advance`,
      hoursUntilEvent,
      minHours,
    };
  }

  return {
    isValid: true,
    hoursUntilEvent,
    minHours,
  };
}

/**
 * Validate business hours for a specific date and time
 */
export async function validateBusinessHours(date: string, time: string): Promise<{
  isValid: boolean;
  error?: string;
  openTime?: string;
  closeTime?: string;
}> {
  if (!date || !time) {
    return { isValid: false, error: 'Date and time are required' };
  }

  try {
    const orderDate = new Date(`${date}T${time}`);
    const dayOfWeek = orderDate.getDay(); // 0 = Sunday, 6 = Saturday

    const response = await api.getBusinessHours();
    const businessHours = response.find((bh: any) => bh.day_of_week === dayOfWeek);

    if (!businessHours) {
      // No business hours configured - allow order
      return { isValid: true };
    }

    if (businessHours.is_closed) {
      return {
        isValid: false,
        error: 'We are closed on this day',
        openTime: businessHours.open_time,
        closeTime: businessHours.close_time,
      };
    }

    const [orderHour, orderMinute] = time.split(':').map(Number);
    const [openHour, openMinute] = businessHours.open_time.split(':').map(Number);
    const [closeHour, closeMinute] = businessHours.close_time.split(':').map(Number);

    const orderTime = orderHour * 60 + orderMinute;
    const openTime = openHour * 60 + openMinute;
    const closeTime = closeHour * 60 + closeMinute;

    if (orderTime < openTime || orderTime > closeTime) {
      return {
        isValid: false,
        error: `Order time must be between ${businessHours.open_time} and ${businessHours.close_time}`,
        openTime: businessHours.open_time,
        closeTime: businessHours.close_time,
      };
    }

    return {
      isValid: true,
      openTime: businessHours.open_time,
      closeTime: businessHours.close_time,
    };
  } catch (error) {
    console.warn('Business hours check unavailable:', error);
    // Return valid if API is unavailable - don't block orders
    return { isValid: true };
  }
}

/**
 * Validate if date is a holiday
 */
export async function validateHolidays(date: string): Promise<{
  isValid: boolean;
  error?: string;
  holidayName?: string;
}> {
  if (!date) {
    return { isValid: false, error: 'Date is required' };
  }

  try {
    const response = await api.checkHoliday(date);
    
    if (response.is_holiday && response.is_closed) {
      return {
        isValid: false,
        error: `We are closed on ${response.name}`,
        holidayName: response.name,
      };
    }

    return { isValid: true };
  } catch (error) {
    console.warn('Holiday check unavailable:', error);
    // Don't block if holiday check fails
    return { isValid: true };
  }
}

/**
 * Comprehensive order date/time validation
 * Note: API-dependent checks (business hours, holidays, capacity) are optional
 * and will be skipped if the backend is unavailable
 */
export async function validateOrderDateTimeComplete(
  date: string,
  time: string
): Promise<{
  isValid: boolean;
  errors: string[];
  warnings: string[];
  capacity?: {
    available: boolean;
    currentOrders: number;
    maxOrders: number;
  };
}> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate lead time (48 hours minimum) - REQUIRED
  const leadTimeValidation = validateLeadTime(date, time);
  if (!leadTimeValidation.isValid) {
    errors.push(leadTimeValidation.error || 'Invalid lead time');
  }

  // The following checks are optional - if API fails, we skip them
  // This allows orders to proceed when backend is unavailable

  // 2. Validate business hours (optional - skip if API fails)
  try {
    const businessHoursValidation = await validateBusinessHours(date, time);
    if (!businessHoursValidation.isValid && businessHoursValidation.error && !businessHoursValidation.error.includes('Error')) {
      errors.push(businessHoursValidation.error);
    }
  } catch (err) {
    // API unavailable - skip this check
    console.warn('Business hours check skipped - API unavailable');
  }

  // 3. Validate holidays (optional - skip if API fails)
  try {
    const holidayValidation = await validateHolidays(date);
    if (!holidayValidation.isValid && holidayValidation.error && !holidayValidation.error.includes('Error')) {
      errors.push(holidayValidation.error);
    }
  } catch (err) {
    // API unavailable - skip this check
    console.warn('Holiday check skipped - API unavailable');
  }

  // 4. Validate capacity (optional - skip if API fails)
  let capacityValidation: any = { isValid: true, available: true };
  try {
    capacityValidation = await validateOrderDate(date);
    if (!capacityValidation.isValid && capacityValidation.error && !capacityValidation.error.includes('Error')) {
      errors.push(capacityValidation.error);
    }
  } catch (err) {
    // API unavailable - skip this check
    console.warn('Capacity check skipped - API unavailable');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    capacity: capacityValidation.available
      ? {
          available: true,
          currentOrders: capacityValidation.currentOrders || 0,
          maxOrders: capacityValidation.maxOrders || 10,
        }
      : undefined,
  };
}

/**
 * Validate email format
 */
export function validateEmail(email: string): {
  valid: boolean;
  error?: string;
  value?: string;
} {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required and must be a string' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normalized = email.trim().toLowerCase();

  if (!emailRegex.test(normalized)) {
    return { valid: false, error: 'Invalid email format' };
  }

  // Additional length check
  if (normalized.length > 254) {
    return { valid: false, error: 'Email is too long' };
  }

  return { valid: true, value: normalized };
}

/**
 * Validate phone number (E.164 format preferred)
 */
export function validatePhone(phone: string): {
  valid: boolean;
  error?: string;
  value?: string;
} {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required and must be a string' };
  }

  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');

  // Check if it starts with + (E.164 format)
  if (cleaned.startsWith('+')) {
    // E.164 format: + followed by 1-15 digits
    const e164Regex = /^\+[1-9]\d{1,14}$/;
    if (e164Regex.test(cleaned)) {
      return { valid: true, value: cleaned };
    }
  }

  // US format: 10 digits (with or without leading 1)
  const usFormatRegex = /^1?[2-9]\d{2}[2-9]\d{2}\d{4}$/;
  if (usFormatRegex.test(cleaned)) {
    // Convert to E.164 format
    const e164 = cleaned.startsWith('1') ? `+${cleaned}` : `+1${cleaned}`;
    return { valid: true, value: e164 };
  }

  return { valid: false, error: 'Invalid phone number format. Please use E.164 format (e.g., +1234567890)' };
}

/**
 * Validate date (not in past, within 90 days)
 */
export function validateDate(dateString: string): {
  valid: boolean;
  error?: string;
  value?: string;
} {
  if (!dateString || typeof dateString !== 'string') {
    return { valid: false, error: 'Date is required and must be a string' };
  }

  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Invalid date format' };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  if (dateOnly < now) {
    return { valid: false, error: 'Date cannot be in the past' };
  }

  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 90);

  if (dateOnly > maxDate) {
    return { valid: false, error: 'Date cannot be more than 90 days in the future' };
  }

  return { valid: true, value: dateString };
}

/**
 * Validate amount (positive number, max $1000)
 */
export function validateAmount(amount: number | string): {
  valid: boolean;
  error?: string;
  value?: number;
} {
  if (amount === null || amount === undefined) {
    return { valid: false, error: 'Amount is required' };
  }

  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) {
    return { valid: false, error: 'Amount must be a valid number' };
  }

  if (numAmount <= 0) {
    return { valid: false, error: 'Amount must be greater than 0' };
  }

  if (numAmount > 1000) {
    return { valid: false, error: 'Amount cannot exceed $1000' };
  }

  // Round to 2 decimal places
  const rounded = Math.round(numAmount * 100) / 100;

  return { valid: true, value: rounded };
}

/**
 * Validate order number format (ORD-YYYYMMDD-XXXXXX or similar)
 */
export function validateOrderNumber(orderNumber: string): {
  valid: boolean;
  error?: string;
  value?: string;
} {
  if (!orderNumber || typeof orderNumber !== 'string') {
    return { valid: false, error: 'Order number is required and must be a string' };
  }

  // Pattern: ORD- followed by alphanumeric characters
  const pattern = /^ORD-[A-Z0-9]+-[A-Z0-9]+$/i;
  if (!pattern.test(orderNumber)) {
    return { valid: false, error: 'Invalid order number format' };
  }

  return { valid: true, value: orderNumber.toUpperCase() };
}

/**
 * Sanitize string input to prevent XSS
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;

  // Remove HTML tags
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item)) as T;
  }

  if (typeof obj === 'object') {
    const sanitized = {} as T;
    for (const [key, value] of Object.entries(obj)) {
      (sanitized as any)[key] = sanitizeObject(value);
    }
    return sanitized;
  }

  if (typeof obj === 'string') {
    return sanitizeString(obj) as T;
  }

  return obj;
}



