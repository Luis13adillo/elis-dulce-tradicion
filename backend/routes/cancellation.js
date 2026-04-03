import express from 'express';
import pool from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import Stripe from 'stripe';

const router = express.Router();

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
});

/**
 * Get cancellation policy for an order
 * GET /api/orders/:id/cancellation-policy
 */
router.get('/:id/cancellation-policy', async (req, res) => {
  try {
    const { id } = req.params;
    const { hours } = req.query;

    if (!hours) {
      return res.status(400).json({ error: 'hours parameter is required' });
    }

    const hoursBefore = parseFloat(hours);

    // Get applicable policy
    const result = await pool.query(
      `SELECT * FROM get_cancellation_policy($1)`,
      [hoursBefore]
    );

    if (result.rows.length === 0) {
      return res.json({
        hours_before_needed: 0,
        refund_percentage: 0,
        description: 'No refund available',
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching cancellation policy:', error);
    res.status(500).json({ error: 'Failed to fetch cancellation policy' });
  }
});

/**
 * Cancel order (customer)
 * POST /api/orders/:id/cancel
 */
router.post('/:id/cancel', requireAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { reason, reasonDetails } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    // Get order
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const oldStatus = order.status; // Store old status before updating

    // Verify order belongs to user
    if (order.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden: Order does not belong to user' });
    }

    // Check if already cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    // Validate cancellation
    const hoursUntilNeeded = calculateHoursUntilNeeded(order);
    const inProgressStatuses = ['in_oven', 'decorating', 'ready'];
    
    if (inProgressStatuses.includes(order.status)) {
      return res.status(400).json({ 
        error: 'Order is in progress. Please contact support to cancel.' 
      });
    }

    if (hoursUntilNeeded < 24) {
      return res.status(400).json({ 
        error: 'Orders cannot be cancelled within 24 hours of pickup/delivery time. Please contact support.' 
      });
    }

    // Calculate refund
    const refundResult = await client.query(
      'SELECT * FROM calculate_refund_amount($1, $2)',
      [order.total_amount, hoursUntilNeeded]
    );
    const refundAmount = parseFloat(refundResult.rows[0]?.calculate_refund_amount || 0);

    // Get policy
    const policyResult = await client.query(
      'SELECT * FROM get_cancellation_policy($1)',
      [hoursUntilNeeded]
    );
    const policy = policyResult.rows[0];

    // Update order
    await client.query(
      `UPDATE orders 
       SET status = 'cancelled',
           cancellation_reason = $1,
           cancelled_by = $2,
           cancelled_at = CURRENT_TIMESTAMP,
           refund_amount = $3,
           refund_status = $4
       WHERE id = $5`,
      [
        `${reason}${reasonDetails ? ': ' + reasonDetails : ''}`,
        userId,
        refundAmount,
        refundAmount > 0 ? 'pending' : 'not_applicable',
        id
      ]
    );

    // Create refund record if applicable
    let refundId = null;
    if (refundAmount > 0 && order.stripe_payment_id) {
      const refundInsert = await client.query(
        `INSERT INTO refunds (
          order_id, payment_id, square_payment_id, refund_amount, 
          refund_percentage, refund_reason, refund_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          id,
          order.payment_id,
          order.stripe_payment_id,
          refundAmount,
          policy?.refund_percentage || 0,
          reason,
          'pending'
        ]
      );
      refundId = refundInsert.rows[0]?.id;
    }

    // Add to status history
    await client.query(
      `INSERT INTO order_status_history (
        order_id, status, notes, cancelled_by, cancellation_reason, refund_amount
      ) VALUES ($1, 'cancelled', $2, $3, $4, $5)`,
      [
        id,
        `Order cancelled by customer. Reason: ${reason}`,
        userId,
        reason,
        refundAmount
      ]
    );

    await client.query('COMMIT');

    // Process refund if applicable
    if (refundAmount > 0 && order.stripe_payment_id && refundId) {
      try {
        await processStripeRefund(order.stripe_payment_id, refundAmount, reason, refundId, client);
      } catch (refundError) {
        console.error('Error processing refund:', refundError);
        // Don't fail the cancellation if refund fails
      }
    }

    // Send cancellation email notification
    try {
      const { sendStatusUpdateEmail } = await import('../utils/edgeFunctions.js');
      await sendStatusUpdateEmail({
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_language: order.customer_language,
        old_status: order.status,
        new_status: 'cancelled',
        date_needed: order.date_needed,
        time_needed: order.time_needed,
        delivery_option: order.delivery_option,
        notes: `Cancellation reason: ${reason}${refundAmount > 0 ? `. Refund amount: $${refundAmount.toFixed(2)}` : ''}`,
      }, order.status);
    } catch (emailError) {
      console.error('Error sending cancellation email:', emailError);
      // Don't fail the cancellation if email fails
    }

    res.json({
      success: true,
      refund: {
        refundAmount,
        refundPercentage: policy?.refund_percentage || 0,
        refundStatus: refundAmount > 0 ? 'pending' : 'not_applicable',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

/**
 * Cancel order (admin override)
 * POST /api/orders/:id/admin-cancel
 */
router.post('/:id/admin-cancel', requireAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { reason, reasonDetails, overrideRefundAmount, adminNotes } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Verify user is admin
    const userCheck = await client.query(
      'SELECT role FROM profiles WHERE id = $1',
      [userId]
    );

    if (!['owner', 'baker'].includes(userCheck.rows[0]?.role)) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    if (!reason) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    // Get order
    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1',
      [id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];
    const oldStatus = order.status; // Store old status before updating

    // Check if already cancelled
    if (order.status === 'cancelled') {
      return res.status(400).json({ error: 'Order is already cancelled' });
    }

    // Calculate refund (use override if provided)
    let refundAmount = 0;
    let refundPercentage = 0;

    if (overrideRefundAmount !== undefined && overrideRefundAmount !== null) {
      refundAmount = parseFloat(overrideRefundAmount);
      refundPercentage = order.total_amount > 0 
        ? (refundAmount / order.total_amount) * 100 
        : 0;
    } else {
      const hoursUntilNeeded = calculateHoursUntilNeeded(order);
      const refundResult = await client.query(
        'SELECT * FROM calculate_refund_amount($1, $2)',
        [order.total_amount, hoursUntilNeeded]
      );
      refundAmount = parseFloat(refundResult.rows[0]?.calculate_refund_amount || 0);

      const policyResult = await client.query(
        'SELECT * FROM get_cancellation_policy($1)',
        [hoursUntilNeeded]
      );
      refundPercentage = parseFloat(policyResult.rows[0]?.refund_percentage || 0);
    }

    // Update order
    await client.query(
      `UPDATE orders 
       SET status = 'cancelled',
           cancellation_reason = $1,
           cancelled_by = $2,
           cancelled_at = CURRENT_TIMESTAMP,
           refund_amount = $3,
           refund_status = $4,
           admin_cancellation_notes = $5
       WHERE id = $6`,
      [
        `${reason}${reasonDetails ? ': ' + reasonDetails : ''}`,
        userId,
        refundAmount,
        refundAmount > 0 ? 'pending' : 'not_applicable',
        adminNotes || null,
        id
      ]
    );

    // Create refund record if applicable
    let refundId = null;
    if (refundAmount > 0 && order.stripe_payment_id) {
      const refundInsert = await client.query(
        `INSERT INTO refunds (
          order_id, payment_id, square_payment_id, refund_amount, 
          refund_percentage, refund_reason, refund_status, processed_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          id,
          order.payment_id,
          order.stripe_payment_id,
          refundAmount,
          refundPercentage,
          reason,
          'pending',
          userId
        ]
      );
      refundId = refundInsert.rows[0]?.id;
    }

    // Add to status history
    await client.query(
      `INSERT INTO order_status_history (
        order_id, status, notes, cancelled_by, cancellation_reason, refund_amount
      ) VALUES ($1, 'cancelled', $2, $3, $4, $5)`,
      [
        id,
        `Order cancelled by admin. ${adminNotes || ''}`,
        userId,
        reason,
        refundAmount
      ]
    );

    await client.query('COMMIT');

    // Process refund if applicable
    if (refundAmount > 0 && order.stripe_payment_id && refundId) {
      try {
        await processStripeRefund(order.stripe_payment_id, refundAmount, reason, refundId, client);
      } catch (refundError) {
        console.error('Error processing refund:', refundError);
        // Don't fail the cancellation if refund fails
      }
    }

    // Send cancellation email notification
    try {
      const { sendStatusUpdateEmail } = await import('../utils/edgeFunctions.js');
      await sendStatusUpdateEmail({
        order_number: order.order_number,
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_language: order.customer_language,
        old_status: order.status,
        new_status: 'cancelled',
        date_needed: order.date_needed,
        time_needed: order.time_needed,
        delivery_option: order.delivery_option,
        notes: `Cancellation reason: ${reason}${refundAmount > 0 ? `. Refund amount: $${refundAmount.toFixed(2)}${adminNotes ? `. Admin notes: ${adminNotes}` : ''}` : ''}`,
      }, oldStatus);
    } catch (emailError) {
      console.error('Error sending cancellation email:', emailError);
      // Don't fail the cancellation if email fails
    }

    res.json({
      success: true,
      refund: {
        refundAmount,
        refundPercentage,
        refundStatus: refundAmount > 0 ? 'pending' : 'not_applicable',
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error cancelling order (admin):', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  } finally {
    client.release();
  }
});

/**
 * Helper function to calculate hours until needed
 */
function calculateHoursUntilNeeded(order) {
  if (!order.date_needed || !order.time_needed) {
    return Infinity;
  }

  const neededDateTime = new Date(`${order.date_needed}T${order.time_needed}`);
  const now = new Date();
  const diffMs = neededDateTime.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  return Math.max(0, diffHours);
}

/**
 * Process Stripe refund
 */
async function processStripeRefund(stripePaymentId, amount, reason, refundId, dbClient) {
  try {
    const refund = await stripe.refunds.create({
      payment_intent: stripePaymentId,
      amount: Math.round(amount * 100), // Convert to cents
      reason: 'requested_by_customer',
      metadata: { refund_id: String(refundId), cancellation_reason: reason },
    });

    // Update refund record
    await dbClient.query(
      `UPDATE refunds
       SET stripe_refund_id = $1,
           refund_status = $2,
           processed_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        refund.id,
        refund.status === 'succeeded' ? 'processed' : 'pending',
        refundId
      ]
    );

    // Update order refund status
    await dbClient.query(
      `UPDATE orders
       SET refund_status = $1,
           refund_processed_at = CURRENT_TIMESTAMP
       WHERE stripe_payment_id = $2`,
      [
        refund.status === 'succeeded' ? 'processed' : 'pending',
        stripePaymentId
      ]
    );

    return {
      success: true,
      stripeRefundId: refund.id,
      status: refund.status,
    };
  } catch (error) {
    console.error('Stripe refund error:', error);

    // Update refund status to failed
    await dbClient.query(
      `UPDATE refunds
       SET refund_status = 'failed'
       WHERE id = $1`,
      [refundId]
    );

    throw error;
  }
}

export default router;
