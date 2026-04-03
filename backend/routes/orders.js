import express from 'express';
import pool from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { validateOrder, validateOrderUpdate, validateOrderNumberParam } from '../middleware/validation.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = express.Router();

// Generate unique order number
function generateOrderNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

/**
 * @swagger
 * /api/v1/orders:
 *   get:
 *     summary: Get all orders
 *     description: Retrieve a list of orders with optional filtering and pagination. Requires authentication.
 *     tags: [Orders]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, confirmed, in_progress, ready, out_for_delivery, delivered, completed, cancelled]
 *         description: Filter orders by status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Maximum number of orders to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of orders to skip
 *     responses:
 *       200:
 *         description: List of orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Order'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 */
// Get all orders (Protected)
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const { status, limit = 50, offset = 0 } = req.query;
  
  // Validate limit and offset
  const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100
  const offsetNum = Math.max(parseInt(offset) || 0, 0);
  
  let query = `
    SELECT o.*, 
           p.square_payment_id, 
           p.amount as payment_amount,
           p.status as payment_status_detail
    FROM orders o
    LEFT JOIN payments p ON o.id = p.order_id
  `;
  
  const params = [];
  if (status) {
    // Validate status parameter to prevent SQL injection
    const validStatuses = ['pending', 'confirmed', 'in_progress', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled'];
    const sanitizedStatus = String(status).toLowerCase().trim();
    if (!validStatuses.includes(sanitizedStatus)) {
      return sendError(res, { code: 'INVALID_STATUS', message: 'Invalid status value' }, 400);
    }
    query += ` WHERE o.status = $1`;
    params.push(sanitizedStatus); // Use parameterized query - safe from SQL injection
  }
  
  query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limitNum, offsetNum);
  
  const result = await pool.query(query, params);
  return sendSuccess(res, result.rows);
}));

// Get single order by ID (Protected)
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  // Validate ID is a number
  const orderId = parseInt(id);
  if (isNaN(orderId)) {
    return sendError(res, { code: 'INVALID_ID', message: 'Order ID must be a number' }, 400);
  }
  
  const result = await pool.query(
    `SELECT o.*, 
            p.square_payment_id, 
            p.amount as payment_amount,
            p.status as payment_status_detail
     FROM orders o
     LEFT JOIN payments p ON o.id = p.order_id
     WHERE o.id = $1`,
    [orderId]
  );
  
  if (result.rows.length === 0) {
    return sendError(res, { code: 'NOT_FOUND', message: 'Order not found' }, 404);
  }
  
  // Check if user has access to this order
  const order = result.rows[0];
  const isAdmin = req.user?.isAdmin || ['owner', 'baker'].includes(req.user?.role);
  
  if (!isAdmin && order.user_id !== req.user?.id) {
    return sendError(res, { code: 'FORBIDDEN', message: 'Access denied' }, 403);
  }
  
  return sendSuccess(res, order);
}));

// Get order by order number (Public for customer tracking)
router.get('/number/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const result = await pool.query(
      `SELECT o.*, 
              p.square_payment_id, 
              p.amount as payment_amount,
              p.status as payment_status_detail
       FROM orders o
       LEFT JOIN payments p ON o.id = p.order_id
       WHERE o.order_number = $1`,
      [orderNumber]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Create order (after payment confirmation)
router.post('/', validateOrder, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_language,
      date_needed,
      time_needed,
      cake_size,
      filling,
      theme,
      dedication,
      delivery_option,
      delivery_address,
      delivery_apartment,
      delivery_zone,
      payment_id,
      square_payment_id,
      total_amount,
      status = 'pending',
      user_id, // Optional: for authenticated users
      save_address, // Optional: save address to profile
      address_label, // Optional: label for saved address
      cake_size_value, // New: value slug from Order.tsx (e.g. '8-round')
      filling_values,  // New: array of filling value slugs e.g. ['strawberry', 'tiramisu']
    } = req.body;

    // Server-side price validation (SEC-02)
    // Only validate when cake_size_value is provided (skip for legacy orders without it)
    if (cake_size_value) {
      try {
        // Look up expected base price from DB
        const sizeResult = await client.query(
          'SELECT price FROM cake_sizes WHERE value = $1 AND active = true',
          [cake_size_value]
        );

        if (sizeResult.rows.length > 0) {
          let expectedTotal = parseFloat(sizeResult.rows[0].price);

          // Check if any selected fillings are premium
          const hasPremiumFilling = Array.isArray(filling_values) && filling_values.length > 0
            ? await (async () => {
                const premiumCheck = await client.query(
                  'SELECT COUNT(*) as cnt FROM cake_fillings WHERE value = ANY($1) AND is_premium = true',
                  [filling_values]
                );
                return parseInt(premiumCheck.rows[0].cnt) > 0;
              })()
            : false;

          // If premium filling selected, check if this size has an upcharge
          if (hasPremiumFilling) {
            const upchargeResult = await client.query(
              'SELECT upcharge FROM premium_filling_upcharges WHERE size_value = $1 AND active = true',
              [cake_size_value]
            );
            if (upchargeResult.rows.length > 0) {
              expectedTotal += parseFloat(upchargeResult.rows[0].upcharge);
            }
          }

          const clientTotal = parseFloat(total_amount);
          const mismatch = Math.abs(clientTotal - expectedTotal) > 0.01;

          if (mismatch) {
            // Log the mismatch for investigation
            await client.query(
              `INSERT INTO audit_logs (table_name, record_id, action, new_data)
               VALUES ('orders', 'PRICE_MISMATCH_DETECTED', 'INSERT', $1)`,
              [JSON.stringify({
                event: 'PRICE_MISMATCH_DETECTED',
                cake_size_value,
                filling_values: filling_values || [],
                client_total: clientTotal,
                expected_total: expectedTotal,
                has_premium_filling: hasPremiumFilling,
                customer_email,
                timestamp: new Date().toISOString(),
              })]
            );

            await client.query('ROLLBACK');
            return sendError(res, {
              code: 'ORDER_INVALID',
              message: 'Something went wrong, please try again'
            }, 400);
          }
        }
        // If cake_size_value not in DB (unexpected), skip validation and proceed
      } catch (validationError) {
        // If validation itself errors, log and proceed (don't block order creation)
        console.error('Price validation error (non-blocking):', validationError.message);
      }
    }

    const orderNumber = generateOrderNumber();
    
    // Determine delivery zone if delivery option
    let finalDeliveryZone = delivery_zone || null;
    if (delivery_option === 'delivery' && delivery_address && !finalDeliveryZone) {
      // Extract zip code and find zone
      const zipMatch = delivery_address.match(/\b\d{5}(-\d{4})?\b/);
      if (zipMatch) {
        const zoneResult = await client.query('SELECT * FROM find_delivery_zone($1)', [zipMatch[0]]);
        if (zoneResult.rows.length > 0) {
          finalDeliveryZone = zoneResult.rows[0].zone_name;
        }
      }
    }

    // Set delivery status
    const deliveryStatus = delivery_option === 'delivery' ? 'pending' : null;

    // Save address to customer profile if requested
    if (user_id && save_address && delivery_option === 'delivery' && delivery_address) {
      try {
        // Extract zip code, city, state from address
        const zipMatch = delivery_address.match(/\b\d{5}(-\d{4})?\b/);
        const zipCode = zipMatch ? zipMatch[0] : null;
        
        await client.query(
          `INSERT INTO customer_addresses (user_id, label, address, apartment, zip_code, is_default)
           VALUES ($1, $2, $3, $4, $5, false)
           ON CONFLICT (user_id, label) DO UPDATE
           SET address = EXCLUDED.address,
               apartment = EXCLUDED.apartment,
               zip_code = EXCLUDED.zip_code,
               updated_at = CURRENT_TIMESTAMP`,
          [user_id, address_label || 'Last Used', delivery_address, delivery_apartment || null, zipCode]
        );
      } catch (error) {
        console.error('Error saving address:', error);
        // Don't fail order creation if address save fails
      }
    }

    const orderResult = await client.query(
      `INSERT INTO orders (
        order_number, customer_name, customer_email, customer_phone, customer_language,
        date_needed, time_needed, cake_size, filling, theme, dedication,
        delivery_option, delivery_address, delivery_apartment, delivery_zone, delivery_status,
        payment_id, square_payment_id, total_amount, status, payment_status, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, 'paid', $21)
      RETURNING *`,
      [
        orderNumber, customer_name, customer_email, customer_phone, customer_language || 'en',
        date_needed, time_needed, cake_size, filling, theme, dedication || '',
        delivery_option, delivery_address || '', delivery_apartment || '', finalDeliveryZone, deliveryStatus,
        payment_id || null, square_payment_id, total_amount, status, user_id || null
      ]
    );
    
    const order = orderResult.rows[0];
    
    // Insert payment record if payment info provided
    if (square_payment_id && total_amount) {
      await client.query(
        `INSERT INTO payments (order_id, square_payment_id, amount, status)
         VALUES ($1, $2, $3, 'COMPLETED')`,
        [order.id, square_payment_id, total_amount]
      );
    }
    
    // Insert status history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes)
       VALUES ($1, $2, $3)`,
      [order.id, order.status, 'Order created']
    );
    
    await client.query('COMMIT');
    
    // Send order confirmation email (async, don't block response)
    try {
      const { sendOrderConfirmationEmail } = await import('../utils/edgeFunctions.js');
      sendOrderConfirmationEmail(order).catch((err) => {
        console.error('Error sending order confirmation email:', err);
        // Don't throw - email failures shouldn't block order creation
      });
    } catch (err) {
      console.error('Error importing edge function utility:', err);
    }
    
    // Send webhook notification (async, don't block response)
    try {
      const { sendOrderWebhook } = await import('../utils/webhook.js');
      sendOrderWebhook(order).catch((err) => {
        console.error('Error sending order webhook:', err);
        // Don't throw - webhook failures shouldn't block order creation
      });
    } catch (err) {
      console.error('Error importing webhook utility:', err);
    }
    
    return sendSuccess(res, order, 201);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error; // Let errorHandler middleware handle it
  } finally {
    client.release();
  }
});

// Update order status (Protected - Admin only)
router.patch('/:id/status', requireAuth, validateOrderUpdate, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { id } = req.params;
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'confirmed', 'in_progress', 'ready', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const updateFields = ['status = $1'];
    const params = [status, id];
    
    // Update ready_at timestamp if status is 'ready'
    if (status === 'ready') {
      updateFields.push('ready_at = CURRENT_TIMESTAMP');
    }
    
    // Update completed_at timestamp if status is 'completed'
    if (status === 'completed') {
      updateFields.push('completed_at = CURRENT_TIMESTAMP');
    }
    
    const result = await client.query(
      `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $2 RETURNING *`,
      params
    );
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Insert status history
    await client.query(
      `INSERT INTO order_status_history (order_id, status, notes)
       VALUES ($1, $2, $3)`,
      [id, status, notes || `Status changed to ${status}`]
    );
    
    await client.query('COMMIT');
    
    const updatedOrder = result.rows[0];
    
    // Clean up reference image if order is cancelled
    if (status === 'cancelled' && updatedOrder.reference_image_path) {
      try {
        const { deleteReferenceImage } = await import('../utils/imageCleanup.js');
        await deleteReferenceImage(updatedOrder.reference_image_path);
        console.log(`🗑️ Cleaned up image for cancelled order ${id}`);
      } catch (err) {
        console.error('Error cleaning up image for cancelled order:', err);
        // Don't fail the request if cleanup fails
      }
    }
    
    // Send email notifications based on status (async, don't block response)
    try {
      const { sendStatusUpdateEmail, sendReadyNotificationEmail } = await import('../utils/edgeFunctions.js');
      
      // Get old status from status history or request
      const oldStatus = req.body.oldStatus || 'pending';
      
      if (status === 'ready') {
        // Send ready notification
        sendReadyNotificationEmail(updatedOrder).catch((err) => {
          console.error('Error sending ready notification email:', err);
        });
        
        // Also send status update
        sendStatusUpdateEmail(updatedOrder, oldStatus).catch((err) => {
          console.error('Error sending status update email:', err);
        });
      } else if (status === 'cancelled') {
        // Send cancellation notification
        sendStatusUpdateEmail(updatedOrder, oldStatus).catch((err) => {
          console.error('Error sending cancellation email:', err);
        });
      } else {
        // Send general status update
        sendStatusUpdateEmail(updatedOrder, oldStatus).catch((err) => {
          console.error('Error sending status update email:', err);
        });
      }
    } catch (err) {
      console.error('Error importing edge function utilities:', err);
    }
    
    // Legacy: If status is 'ready', trigger Make.com webhook (keep for backward compatibility)
    if (status === 'ready') {
      try {
        const makeWebhookUrl = process.env.MAKE_COM_WEBHOOK_URL;
        if (makeWebhookUrl) {
          await fetch(`${process.env.BACKEND_URL || 'http://localhost:3001'}/api/webhooks/make-com/ready_notification`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: id, orderNumber: updatedOrder.order_number })
          });
        }
      } catch (err) {
        console.error('Error triggering Make.com webhook:', err);
      }
    }
    
    res.json(updatedOrder);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  } finally {
    client.release();
  }
}));

export default router;

