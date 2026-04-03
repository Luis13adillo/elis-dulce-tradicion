-- =====================================================
-- Order Capacity & Inventory Tracking Schema
-- =====================================================
-- Manages daily order capacity, business hours, holidays, and inventory
-- =====================================================

-- Daily Capacity Management
CREATE TABLE IF NOT EXISTS daily_capacity (
  date DATE PRIMARY KEY,
  max_orders INTEGER NOT NULL DEFAULT 10,
  current_orders INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Business Hours
CREATE TABLE IF NOT EXISTS business_hours (
  id SERIAL PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  is_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(day_of_week)
);

-- Holidays
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  is_closed BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredients Inventory
CREATE TABLE IF NOT EXISTS ingredients (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  quantity DECIMAL(10, 2) NOT NULL DEFAULT 0,
  unit VARCHAR(50) NOT NULL, -- e.g., 'lbs', 'oz', 'cups', 'units'
  low_stock_threshold DECIMAL(10, 2) NOT NULL DEFAULT 0,
  category VARCHAR(100), -- e.g., 'flour', 'sugar', 'eggs', 'decorations'
  supplier VARCHAR(255),
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ingredient Usage Log (for tracking consumption)
CREATE TABLE IF NOT EXISTS ingredient_usage (
  id SERIAL PRIMARY KEY,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used DECIMAL(10, 2) NOT NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  notes TEXT,
  used_by INTEGER REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_daily_capacity_date ON daily_capacity(date);
CREATE INDEX IF NOT EXISTS idx_daily_capacity_current ON daily_capacity(current_orders);
CREATE INDEX IF NOT EXISTS idx_business_hours_day ON business_hours(day_of_week);
CREATE INDEX IF NOT EXISTS idx_holidays_date ON holidays(date);
CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category);
CREATE INDEX IF NOT EXISTS idx_ingredients_low_stock ON ingredients(quantity, low_stock_threshold);
CREATE INDEX IF NOT EXISTS idx_ingredient_usage_ingredient ON ingredient_usage(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_usage_order ON ingredient_usage(order_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_capacity_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_daily_capacity_updated_at BEFORE UPDATE ON daily_capacity
  FOR EACH ROW EXECUTE FUNCTION update_capacity_updated_at();

CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON business_hours
  FOR EACH ROW EXECUTE FUNCTION update_capacity_updated_at();

CREATE TRIGGER update_ingredients_updated_at BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION update_capacity_updated_at();

-- Function to auto-increment current_orders when order is created
CREATE OR REPLACE FUNCTION increment_order_capacity()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment if order status is confirmed/pending (not cancelled)
  IF NEW.status IN ('pending', 'confirmed', 'in_oven', 'decorating', 'ready') THEN
    UPDATE daily_capacity
    SET current_orders = current_orders + 1
    WHERE date = NEW.date_needed::DATE;
    
    -- Create capacity entry if it doesn't exist
    IF NOT FOUND THEN
      INSERT INTO daily_capacity (date, max_orders, current_orders)
      VALUES (NEW.date_needed::DATE, 10, 1)
      ON CONFLICT (date) DO UPDATE
      SET current_orders = daily_capacity.current_orders + 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to auto-increment capacity on order creation
CREATE TRIGGER order_capacity_increment
  AFTER INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.status IN ('pending', 'confirmed', 'in_oven', 'decorating', 'ready'))
  EXECUTE FUNCTION increment_order_capacity();

-- Function to decrement capacity when order is cancelled
CREATE OR REPLACE FUNCTION decrement_order_capacity()
RETURNS TRIGGER AS $$
BEGIN
  -- Decrement if order status changed to cancelled
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE daily_capacity
    SET current_orders = GREATEST(0, current_orders - 1)
    WHERE date = NEW.date_needed::DATE;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to decrement capacity on order cancellation
CREATE TRIGGER order_capacity_decrement
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status != 'cancelled')
  EXECUTE FUNCTION decrement_order_capacity();

-- Insert default business hours (Monday-Sunday, 9 AM - 8 PM)
INSERT INTO business_hours (day_of_week, open_time, close_time, is_closed) VALUES
  (0, '09:00:00', '20:00:00', false), -- Sunday
  (1, '09:00:00', '20:00:00', false), -- Monday
  (2, '09:00:00', '20:00:00', false), -- Tuesday
  (3, '09:00:00', '20:00:00', false), -- Wednesday
  (4, '09:00:00', '20:00:00', false), -- Thursday
  (5, '09:00:00', '20:00:00', false), -- Friday
  (6, '09:00:00', '20:00:00', false)  -- Saturday
ON CONFLICT (day_of_week) DO NOTHING;

-- Insert some common holidays (examples)
INSERT INTO holidays (date, name, is_closed) VALUES
  ('2025-01-01', 'New Year''s Day', true),
  ('2025-07-04', 'Independence Day', true),
  ('2025-12-25', 'Christmas', true)
ON CONFLICT (date) DO NOTHING;

-- Insert default ingredients (examples)
INSERT INTO ingredients (name, quantity, unit, low_stock_threshold, category) VALUES
  ('All-Purpose Flour', 100.0, 'lbs', 20.0, 'flour'),
  ('Granulated Sugar', 50.0, 'lbs', 10.0, 'sugar'),
  ('Eggs', 200.0, 'units', 50.0, 'dairy'),
  ('Butter', 30.0, 'lbs', 5.0, 'dairy'),
  ('Vanilla Extract', 5.0, 'oz', 1.0, 'flavoring'),
  ('Chocolate Chips', 25.0, 'lbs', 5.0, 'decorations')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE daily_capacity ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredient_usage ENABLE ROW LEVEL SECURITY;

-- Public read access to capacity and business hours
CREATE POLICY "Anyone can view daily capacity" ON daily_capacity
  FOR SELECT USING (true);

CREATE POLICY "Anyone can view business hours" ON business_hours
  FOR SELECT USING (true);

CREATE POLICY "Anyone can view holidays" ON holidays
  FOR SELECT USING (true);

-- Admin-only write access
CREATE POLICY "Admins can manage daily capacity" ON daily_capacity
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage business hours" ON business_hours
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage holidays" ON holidays
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Inventory: Admin-only access
CREATE POLICY "Admins can view ingredients" ON ingredients
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage ingredients" ON ingredients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can view ingredient usage" ON ingredient_usage
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can log ingredient usage" ON ingredient_usage
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to check if date is available for orders
CREATE OR REPLACE FUNCTION is_date_available(check_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
  capacity_record RECORD;
  holiday_record RECORD;
  day_of_week INTEGER;
  business_hours_record RECORD;
BEGIN
  -- Check if it's a holiday and closed
  SELECT * INTO holiday_record FROM holidays WHERE date = check_date;
  IF FOUND AND holiday_record.is_closed THEN
    RETURN false;
  END IF;
  
  -- Check business hours for that day
  day_of_week := EXTRACT(DOW FROM check_date);
  SELECT * INTO business_hours_record FROM business_hours WHERE day_of_week = day_of_week;
  IF FOUND AND business_hours_record.is_closed THEN
    RETURN false;
  END IF;
  
  -- Check capacity
  SELECT * INTO capacity_record FROM daily_capacity WHERE date = check_date;
  IF FOUND THEN
    RETURN capacity_record.current_orders < capacity_record.max_orders;
  END IF;
  
  -- Default: available if no capacity record exists (will be created on first order)
  RETURN true;
END;
$$ language 'plpgsql';

-- Function to get available dates (next N days)
CREATE OR REPLACE FUNCTION get_available_dates(days_ahead INTEGER DEFAULT 90)
RETURNS TABLE (
  date DATE,
  available BOOLEAN,
  current_orders INTEGER,
  max_orders INTEGER,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(
      CURRENT_DATE,
      CURRENT_DATE + (days_ahead || ' days')::INTERVAL,
      '1 day'::INTERVAL
    )::DATE AS date
  ),
  capacity_data AS (
    SELECT 
      ds.date,
      COALESCE(dc.current_orders, 0) AS current_orders,
      COALESCE(dc.max_orders, 10) AS max_orders,
      CASE
        WHEN EXISTS (SELECT 1 FROM holidays h WHERE h.date = ds.date AND h.is_closed) THEN 'holiday'
        WHEN EXISTS (
          SELECT 1 FROM business_hours bh 
          WHERE bh.day_of_week = EXTRACT(DOW FROM ds.date) AND bh.is_closed
        ) THEN 'closed_day'
        WHEN COALESCE(dc.current_orders, 0) >= COALESCE(dc.max_orders, 10) THEN 'full'
        ELSE 'available'
      END AS reason
    FROM date_series ds
    LEFT JOIN daily_capacity dc ON dc.date = ds.date
  )
  SELECT 
    cd.date,
    cd.reason = 'available' AS available,
    cd.current_orders,
    cd.max_orders,
    cd.reason
  FROM capacity_data cd;
END;
$$ language 'plpgsql';

-- =====================================================
-- Notes:
-- =====================================================
-- 1. Daily capacity auto-increments when orders are created
-- 2. Capacity auto-decrements when orders are cancelled
-- 3. Business hours checked for each day of week
-- 4. Holidays can be marked as closed
-- 5. Inventory tracks quantity and low stock thresholds
-- 6. Ingredient usage logged for reporting
-- 7. RLS policies protect admin-only inventory access
--
-- =====================================================
