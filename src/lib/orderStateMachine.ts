/**
 * Order Status State Machine
 * Defines valid state transitions, guards, and actions for order status management
 */

import { createMachine, assign, type ActorRefFrom } from 'xstate';

// Order status types
export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'in_progress'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled';

// User roles
export type UserRole = 'customer' | 'baker' | 'owner' | 'admin';

// Transition context
export interface TransitionContext {
  orderId: number;
  userId?: string;
  userRole: UserRole;
  reason?: string;
  metadata?: Record<string, any>;
}

// Order data required for validation
export interface OrderData {
  id: number;
  status: OrderStatus;
  payment_status?: 'pending' | 'paid' | 'refunded' | 'failed';
  date_needed?: string;
  time_needed?: string;
  ready_at?: string;
  completed_at?: string;
  created_at: string;
  total_amount?: number;
  // Time metrics (populated by DB trigger/RPC)
  time_to_confirm?: number;
  time_to_ready?: number;
  time_to_complete?: number;
}

// Transition result
export interface TransitionResult {
  success: boolean;
  newStatus: OrderStatus;
  previousStatus: OrderStatus;
  error?: string;
  metadata?: Record<string, any>;
}

// State machine context
interface OrderStateContext {
  order: OrderData;
  transitionContext?: TransitionContext;
  error?: string;
}

// State machine events
type OrderStateEvent =
  | { type: 'CONFIRM'; context: TransitionContext }
  | { type: 'START'; context: TransitionContext }
  | { type: 'MARK_READY'; context: TransitionContext }
  | { type: 'COMPLETE'; context: TransitionContext }
  | { type: 'CANCEL'; context: TransitionContext; reason: string }
  | { type: 'ADMIN_OVERRIDE'; context: TransitionContext; targetStatus: OrderStatus };

/**
 * Check if user has permission for transition
 */
export function canTransition(
  from: OrderStatus,
  to: OrderStatus,
  role: UserRole
): boolean {
  // Owners and admins can do anything
  if (role === 'owner' || role === 'admin') {
    return true;
  }

  // Customers can only cancel (before in_progress)
  if (role === 'customer') {
    return to === 'cancelled' && ['pending', 'confirmed'].includes(from);
  }

  // Bakers can move through workflow
  if (role === 'baker') {
    const validTransitions: Record<OrderStatus, OrderStatus[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['ready', 'cancelled'],
      ready: ['completed', 'cancelled'],
      completed: [], // Cannot transition from completed
      cancelled: [], // Cannot transition from cancelled
    };
    return validTransitions[from]?.includes(to) ?? false;
  }

  return false;
}

/**
 * Validate transition based on business rules
 */
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus,
  order: OrderData,
  context: TransitionContext
): { valid: boolean; error?: string } {
  // Business rule: Cannot go backwards (except admin/owner override)
  // cancelled is not a "backward" step — it is always valid directionally
  const forwardOrder: OrderStatus[] = [
    'pending',
    'confirmed',
    'in_progress',
    'ready',
    'completed',
  ];
  const fromIndex = forwardOrder.indexOf(from);
  const toIndex = forwardOrder.indexOf(to);

  if (
    toIndex >= 0 &&
    toIndex < fromIndex &&
    context.userRole !== 'owner' &&
    context.userRole !== 'admin'
  ) {
    return {
      valid: false,
      error: 'Cannot transition backwards in workflow',
    };
  }

  // Check permission
  if (!canTransition(from, to, context.userRole)) {
    return {
      valid: false,
      error: `User role '${context.userRole}' cannot transition from '${from}' to '${to}'`,
    };
  }

  // Specific transition validations
  switch (to) {
    case 'confirmed':
      // Payment must be complete before confirming
      if (order.payment_status !== 'paid') {
        return {
          valid: false,
          error: 'Payment must be completed before confirming order',
        };
      }
      break;

    case 'completed':
      // Must have ready_at timestamp
      if (!order.ready_at) {
        return {
          valid: false,
          error: 'Order must be marked as ready before completing',
        };
      }
      break;

    case 'cancelled':
      // Reason required for cancellation
      if (!context.reason || context.reason.trim().length === 0) {
        return {
          valid: false,
          error: 'Cancellation reason is required',
        };
      }
      break;
  }

  return { valid: true };
}

/**
 * Get available transitions for an order
 */
export function getAvailableTransitions(
  currentStatus: OrderStatus,
  order: OrderData,
  userRole: UserRole
): OrderStatus[] {
  const allTransitions: OrderStatus[] = [
    'pending',
    'confirmed',
    'in_progress',
    'ready',
    'completed',
    'cancelled',
  ];

  return allTransitions.filter((toStatus) => {
    // Check if transition is valid
    const validation = validateTransition(
      currentStatus,
      toStatus,
      order,
      {
        orderId: order.id,
        userRole,
        reason: toStatus === 'cancelled' ? 'placeholder' : undefined,
      }
    );
    return validation.valid;
  });
}

/**
 * Calculate time metrics for an order
 * These values are pre-calculated by the database RPC (transition_order_status)
 * and stored directly on the order record.
 */
export function calculateTimeMetrics(order: OrderData): {
  timeToConfirm?: number; // minutes
  timeToReady?: number; // minutes
  timeToComplete?: number; // minutes
} {
  return {
    timeToConfirm: order.time_to_confirm,
    timeToReady: order.time_to_ready,
    timeToComplete: order.time_to_complete,
  };
}

/**
 * XState Machine Definition
 */
export const orderStateMachine = createMachine<OrderStateContext, OrderStateEvent>(
  {
    id: 'orderStatus',
    initial: 'pending',
    context: {
      order: {} as OrderData,
    },
    states: {
      pending: {
        on: {
          CONFIRM: {
            target: 'confirmed',
            guard: 'canConfirm',
            actions: 'onConfirm',
          },
          CANCEL: {
            target: 'cancelled',
            guard: 'hasReason',
            actions: 'onCancel',
          },
        },
      },
      confirmed: {
        on: {
          START: {
            target: 'in_progress',
            guard: 'canStart',
            actions: 'onStart',
          },
          CANCEL: {
            target: 'cancelled',
            guard: 'hasReason',
            actions: 'onCancel',
          },
        },
      },
      in_progress: {
        on: {
          MARK_READY: {
            target: 'ready',
            guard: 'canMarkReady',
            actions: 'onMarkReady',
          },
          CANCEL: {
            target: 'cancelled',
            guard: 'hasReason',
            actions: 'onCancel',
          },
        },
      },
      ready: {
        on: {
          COMPLETE: {
            target: 'completed',
            guard: 'canComplete',
            actions: 'onComplete',
          },
          CANCEL: {
            target: 'cancelled',
            guard: 'hasReason',
            actions: 'onCancel',
          },
        },
      },
      completed: {
        type: 'final',
        on: {
          ADMIN_OVERRIDE: {
            actions: 'onAdminOverride',
          },
        },
      },
      cancelled: {
        type: 'final',
        on: {
          ADMIN_OVERRIDE: {
            actions: 'onAdminOverride',
          },
        },
      },
    },
  },
  {
    guards: {
      canConfirm: ({ context, event }) => {
        if (event.type !== 'CONFIRM') return false;
        const validation = validateTransition(
          'pending',
          'confirmed',
          context.order,
          event.context
        );
        return validation.valid;
      },
      canStart: ({ context, event }) => {
        if (event.type !== 'START') return false;
        const validation = validateTransition(
          'confirmed',
          'in_progress',
          context.order,
          event.context
        );
        return validation.valid;
      },
      canMarkReady: ({ context, event }) => {
        if (event.type !== 'MARK_READY') return false;
        const validation = validateTransition(
          'in_progress',
          'ready',
          context.order,
          event.context
        );
        return validation.valid;
      },
      canComplete: ({ context, event }) => {
        if (event.type !== 'COMPLETE') return false;
        const validation = validateTransition(
          'ready',
          'completed',
          context.order,
          event.context
        );
        return validation.valid;
      },
      hasReason: ({ event }) => {
        return event.type === 'CANCEL' && !!event.reason && event.reason.trim().length > 0;
      },
    },
    actions: {
      onConfirm: assign({
        order: ({ context }) => ({
          ...context.order,
          status: 'confirmed',
        }),
      }),
      onStart: assign({
        order: ({ context }) => ({
          ...context.order,
          status: 'in_progress',
        }),
      }),
      onMarkReady: assign({
        order: ({ context }) => ({
          ...context.order,
          status: 'ready',
          ready_at: new Date().toISOString(),
        }),
      }),
      onComplete: assign({
        order: ({ context }) => ({
          ...context.order,
          status: 'completed',
        }),
      }),
      onCancel: assign({
        order: ({ context }) => ({
          ...context.order,
          status: 'cancelled',
        }),
      }),
      onAdminOverride: assign({
        order: ({ context, event }) => {
          if (event.type === 'ADMIN_OVERRIDE') {
            return {
              ...context.order,
              status: event.targetStatus,
            };
          }
          return context.order;
        },
      }),
    },
  }
);

export type OrderStateActor = ActorRefFrom<typeof orderStateMachine>;
