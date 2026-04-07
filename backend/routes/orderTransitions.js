/**
 * Order Status Transition Routes
 * Handles state machine transitions with validation and side effects
 */

import express from 'express';
import pool from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { sendSuccess, sendError } from '../utils/response.js';
import {
  validateTransition,
  getAvailableTransitions,
  getSideEffects,
  calculateTimeMetrics,
} from '../lib/orderStateMachine.js';

const router = express.Router();

/**
 * Get available transitions for an order
 * GET /api/v1/orders/:id/available-transitions
 */
router.get(
  '/:id/available-transitions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = req.user;

    // Get order
    const orderResult = await pool.query(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return sendError(res, { code: 'ORDER_NOT_FOUND', message: 'Order not found' }, 404);
    }

    const order = orderResult.rows[0];

    // Get user role
    const roleResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [user.id]
    );
    const userRole = roleResult.rows[0]?.role || 'customer';

    // Get available transitions
    const availableTransitions = getAvailableTransitions(
      order.status,
      order,
      userRole
    );

    return sendSuccess(res, {
      currentStatus: order.status,
      availableTransitions,
      userRole,
    });
  })
);

/**
 * Execute state transition
 * POST /api/v1/orders/:id/transition
 */
router.post(
  '/:id/transition',
  requireAuth,
  asyncHandler(async (req, res) => {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const { id } = req.params;
      const { targetStatus, reason, metadata } = req.body;
      const user = req.user;

      // Validate target status
      const validStatuses = [
        'pending',
        'confirmed',
        'in_progress',
        'ready',
        'out_for_delivery',
        'delivered',
        'completed',
        'cancelled',
      ];
      if (!validStatuses.includes(targetStatus)) {
        return sendError(
          res,
          { code: 'INVALID_STATUS', message: 'Invalid target status' },
          400
        );
      }

      // Get order
      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (orderResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return sendError(
          res,
          { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
          404
        );
      }

      const order = orderResult.rows[0];
      const previousStatus = order.status;

      // Get user role
      const roleResult = await client.query(
        'SELECT role FROM profiles WHERE id = $1',
        [user.id]
      );
      const userRole = roleResult.rows[0]?.role || 'customer';

      // Validate transition
      const validation = validateTransition(
        previousStatus,
        targetStatus,
        order,
        {
          orderId: parseInt(id),
          userId: user.id,
          userRole,
          reason,
          metadata,
        }
      );

      if (!validation.valid) {
        await client.query('ROLLBACK');
        return sendError(
          res,
          { code: 'INVALID_TRANSITION', message: validation.error },
          400
        );
      }

      // Get side effects
      const sideEffects = getSideEffects(previousStatus, targetStatus);

      // Update order status
      const updateFields = ['status = $1'];
      const updateValues = [targetStatus];
      let paramIndex = 2;

      // Set ready_at timestamp when marking as ready
      if (targetStatus === 'ready' && !order.ready_at) {
        updateFields.push(`ready_at = CURRENT_TIMESTAMP`);
      }
      if (targetStatus === 'out_for_delivery') {
        updateFields.push(`dispatched_at = CURRENT_TIMESTAMP`);
      }
      if (targetStatus === 'delivered') {
        updateFields.push(`delivered_at = CURRENT_TIMESTAMP`);
      }

      // Update time metrics
      if (sideEffects.updateMetrics) {
        // Get status history to calculate metrics
        const historyResult = await client.query(
          'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC',
          [id]
        );

        const metrics = calculateTimeMetrics(order, historyResult.rows);

        if (metrics.time_to_confirm !== null) {
          updateFields.push(`time_to_confirm = $${paramIndex}`);
          updateValues.push(metrics.time_to_confirm);
          paramIndex++;
        }
        if (metrics.time_to_ready !== null) {
          updateFields.push(`time_to_ready = $${paramIndex}`);
          updateValues.push(metrics.time_to_ready);
          paramIndex++;
        }
        if (metrics.time_to_complete !== null) {
          updateFields.push(`time_to_complete = $${paramIndex}`);
          updateValues.push(metrics.time_to_complete);
          paramIndex++;
        }
      }

      updateValues.push(parseInt(id));

      await client.query(
        `UPDATE orders SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramIndex}`,
        updateValues
      );

      // Insert status history with previous_status
      await client.query(
        `INSERT INTO order_status_history (
          order_id, previous_status, status, user_id, notes, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          previousStatus,
          targetStatus,
          user.id,
          reason || null,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      // Get updated order
      const updatedOrderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1',
        [id]
      );
      const updatedOrder = updatedOrderResult.rows[0];

      await client.query('COMMIT');

      // Execute side effects (async, don't block response)
      executeSideEffects(sideEffects, updatedOrder, previousStatus, reason).catch(
        (err) => {
          console.error('Error executing side effects:', err);
        }
      );

      return sendSuccess(res, {
        success: true,
        previousStatus,
        newStatus: targetStatus,
        order: updatedOrder,
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  })
);

/**
 * Get transition history for an order
 * GET /api/v1/orders/:id/transition-history
 */
router.get(
  '/:id/transition-history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Verify order exists
    const orderResult = await pool.query(
      'SELECT id FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return sendError(
        res,
        { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
        404
      );
    }

    // Get status history with user info
    const historyResult = await pool.query(
      `SELECT 
        osh.*,
        p.email as user_email,
        p.role as user_role
      FROM order_status_history osh
      LEFT JOIN profiles p ON osh.user_id = p.id
      WHERE osh.order_id = $1
      ORDER BY osh.created_at ASC`,
      [id]
    );

    return sendSuccess(res, historyResult.rows);
  })
);

/**
 * Execute side effects for transition
 */
async function executeSideEffects(sideEffects, order, previousStatus, reason) {
  // Send email
  if (sideEffects.sendEmail && sideEffects.emailType) {
    try {
      const { sendStatusUpdateEmail } = await import('../utils/edgeFunctions.js');
      await sendStatusUpdateEmail(order, sideEffects.emailType, {
        previousStatus,
        reason,
      });
    } catch (err) {
      console.error('Error sending email:', err);
    }
  }

  // Send webhook
  if (sideEffects.sendWebhook && sideEffects.webhookEvent) {
    try {
      const { triggerWebhook } = await import('../utils/webhooks.js');
      await triggerWebhook(sideEffects.webhookEvent, {
        order,
        previousStatus,
      });
    } catch (err) {
      console.error('Error triggering webhook:', err);
    }
  }

  // Process refund if needed
  if (sideEffects.processRefund && order.payment_status === 'paid') {
    try {
      // Refund logic would go here
      // This would integrate with Square API or payment processor
      console.log(`Refund processing needed for order ${order.id}`);
    } catch (err) {
      console.error('Error processing refund:', err);
    }
  }

  // Update customer stats when completed
  if (order.status === 'completed' && order.user_id) {
    try {
      await pool.query(
        `UPDATE profiles 
         SET total_orders = COALESCE(total_orders, 0) + 1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [order.user_id]
      );
    } catch (err) {
      console.error('Error updating customer stats:', err);
    }
  }
}

export default router;
