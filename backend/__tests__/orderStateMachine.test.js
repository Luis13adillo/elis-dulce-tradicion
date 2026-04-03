/**
 * Backend tests for Order State Machine
 */

const {
  canTransition,
  validateTransition,
  getAvailableTransitions,
  getSideEffects,
  calculateTimeMetrics,
} = require('../lib/orderStateMachine');

describe('Order State Machine - Backend', () => {
  const mockOrder = {
    id: 1,
    status: 'pending',
    payment_status: 'paid',
    created_at: new Date().toISOString(),
    total_amount: 50,
  };

  describe('canTransition', () => {
    it('should allow owner to transition to any state', () => {
      expect(canTransition('pending', 'completed', 'owner')).toBe(true);
    });

    it('should allow baker to move through workflow', () => {
      expect(canTransition('pending', 'confirmed', 'baker')).toBe(true);
      expect(canTransition('confirmed', 'in_progress', 'baker')).toBe(true);
    });

    it('should prevent customer from confirming', () => {
      expect(canTransition('pending', 'confirmed', 'customer')).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should validate payment requirement', () => {
      const unpaidOrder = { ...mockOrder, payment_status: 'pending' };
      const result = validateTransition(
        'pending',
        'confirmed',
        unpaidOrder,
        { orderId: 1, userRole: 'baker' }
      );
      expect(result.valid).toBe(false);
    });

    it('should require reason for cancellation', () => {
      const result = validateTransition(
        'pending',
        'cancelled',
        mockOrder,
        { orderId: 1, userRole: 'customer' }
      );
      expect(result.valid).toBe(false);
    });
  });

  describe('getSideEffects', () => {
    it('should return email for pending → confirmed', () => {
      const effects = getSideEffects('pending', 'confirmed');
      expect(effects.sendEmail).toBe(true);
      expect(effects.emailType).toBe('order_confirmation');
    });

    it('should return webhook for in_progress → ready', () => {
      const effects = getSideEffects('in_progress', 'ready');
      expect(effects.sendWebhook).toBe(true);
      expect(effects.webhookEvent).toBe('order.ready');
    });

    it('should return refund flag for cancellation', () => {
      const paidOrder = { ...mockOrder, payment_status: 'paid' };
      const effects = getSideEffects('pending', 'cancelled', paidOrder);
      expect(effects.processRefund).toBe(true);
    });
  });

  describe('calculateTimeMetrics', () => {
    it('should calculate time to confirm', () => {
      const order = {
        ...mockOrder,
        created_at: new Date('2024-01-01T10:00:00').toISOString(),
      };
      const history = [
        {
          status: 'confirmed',
          created_at: new Date('2024-01-01T10:30:00').toISOString(),
        },
      ];
      const metrics = calculateTimeMetrics(order, history);
      expect(metrics.time_to_confirm).toBe(30);
    });

    it('should calculate time to ready', () => {
      const order = {
        ...mockOrder,
        created_at: new Date('2024-01-01T10:00:00').toISOString(),
      };
      const history = [
        {
          status: 'confirmed',
          created_at: new Date('2024-01-01T10:30:00').toISOString(),
        },
        {
          status: 'ready',
          created_at: new Date('2024-01-01T12:00:00').toISOString(),
        },
      ];
      const metrics = calculateTimeMetrics(order, history);
      expect(metrics.time_to_ready).toBe(90);
    });
  });
});
