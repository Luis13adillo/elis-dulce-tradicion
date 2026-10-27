/**
 * Tests for Order State Machine
 */

import { describe, it, expect } from 'vitest';
import {
  canTransition,
  validateTransition,
  getAvailableTransitions,
  OrderStatus,
  UserRole,
} from '@/lib/orderStateMachine';

describe('Order State Machine', () => {
  const mockOrder = {
    id: 1,
    status: 'pending' as OrderStatus,
    payment_status: 'paid' as const,
    created_at: new Date().toISOString(),
    total_amount: 50,
  };

  describe('canTransition', () => {
    it('should allow owner to transition to any state', () => {
      expect(canTransition('pending', 'completed', 'owner')).toBe(true);
      expect(canTransition('completed', 'pending', 'owner')).toBe(true);
    });

    it('should allow admin to transition to any state', () => {
      expect(canTransition('pending', 'completed', 'admin')).toBe(true);
    });

    it('should allow customer to cancel before in_progress', () => {
      expect(canTransition('pending', 'cancelled', 'customer')).toBe(true);
      expect(canTransition('confirmed', 'cancelled', 'customer')).toBe(true);
      expect(canTransition('in_progress', 'cancelled', 'customer')).toBe(false);
    });

    it('should allow baker to move through workflow', () => {
      expect(canTransition('pending', 'confirmed', 'baker')).toBe(true);
      expect(canTransition('confirmed', 'in_progress', 'baker')).toBe(true);
      expect(canTransition('in_progress', 'ready', 'baker')).toBe(true);
      expect(canTransition('ready', 'completed', 'baker')).toBe(true);
    });

    it('should prevent baker from going backwards', () => {
      expect(canTransition('ready', 'in_progress', 'baker')).toBe(false);
      expect(canTransition('completed', 'ready', 'baker')).toBe(false);
    });
  });

  describe('validateTransition', () => {
    it('should validate payment requirement for confirmation', () => {
      const unpaidOrder = { ...mockOrder, payment_status: 'pending' as const };
      const result = validateTransition(
        'pending',
        'confirmed',
        unpaidOrder,
        { orderId: 1, userRole: 'baker' }
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Payment must be completed');
    });

    it('should require reason for cancellation', () => {
      const result = validateTransition(
        'pending',
        'cancelled',
        mockOrder,
        { orderId: 1, userRole: 'customer', reason: undefined }
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('reason is required');
    });

    it('should validate ready_at requirement for completion', () => {
      const result = validateTransition(
        'ready',
        'completed',
        { ...mockOrder, status: 'ready', ready_at: undefined },
        { orderId: 1, userRole: 'baker' }
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be marked as ready');
    });

    it('should allow valid transition with payment', () => {
      const result = validateTransition(
        'pending',
        'confirmed',
        mockOrder,
        { orderId: 1, userRole: 'baker' }
      );
      expect(result.valid).toBe(true);
    });

    it('should allow cancellation with reason', () => {
      const result = validateTransition(
        'pending',
        'cancelled',
        mockOrder,
        { orderId: 1, userRole: 'customer', reason: 'Changed my mind' }
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('getAvailableTransitions', () => {
    it('should return available transitions for baker', () => {
      const transitions = getAvailableTransitions(
        'pending',
        mockOrder,
        'baker'
      );
      expect(transitions).toContain('confirmed');
      expect(transitions).toContain('cancelled');
      expect(transitions).not.toContain('in_progress');
    });

    it('should return available transitions for customer', () => {
      const transitions = getAvailableTransitions(
        'pending',
        mockOrder,
        'customer'
      );
      expect(transitions).toContain('cancelled');
      expect(transitions).not.toContain('confirmed');
    });

    it('should return all transitions for owner', () => {
      const transitions = getAvailableTransitions(
        'pending',
        mockOrder,
        'owner'
      );
      expect(transitions.length).toBeGreaterThan(2);
    });

    it('should not return transitions from completed state', () => {
      const completedOrder = { ...mockOrder, status: 'completed' as OrderStatus };
      const transitions = getAvailableTransitions(
        'completed',
        completedOrder,
        'baker'
      );
      expect(transitions.length).toBe(0);
    });
  });

  describe('Business Rules', () => {
    it('should prevent backwards transition for non-admin', () => {
      const result = validateTransition(
        'ready',
        'in_progress',
        { ...mockOrder, status: 'ready' },
        { orderId: 1, userRole: 'baker' }
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('backwards');
    });

    it('should allow admin override for backwards transition', () => {
      const result = validateTransition(
        'ready',
        'in_progress',
        { ...mockOrder, status: 'ready' },
        { orderId: 1, userRole: 'owner' }
      );
      expect(result.valid).toBe(true);
    });
  });
});
