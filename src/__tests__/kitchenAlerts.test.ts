import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  isAwaitingAcceptance,
  unacceptedPaidOrders,
  shouldBeep,
  isOverdueForSms,
  SMS_BACKUP_AFTER_MS,
} from '@/lib/kitchenAlerts';

const NOW = Date.parse('2026-10-27T18:00:00Z');
const order = (o: Partial<{ status: string; payment_status: string; created_at: string }> = {}) => ({
  id: 1,
  status: 'pending',
  payment_status: 'paid',
  created_at: new Date(NOW - 60_000).toISOString(),
  ...o,
});

describe('kitchen acceptance alerts', () => {
  it('only paid + pending orders are awaiting acceptance', () => {
    expect(isAwaitingAcceptance(order())).toBe(true);
    expect(isAwaitingAcceptance(order({ status: 'confirmed' }))).toBe(false);
    expect(isAwaitingAcceptance(order({ status: 'cancelled' }))).toBe(false);
    expect(isAwaitingAcceptance(order({ payment_status: 'pending' }))).toBe(false);
  });

  it('beeps while any paid order is unaccepted and sound is on', () => {
    expect(shouldBeep([order({ status: 'confirmed' }), order()], true)).toBe(true);
    expect(shouldBeep([order()], false)).toBe(false);
    expect(shouldBeep([order({ status: 'confirmed' })], true)).toBe(false);
    expect(unacceptedPaidOrders([order(), order({ status: 'ready' })])).toHaveLength(1);
  });

  it('flags the backup SMS only after 3 minutes', () => {
    expect(isOverdueForSms(order({ created_at: new Date(NOW - SMS_BACKUP_AFTER_MS + 1000).toISOString() }), NOW)).toBe(false);
    expect(isOverdueForSms(order({ created_at: new Date(NOW - SMS_BACKUP_AFTER_MS).toISOString() }), NOW)).toBe(true);
    expect(isOverdueForSms(order({ status: 'confirmed', created_at: new Date(NOW - 3_600_000).toISOString() }), NOW)).toBe(false);
  });

  it('SMS is off unless SMS_ENABLED is exactly true (source guard)', () => {
    const sms = readFileSync(resolve(__dirname, '../../supabase/functions/_shared/sms.ts'), 'utf8');
    expect(sms).toContain('if (!smsEnabled(env)) return disabledProvider;');
    const fn = readFileSync(resolve(__dirname, '../../supabase/functions/kitchen-acceptance-alerts/index.ts'), 'utf8');
    expect(fn).toContain('.is("kitchen_alert_sms_at", null)');
    expect(fn).toContain('x-cron-secret');
  });
});
