-- =====================================================
-- Analytics Database Views
-- =====================================================
-- Optimized views for dashboard analytics and reporting
-- =====================================================

-- Daily Revenue View
CREATE OR REPLACE VIEW v_daily_revenue AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as order_count,
  SUM(total_amount) as total_revenue,
  AVG(total_amount) as average_order_value,
  SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END) as completed_revenue,
  SUM(CASE WHEN status = 'cancelled' THEN total_amount ELSE 0 END) as cancelled_revenue
FROM orders
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Order Summary View
CREATE OR REPLACE VIEW v_order_summary AS
SELECT 
  o.id,
  o.order_number,
  o.customer_name,
  o.customer_email,
  o.date_needed,
  o.time_needed,
  o.cake_size,
  o.filling,
  o.theme,
  o.total_amount,
  o.status,
  o.delivery_option,
  o.delivery_status,
  o.created_at,
  o.user_id,
  p.total_orders as customer_total_orders,
  p.total_spent as customer_total_spent
FROM orders o
LEFT JOIN user_profiles p ON o.user_id = p.user_id;

-- Customer Stats View
CREATE OR REPLACE VIEW v_customer_stats AS
SELECT 
  p.user_id as customer_id,
  p.full_name,
  p.email,
  COUNT(DISTINCT o.id) as total_orders,
  SUM(o.total_amount) as total_spent,
  AVG(o.total_amount) as average_order_value,
  MAX(o.created_at) as last_order_date,
  MIN(o.created_at) as first_order_date,
  COUNT(DISTINCT DATE(o.created_at)) as active_days,
  p.loyalty_points,
  p.total_orders as profile_total_orders,
  p.total_spent as profile_total_spent
FROM user_profiles p
LEFT JOIN orders o ON p.user_id = o.user_id AND o.status != 'cancelled'
WHERE p.role = 'customer'
GROUP BY p.user_id, p.full_name, p.email, p.loyalty_points, p.total_orders, p.total_spent;

-- Popular Items View (Last 30 days)
CREATE OR REPLACE VIEW v_popular_items AS
SELECT 
  'size' as item_type,
  cake_size as item_name,
  COUNT(*) as order_count,
  SUM(total_amount) as total_revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND status != 'cancelled'
GROUP BY cake_size

UNION ALL

SELECT 
  'filling' as item_type,
  filling as item_name,
  COUNT(*) as order_count,
  SUM(total_amount) as total_revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND status != 'cancelled'
GROUP BY filling

UNION ALL

SELECT 
  'theme' as item_type,
  theme as item_name,
  COUNT(*) as order_count,
  SUM(total_amount) as total_revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
  AND status != 'cancelled'
GROUP BY theme;

-- Order Status Breakdown View
CREATE OR REPLACE VIEW v_order_status_breakdown AS
SELECT 
  status,
  COUNT(*) as count,
  SUM(total_amount) as total_revenue,
  ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM orders), 0), 2) as percentage
FROM orders
GROUP BY status;

-- Hourly Order Distribution View
CREATE OR REPLACE VIEW v_peak_ordering_times AS
SELECT 
  EXTRACT(HOUR FROM created_at) as hour,
  COUNT(*) as order_count,
  SUM(total_amount) as revenue
FROM orders
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY EXTRACT(HOUR FROM created_at)
ORDER BY hour;

-- Capacity Utilization View
CREATE OR REPLACE VIEW v_capacity_utilization AS
SELECT 
  dc.date,
  dc.max_orders,
  dc.current_orders,
  ROUND((dc.current_orders::DECIMAL / NULLIF(dc.max_orders, 0)) * 100, 2) as utilization_percentage,
  CASE 
    WHEN dc.current_orders >= dc.max_orders THEN 'full'
    WHEN dc.current_orders >= dc.max_orders * 0.8 THEN 'high'
    WHEN dc.current_orders >= dc.max_orders * 0.5 THEN 'medium'
    ELSE 'low'
  END as capacity_status
FROM daily_capacity dc
WHERE dc.date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY dc.date DESC;

-- Revenue by Period View (for charts)
CREATE OR REPLACE VIEW v_revenue_by_period AS
SELECT 
  DATE_TRUNC('day', created_at) as period,
  'daily' as group_by,
  COUNT(*) as order_count,
  SUM(total_amount) as revenue,
  AVG(total_amount) as avg_order_value
FROM orders
WHERE status != 'cancelled'
GROUP BY DATE_TRUNC('day', created_at)

UNION ALL

SELECT 
  DATE_TRUNC('week', created_at) as period,
  'weekly' as group_by,
  COUNT(*) as order_count,
  SUM(total_amount) as revenue,
  AVG(total_amount) as avg_order_value
FROM orders
WHERE status != 'cancelled'
GROUP BY DATE_TRUNC('week', created_at)

UNION ALL

SELECT 
  DATE_TRUNC('month', created_at) as period,
  'monthly' as group_by,
  COUNT(*) as order_count,
  SUM(total_amount) as revenue,
  AVG(total_amount) as avg_order_value
FROM orders
WHERE status != 'cancelled'
GROUP BY DATE_TRUNC('month', created_at);

-- Inventory Usage View
CREATE OR REPLACE VIEW v_inventory_usage AS
SELECT 
  i.id,
  i.name,
  i.quantity,
  i.unit,
  i.low_stock_threshold,
  CASE 
    WHEN i.quantity <= i.low_stock_threshold THEN true
    ELSE false
  END as is_low_stock,
  COALESCE(SUM(iu.quantity_used), 0) as total_used,
  COALESCE(MAX(iu.created_at), i.last_updated) as last_used
FROM ingredients i
LEFT JOIN ingredient_usage iu ON i.id = iu.ingredient_id
WHERE iu.created_at >= CURRENT_DATE - INTERVAL '30 days' OR iu.created_at IS NULL
GROUP BY i.id, i.name, i.quantity, i.unit, i.low_stock_threshold, i.last_updated;

-- Today's Orders Summary
CREATE OR REPLACE VIEW v_today_orders AS
SELECT 
  COUNT(*) as total_orders,
  SUM(total_amount) as total_revenue,
  COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
  COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
  COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_orders,
  COUNT(CASE WHEN delivery_option = 'delivery' THEN 1 END) as delivery_orders,
  COUNT(CASE WHEN delivery_option = 'pickup' THEN 1 END) as pickup_orders
FROM orders
WHERE DATE(created_at) = CURRENT_DATE;

-- =====================================================
-- Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_date_needed ON orders(date_needed);
CREATE INDEX IF NOT EXISTS idx_orders_user_id_status ON orders(user_id, status);

-- =====================================================
-- Notes:
-- =====================================================
-- 1. Views are automatically updated when underlying data changes
-- 2. Use these views for dashboard queries to improve performance
-- 3. RLS policies apply to views based on underlying table policies
-- 4. Views can be materialized if needed for better performance
--
-- =====================================================
