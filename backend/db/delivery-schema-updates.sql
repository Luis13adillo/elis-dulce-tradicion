-- =====================================================
-- Delivery Management System Schema Updates
-- =====================================================
-- Enhances orders table and creates delivery management tables
-- =====================================================

-- Add delivery fields to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_zone VARCHAR(100),
ADD COLUMN IF NOT EXISTS estimated_delivery_time TIMESTAMP,
ADD COLUMN IF NOT EXISTS driver_notes TEXT,
ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'pending';

-- Create delivery_status enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE delivery_status_enum AS ENUM ('pending', 'assigned', 'in_transit', 'delivered', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update delivery_status column to use enum (if needed, otherwise keep as VARCHAR)
-- ALTER TABLE orders ALTER COLUMN delivery_status TYPE delivery_status_enum USING delivery_status::delivery_status_enum;

-- Create delivery_zones table (if not exists from pricing system)
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,
  zone_name VARCHAR(100) NOT NULL,
  zip_codes TEXT[] NOT NULL,
  base_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  per_mile_rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
  max_distance_miles DECIMAL(10, 2),
  estimated_delivery_minutes INTEGER DEFAULT 30,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery assignments (for driver management)
CREATE TABLE IF NOT EXISTS delivery_assignments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  assigned_to INTEGER REFERENCES auth.users(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'assigned',
  notes TEXT,
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery tracking history
CREATE TABLE IF NOT EXISTS delivery_tracking (
  id SERIAL PRIMARY KEY,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL,
  location_lat DECIMAL(10, 8),
  location_lng DECIMAL(11, 8),
  notes TEXT,
  updated_by INTEGER REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders(delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_zone ON orders(delivery_zone);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_option ON orders(delivery_option);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON delivery_zones(active);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_order ON delivery_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_assignments_assigned_to ON delivery_assignments(assigned_to);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_order ON delivery_tracking(order_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_delivery_zones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for delivery_zones updated_at
CREATE TRIGGER update_delivery_zones_updated_at BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_delivery_zones_updated_at();

-- Function to auto-update delivery status history
CREATE OR REPLACE FUNCTION log_delivery_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.delivery_status IS DISTINCT FROM NEW.delivery_status THEN
    INSERT INTO delivery_tracking (order_id, status, updated_by)
    VALUES (NEW.id, NEW.delivery_status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to log delivery status changes
CREATE TRIGGER log_delivery_status_changes
  AFTER UPDATE OF delivery_status ON orders
  FOR EACH ROW
  WHEN (OLD.delivery_status IS DISTINCT FROM NEW.delivery_status)
  EXECUTE FUNCTION log_delivery_status_change();

-- Insert default delivery zones (if not exists)
INSERT INTO delivery_zones (zone_name, zip_codes, base_fee, per_mile_rate, max_distance_miles, estimated_delivery_minutes) VALUES
  ('Zone 1 - Local (0-5 miles)', ARRAY['19020', '19021'], 5.00, 1.50, 5.0, 30),
  ('Zone 2 - Nearby (5-10 miles)', ARRAY['19022', '19023'], 10.00, 2.00, 10.0, 45),
  ('Zone 3 - Extended (10-15 miles)', ARRAY['19024', '19025'], 15.00, 2.50, 15.0, 60),
  ('Zone 4 - Long Distance (15+ miles)', ARRAY['19026', '19027'], 20.00, 3.00, NULL, 90)
ON CONFLICT DO NOTHING;

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_tracking ENABLE ROW LEVEL SECURITY;

-- Public read access to delivery zones
CREATE POLICY "Anyone can view active delivery zones" ON delivery_zones
  FOR SELECT USING (active = true);

-- Admin-only write access
CREATE POLICY "Admins can manage delivery zones" ON delivery_zones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Delivery assignments: admins and assigned drivers can view
CREATE POLICY "Admins and assigned drivers can view assignments" ON delivery_assignments
  FOR SELECT USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage assignments" ON delivery_assignments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Delivery tracking: customers can view their own, admins can view all
CREATE POLICY "Customers can view their own delivery tracking" ON delivery_tracking
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = delivery_tracking.order_id
      AND orders.customer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Admins can view all delivery tracking" ON delivery_tracking
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can create delivery tracking" ON delivery_tracking
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

-- Function to find delivery zone by zip code
CREATE OR REPLACE FUNCTION find_delivery_zone(zip_code TEXT)
RETURNS TABLE (
  id INTEGER,
  zone_name VARCHAR(100),
  base_fee DECIMAL(10, 2),
  per_mile_rate DECIMAL(10, 2),
  max_distance_miles DECIMAL(10, 2),
  estimated_delivery_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dz.id,
    dz.zone_name,
    dz.base_fee,
    dz.per_mile_rate,
    dz.max_distance_miles,
    dz.estimated_delivery_minutes
  FROM delivery_zones dz
  WHERE dz.active = true
    AND zip_code = ANY(dz.zip_codes)
  ORDER BY dz.base_fee
  LIMIT 1;
END;
$$ language 'plpgsql';

-- =====================================================
-- Notes:
-- =====================================================
-- 1. delivery_status: 'pending', 'assigned', 'in_transit', 'delivered', 'failed'
-- 2. delivery_zone: Automatically determined from zip code
-- 3. estimated_delivery_time: Calculated based on zone and order time
-- 4. driver_notes: Internal notes for delivery drivers
-- 5. Delivery tracking logs all status changes
-- 6. RLS policies protect customer data
--
-- =====================================================
