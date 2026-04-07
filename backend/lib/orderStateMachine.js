/**
 * Order Status State Machine - Backend Implementation
 * Validates transitions and manages side effects
 */

const VALID_STATUSES = [
  'pending',
  'confirmed',
  'in_progress',
  'ready',
  'out_for_delivery',
  'delivered',
  'completed',
  'cancelled',
];

/**
 * Check if user has permission for transition
 */
function canTransition(from, to, role) {
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
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['ready', 'cancelled'],
      ready: ['out_for_delivery', 'completed', 'cancelled'],
      out_for_delivery: ['delivered', 'cancelled'],
      delivered: ['completed'],
      completed: [],
      cancelled: [],
    };
    return validTransitions[from]?.includes(to) ?? false;
  }

  return false;
}

/**
 * Validate transition based on business rules
 */
function validateTransition(from, to, order, context) {
  // Check permission
  if (!canTransition(from, to, context.userRole)) {
    return {
      valid: false,
      error: `User role '${context.userRole}' cannot transition from '${from}' to '${to}'`,
    };
  }

  // Business rule: Cannot go backwards (except admin override)
  const forwardOrder = ['pending', 'confirmed', 'in_progress', 'ready', 'out_for_delivery', 'delivered', 'completed'];
  const fromIndex = forwardOrder.indexOf(from);
  const toIndex = forwardOrder.indexOf(to);

  if (toIndex < fromIndex && context.userRole !== 'owner' && context.userRole !== 'admin') {
    return {
      valid: false,
      error: 'Cannot transition backwards in workflow',
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
function getAvailableTransitions(currentStatus, order, userRole) {
  return VALID_STATUSES.filter((toStatus) => {
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
 * Determine side effects for transition
 */
function getSideEffects(from, to, order = {}) {
  const sideEffects = {
    sendEmail: false,
    sendWebhook: false,
    updateMetrics: false,
    processRefund: false,
    emailType: null,
    webhookEvent: null,
  };

  switch (`${from} → ${to}`) {
    case 'pending → confirmed':
      sideEffects.sendEmail = true;
      sideEffects.emailType = 'order_confirmation';
      sideEffects.updateMetrics = true;
      break;

    case 'confirmed → in_progress':
      sideEffects.sendEmail = true;
      sideEffects.emailType = 'order_started';
      sideEffects.updateMetrics = true;
      break;

    case 'in_progress → ready':
      sideEffects.sendEmail = true;
      sideEffects.emailType = 'order_ready';
      sideEffects.sendWebhook = true;
      sideEffects.webhookEvent = 'order.ready';
      sideEffects.updateMetrics = true;
      break;

    case 'ready → out_for_delivery':
      sideEffects.sendEmail = true;
      sideEffects.emailType = 'out_for_delivery';
      sideEffects.updateMetrics = true;
      break;

    case 'out_for_delivery → delivered':
      sideEffects.sendEmail = true;
      sideEffects.emailType = 'delivered';
      sideEffects.updateMetrics = true;
      break;

    case 'ready → completed':
      sideEffects.sendEmail = true;
      sideEffects.emailType = 'order_completed';
      sideEffects.updateMetrics = true;
      break;

    case 'delivered → completed':
      sideEffects.sendEmail = true;
      sideEffects.emailType = 'order_completed';
      sideEffects.updateMetrics = true;
      break;

    default:
      if (to === 'cancelled') {
        sideEffects.sendEmail = true;
        sideEffects.emailType = 'order_cancelled';
        sideEffects.processRefund = order.payment_status === 'paid';
      }
      break;
  }

  return sideEffects;
}

/**
 * Calculate time metrics for transitions
 */
function calculateTimeMetrics(order, statusHistory) {
  const metrics = {
    time_to_confirm: null,
    time_to_ready: null,
    time_to_complete: null,
  };

  if (!statusHistory || statusHistory.length === 0) {
    return metrics;
  }

  // Sort history by created_at
  const sortedHistory = [...statusHistory].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const orderCreatedAt = new Date(order.created_at);

  // Find first confirmed status
  const confirmedEntry = sortedHistory.find((h) => h.status === 'confirmed');
  if (confirmedEntry) {
    metrics.time_to_confirm = Math.round(
      (new Date(confirmedEntry.created_at) - orderCreatedAt) / (1000 * 60)
    );
  }

  // Find first ready status
  const readyEntry = sortedHistory.find((h) => h.status === 'ready');
  if (readyEntry && confirmedEntry) {
    metrics.time_to_ready = Math.round(
      (new Date(readyEntry.created_at) - new Date(confirmedEntry.created_at)) / (1000 * 60)
    );
  }

  // Find completed status
  const completedEntry = sortedHistory.find((h) => h.status === 'completed');
  if (completedEntry && readyEntry) {
    metrics.time_to_complete = Math.round(
      (new Date(completedEntry.created_at) - new Date(readyEntry.created_at)) / (1000 * 60)
    );
  }

  return metrics;
}

export {
  VALID_STATUSES,
  canTransition,
  validateTransition,
  getAvailableTransitions,
  getSideEffects,
  calculateTimeMetrics,
};
