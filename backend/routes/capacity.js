import express from 'express';
import pool from '../db/connection.js';
import { requireAuth } from '../middleware/auth.js';
import { cacheMiddleware, cacheKeys } from '../middleware/cache.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * Get available dates for next N days
 * GET /api/capacity/available-dates?days=90
 * Cached for 5 minutes (capacity changes frequently)
 */
router.get('/available-dates', cacheMiddleware(300, (req) => cacheKeys.capacity.availableDates(req.query.days)), async (req, res) => {
  try {
    const daysAhead = parseInt(req.query.days) || 90;
    
    const result = await pool.query(
      `SELECT * FROM get_available_dates($1) ORDER BY date`,
      [daysAhead]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching available dates:', error);
    res.status(500).json({ error: 'Failed to fetch available dates' });
  }
});

/**
 * Get capacity info for specific date
 * GET /api/capacity/:date
 */
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Check if date is in the past
    const checkDate = new Date(date);
    if (checkDate < new Date().setHours(0, 0, 0, 0)) {
      return res.json({
        date,
        available: false,
        reason: 'past_date',
        current_orders: 0,
        max_orders: 0,
      });
    }

    // Check holiday
    const holidayResult = await pool.query(
      'SELECT * FROM holidays WHERE date = $1',
      [date]
    );

    if (holidayResult.rows.length > 0 && holidayResult.rows[0].is_closed) {
      return res.json({
        date,
        available: false,
        reason: 'holiday',
        holiday_name: holidayResult.rows[0].name,
        current_orders: 0,
        max_orders: 0,
      });
    }

    // Check business hours
    const dayOfWeek = checkDate.getDay();
    const businessHoursResult = await pool.query(
      'SELECT * FROM business_hours WHERE day_of_week = $1',
      [dayOfWeek]
    );

    if (businessHoursResult.rows.length > 0 && businessHoursResult.rows[0].is_closed) {
      return res.json({
        date,
        available: false,
        reason: 'closed_day',
        current_orders: 0,
        max_orders: 0,
      });
    }

    // Get capacity
    const capacityResult = await pool.query(
      'SELECT * FROM daily_capacity WHERE date = $1',
      [date]
    );

    if (capacityResult.rows.length === 0) {
      // No capacity record - use defaults
      return res.json({
        date,
        available: true,
        reason: 'available',
        current_orders: 0,
        max_orders: 10, // Default
      });
    }

    const capacity = capacityResult.rows[0];
    const available = capacity.current_orders < capacity.max_orders;

    res.json({
      date,
      available,
      reason: available ? 'available' : 'full',
      current_orders: capacity.current_orders,
      max_orders: capacity.max_orders,
      notes: capacity.notes,
    });
  } catch (error) {
    console.error('Error fetching capacity:', error);
    res.status(500).json({ error: 'Failed to fetch capacity' });
  }
});

/**
 * Set capacity for a date (admin only)
 * POST /api/capacity/set
 */
router.post('/set', requireAuth, async (req, res) => {
  try {
    const { date, max_orders, notes } = req.body;

    if (!date || !max_orders) {
      return res.status(400).json({ error: 'Date and max_orders are required' });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
    }

    // Verify user is admin
    const userResult = await pool.query(
      'SELECT role FROM user_profiles WHERE user_id = $1',
      [req.user?.id]
    );

    if (userResult.rows.length === 0 || !['owner', 'baker'].includes(userResult.rows[0].role)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Upsert capacity
    const result = await pool.query(
      `INSERT INTO daily_capacity (date, max_orders, notes)
       VALUES ($1, $2, $3)
       ON CONFLICT (date) 
       DO UPDATE SET 
         max_orders = EXCLUDED.max_orders,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [date, max_orders, notes || null]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error setting capacity:', error);
    res.status(500).json({ error: 'Failed to set capacity' });
  }
});

/**
 * Get business hours
 * GET /api/capacity/business-hours
 * Cached for 24 hours (business hours rarely change)
 */
router.get('/business-hours', cacheMiddleware(86400, () => cacheKeys.capacity.businessHours()), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM business_hours ORDER BY day_of_week'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching business hours:', error);
    res.status(500).json({ error: 'Failed to fetch business hours' });
  }
});

/**
 * Check if date is a holiday
 * GET /api/capacity/holiday/:date
 */
router.get('/holiday/:date', async (req, res) => {
  try {
    const { date } = req.params;

    const result = await pool.query(
      'SELECT * FROM holidays WHERE date = $1',
      [date]
    );

    if (result.rows.length === 0) {
      return res.json({
        is_holiday: false,
        is_closed: false,
      });
    }

    res.json({
      is_holiday: true,
      is_closed: result.rows[0].is_closed,
      name: result.rows[0].name,
    });
  } catch (error) {
    console.error('Error checking holiday:', error);
    res.status(500).json({ error: 'Failed to check holiday' });
  }
});

export default router;
