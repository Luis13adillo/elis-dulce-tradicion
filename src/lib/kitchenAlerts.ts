// Kitchen acceptance alerts — pure logic, no React or browser APIs.
//
// A paid online order lands in `orders` with status 'pending'. Until someone
// in the kitchen/front desk accepts it (pending -> confirmed), the dashboard
// keeps beeping. The server-side backup SMS (kitchen-acceptance-alerts Edge
// Function) uses the same rule with a 3-minute threshold.

export const BEEP_INTERVAL_MS = 15_000;
export const SMS_BACKUP_AFTER_MS = 3 * 60_000;

export interface AlertableOrder {
  id: string | number;
  status: string;
  payment_status?: string | null;
  created_at?: string | null;
}

/** Paid and still waiting for a human to accept it. */
export function isAwaitingAcceptance(order: AlertableOrder): boolean {
  return order.status === 'pending' && order.payment_status === 'paid';
}

export function unacceptedPaidOrders<T extends AlertableOrder>(orders: readonly T[]): T[] {
  return orders.filter(isAwaitingAcceptance);
}

/** True when the repeating beep should be running. */
export function shouldBeep(orders: readonly AlertableOrder[], soundEnabled: boolean): boolean {
  return soundEnabled && orders.some(isAwaitingAcceptance);
}

/** True when an order has waited long enough to warrant the backup SMS. */
export function isOverdueForSms(order: AlertableOrder, now: number = Date.now()): boolean {
  if (!isAwaitingAcceptance(order) || !order.created_at) return false;
  const created = Date.parse(order.created_at);
  if (Number.isNaN(created)) return false;
  return now - created >= SMS_BACKUP_AFTER_MS;
}
