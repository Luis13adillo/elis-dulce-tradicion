import express from 'express';
import pool from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const BAKERY_LAT = 40.1063;
const BAKERY_LNG = -74.9526;
const MAX_DELIVERY_MILES = 4.5;

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Validate delivery address
 * POST /api/delivery/validate-address
 */
router.post('/validate-address', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }

    // Extract zip code from address (basic extraction)
    const zipMatch = address.match(/\b\d{5}(-\d{4})?\b/);
    const zipCode = zipMatch ? zipMatch[0] : null;

    if (!zipCode) {
      return res.json({
        isValid: false,
        error: 'Could not extract zip code from address',
        serviceable: false,
      });
    }

    // Find delivery zone by zip code
    const zoneResult = await pool.query(
      'SELECT * FROM find_delivery_zone($1)',
      [zipCode]
    );

    if (zoneResult.rows.length === 0) {
      return res.json({
        isValid: true,
        serviceable: false,
        error: 'Address is outside our delivery area',
        zipCode,
      });
    }

    const zone = zoneResult.rows[0];

    res.json({
      isValid: true,
      serviceable: true,
      zipCode,
      zone: {
        id: zone.id,
        name: zone.zone_name,
        base_fee: zone.base_fee,
        per_mile_rate: zone.per_mile_rate,
        max_distance_miles: zone.max_distance_miles,
        estimated_delivery_minutes: zone.estimated_delivery_minutes,
      },
    });
  } catch (error) {
    console.error('Error validating address:', error);
    res.status(500).json({ error: 'Failed to validate address' });
  }
});

/**
 * Calculate delivery fee
 * GET /api/delivery/calculate-fee?address=...&zipCode=...
 */
router.get('/calculate-fee', async (req, res) => {
  try {
    const { address, zipCode, lat, lng } = req.query;

    if (!address && !zipCode) {
      return res.status(400).json({ error: 'Address or zip code is required' });
    }

    // Haversine check — runs first if coordinates are provided
    if (lat !== undefined && lng !== undefined) {
      const parsedLat = parseFloat(lat);
      const parsedLng = parseFloat(lng);
      if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
        const dist = haversine(BAKERY_LAT, BAKERY_LNG, parsedLat, parsedLng);
        if (dist > MAX_DELIVERY_MILES) {
          return res.json({ serviceable: false, fee: 0, distance: Math.round(dist * 10) / 10 });
        }
      }
    }

    const zip = zipCode || (address ? address.match(/\b\d{5}(-\d{4})?\b/)?.[0] : null);

    if (!zip) {
      return res.status(400).json({ error: 'Could not determine zip code' });
    }

    // Find delivery zone
    const zoneResult = await pool.query(
      'SELECT * FROM find_delivery_zone($1)',
      [zip]
    );

    if (zoneResult.rows.length === 0) {
      return res.json({
        serviceable: false,
        error: 'Address is outside our delivery area',
        fee: 0,
      });
    }

    const zone = zoneResult.rows[0];

    // Calculate distance using zone-based estimation
    // In production, this would use Google Maps Distance Matrix API
    // For now, estimate based on zone
    let distance = 5.0; // Default distance
    
    // Estimate distance based on zone
    if (zone.max_distance_miles) {
      distance = parseFloat(zone.max_distance_miles) * 0.7; // Use 70% of max as estimate
    } else {
      // Default estimates by zone name
      if (zone.zone_name.includes('Local') || zone.zone_name.includes('0-5')) {
        distance = 3.0;
      } else if (zone.zone_name.includes('Nearby') || zone.zone_name.includes('5-10')) {
        distance = 7.5;
      } else if (zone.zone_name.includes('Extended') || zone.zone_name.includes('10-15')) {
        distance = 12.5;
      } else {
        distance = 20.0; // Long distance
      }
    }

    // Apply max distance limit if set
    if (zone.max_distance_miles && distance > zone.max_distance_miles) {
      distance = zone.max_distance_miles;
    }

    const baseFee = parseFloat(zone.base_fee);
    const perMileRate = parseFloat(zone.per_mile_rate);
    const deliveryFee = baseFee + (distance * perMileRate);

    res.json({
      serviceable: true,
      fee: Math.round(deliveryFee * 100) / 100,
      zone: {
        id: zone.id,
        name: zone.zone_name,
        estimated_delivery_minutes: zone.estimated_delivery_minutes,
      },
      distance: Math.round(distance * 10) / 10,
    });
  } catch (error) {
    console.error('Error calculating delivery fee:', error);
    res.status(500).json({ error: 'Failed to calculate delivery fee' });
  }
});

/**
 * Get all delivery zones
 * GET /api/delivery/zones
 */
router.get('/zones', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM delivery_zones WHERE active = true ORDER BY base_fee'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching delivery zones:', error);
    res.status(500).json({ error: 'Failed to fetch delivery zones' });
  }
});

/**
 * Update delivery status (admin/driver)
 * PATCH /api/delivery/orders/:id/delivery-status
 */
router.patch('/orders/:id/delivery-status', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_status, driver_notes, estimated_delivery_time } = req.body;

    if (!delivery_status) {
      return res.status(400).json({ error: 'delivery_status is required' });
    }

    const validStatuses = ['pending', 'assigned', 'in_transit', 'delivered', 'failed'];
    if (!validStatuses.includes(delivery_status)) {
      return res.status(400).json({ error: 'Invalid delivery status' });
    }

    // Verify user is admin or assigned driver
    const userResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user?.id]
    );

    const isAdmin = userResult.rows.length > 0 && 
                   ['owner', 'baker'].includes(userResult.rows[0].role);

    // Check if user is assigned driver
    const assignmentResult = await pool.query(
      'SELECT * FROM delivery_assignments WHERE order_id = $1 AND assigned_to = $2',
      [id, req.user?.id]
    );

    const isAssignedDriver = assignmentResult.rows.length > 0;

    if (!isAdmin && !isAssignedDriver) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Update order
    const updateFields = ['delivery_status = $1'];
    const values = [delivery_status];
    let paramCount = 2;

    if (driver_notes !== undefined) {
      updateFields.push(`driver_notes = $${paramCount++}`);
      values.push(driver_notes);
    }

    if (estimated_delivery_time) {
      updateFields.push(`estimated_delivery_time = $${paramCount++}`);
      values.push(estimated_delivery_time);
    }

    if (delivery_status === 'delivered') {
      updateFields.push(`completed_at = CURRENT_TIMESTAMP`);
    }

    values.push(id);
    const query = `UPDATE orders SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $${paramCount} RETURNING *`;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating delivery status:', error);
    res.status(500).json({ error: 'Failed to update delivery status' });
  }
});

/**
 * Assign delivery to driver (admin only)
 * POST /api/delivery/assign
 */
router.post('/assign', requireAuth, async (req, res) => {
  try {
    const { order_id, assigned_to } = req.body;

    if (!order_id || !assigned_to) {
      return res.status(400).json({ error: 'order_id and assigned_to are required' });
    }

    // Verify user is admin
    const userResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user?.id]
    );

    if (userResult.rows.length === 0 || !['owner', 'baker'].includes(userResult.rows[0].role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Create or update assignment
    const assignmentResult = await pool.query(
      `INSERT INTO delivery_assignments (order_id, assigned_to, status)
       VALUES ($1, $2, 'assigned')
       ON CONFLICT (order_id) DO UPDATE
       SET assigned_to = EXCLUDED.assigned_to,
           assigned_at = CURRENT_TIMESTAMP,
           status = 'assigned'
       RETURNING *`,
      [order_id, assigned_to]
    );

    // Update order delivery status
    await pool.query(
      `UPDATE orders 
       SET delivery_status = 'assigned', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [order_id]
    );

    res.json(assignmentResult.rows[0]);
  } catch (error) {
    console.error('Error assigning delivery:', error);
    res.status(500).json({ error: 'Failed to assign delivery' });
  }
});

/**
 * Get delivery orders for today (admin/driver)
 * GET /api/delivery/today
 */
router.get('/today', requireAuth, async (req, res) => {
  try {
    // Verify user is admin or driver
    const userResult = await pool.query(
      'SELECT role FROM profiles WHERE id = $1',
      [req.user?.id]
    );

    const isAdmin = userResult.rows.length > 0 && 
                   ['owner', 'baker'].includes(userResult.rows[0].role);

    let query = `
      SELECT 
        o.*,
        da.assigned_to,
        da.assigned_at,
        p.full_name as assigned_driver_name
      FROM orders o
      LEFT JOIN delivery_assignments da ON o.id = da.order_id
      LEFT JOIN profiles p ON da.assigned_to = p.id
      WHERE o.delivery_option = 'delivery'
        AND o.date_needed = CURRENT_DATE
        AND o.status NOT IN ('cancelled', 'completed')
    `;

    const params = [];

    // If not admin, only show assigned deliveries
    if (!isAdmin) {
      query += ' AND da.assigned_to = $1';
      params.push(req.user?.id);
    }

    query += ' ORDER BY o.time_needed, o.created_at';

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching today\'s deliveries:', error);
    res.status(500).json({ error: 'Failed to fetch deliveries' });
  }
});

export default router;
