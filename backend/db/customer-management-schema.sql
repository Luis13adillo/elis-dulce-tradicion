-- =====================================================
-- Customer Management System Schema
-- =====================================================
-- Enhances profiles with customer data and adds customer features
-- =====================================================

-- Enhance profiles table with customer-specific fields
ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS default_delivery_address TEXT,
ADD COLUMN IF NOT EXISTS default_delivery_apartment VARCHAR(100),
ADD COLUMN IF NOT EXISTS favorite_cake_size VARCHAR(50),
ADD COLUMN IF NOT EXISTS favorite_filling VARCHAR(100),
ADD COLUMN IF NOT EXISTS favorite_theme VARCHAR(100),
ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS sms_notifications_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_spent DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;

-- Customer saved addresses
CREATE TABLE IF NOT EXISTS customer_addresses (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label VARCHAR(100) NOT NULL, -- e.g., "Home", "Work", "Mom's House"
  address TEXT NOT NULL,
  apartment VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(10),
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, label)
);

-- Add user_id to orders table (for linking orders to customers)
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Order reviews (for completed orders)
CREATE TABLE IF NOT EXISTS order_reviews (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_total_orders ON user_profiles(total_orders);
CREATE INDEX IF NOT EXISTS idx_profiles_total_spent ON user_profiles(total_spent);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user ON customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON customer_addresses(user_id, is_default);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_order ON order_reviews(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_user ON order_reviews(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for customer_addresses updated_at
CREATE TRIGGER update_customer_addresses_updated_at BEFORE UPDATE ON customer_addresses
  FOR EACH ROW EXECUTE FUNCTION update_customer_addresses_updated_at();

-- Function to update customer stats when order is created
CREATE OR REPLACE FUNCTION update_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.status IN ('confirmed', 'in_oven', 'decorating', 'ready', 'completed') THEN
    UPDATE user_profiles
    SET 
      total_orders = COALESCE(total_orders, 0) + 1,
      total_spent = COALESCE(total_spent, 0) + COALESCE(NEW.total_amount, 0),
      loyalty_points = COALESCE(loyalty_points, 0) + FLOOR(COALESCE(NEW.total_amount, 0))
    WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update customer stats on order creation
CREATE TRIGGER update_customer_stats_on_order
  AFTER INSERT ON orders
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION update_customer_stats();

-- Function to update customer stats when order is cancelled (decrement)
CREATE OR REPLACE FUNCTION revert_customer_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND OLD.status != 'cancelled' AND NEW.status = 'cancelled' THEN
    UPDATE user_profiles
    SET 
      total_orders = GREATEST(0, COALESCE(total_orders, 0) - 1),
      total_spent = GREATEST(0, COALESCE(total_spent, 0) - COALESCE(OLD.total_amount, 0)),
      loyalty_points = GREATEST(0, COALESCE(loyalty_points, 0) - FLOOR(COALESCE(OLD.total_amount, 0)))
    WHERE user_id = OLD.user_id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to revert stats on order cancellation
CREATE TRIGGER revert_customer_stats_on_cancellation
  AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN (OLD.status != 'cancelled' AND NEW.status = 'cancelled')
  EXECUTE FUNCTION revert_customer_stats();

-- Function to ensure only one default address per user
CREATE OR REPLACE FUNCTION ensure_single_default_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE customer_addresses
    SET is_default = false
    WHERE user_id = NEW.user_id AND id != NEW.id;
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to ensure single default address
CREATE TRIGGER ensure_single_default_address_trigger
  BEFORE INSERT OR UPDATE ON customer_addresses
  FOR EACH ROW
  WHEN (NEW.is_default = true)
  EXECUTE FUNCTION ensure_single_default_address();

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on customer_addresses
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;

-- Customers can only view their own addresses
CREATE POLICY "Customers can view their own addresses" ON customer_addresses
  FOR SELECT USING (auth.uid() = user_id);

-- Customers can manage their own addresses
CREATE POLICY "Customers can manage their own addresses" ON customer_addresses
  FOR ALL USING (auth.uid() = user_id);

-- Admins can view all addresses
CREATE POLICY "Admins can view all addresses" ON customer_addresses
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Customers can view their own reviews
CREATE POLICY "Customers can view their own reviews" ON order_reviews
  FOR SELECT USING (auth.uid() = user_id);

-- Customers can create reviews for their orders
CREATE POLICY "Customers can create reviews" ON order_reviews
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = order_id
      AND orders.user_id = auth.uid()
      AND orders.status = 'completed'
    )
  );

-- Customers can update their own reviews
CREATE POLICY "Customers can update their own reviews" ON order_reviews
  FOR UPDATE USING (auth.uid() = user_id);

-- Public can view reviews (for display on product pages)
CREATE POLICY "Anyone can view reviews" ON order_reviews
  FOR SELECT USING (true);

-- Update orders RLS to allow customers to view their own orders
-- (Assuming orders table already has RLS enabled)
DROP POLICY IF EXISTS "Customers can view their own orders" ON orders;
CREATE POLICY "Customers can view their own orders" ON orders
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- =====================================================
-- Helper Functions
-- =====================================================

-- Function to get customer order history
CREATE OR REPLACE FUNCTION get_customer_orders(
  customer_user_id UUID,
  status_filter VARCHAR DEFAULT NULL,
  date_from DATE DEFAULT NULL,
  date_to DATE DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  order_number VARCHAR,
  customer_name VARCHAR,
  date_needed DATE,
  time_needed TIME,
  total_amount DECIMAL,
  status VARCHAR,
  delivery_option VARCHAR,
  created_at TIMESTAMP
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.id,
    o.order_number,
    o.customer_name,
    o.date_needed,
    o.time_needed,
    o.total_amount,
    o.status,
    o.delivery_option,
    o.created_at
  FROM orders o
  WHERE o.user_id = customer_user_id
    AND (status_filter IS NULL OR o.status = status_filter)
    AND (date_from IS NULL OR o.date_needed >= date_from)
    AND (date_to IS NULL OR o.date_needed <= date_to)
  ORDER BY o.created_at DESC;
END;
$$ language 'plpgsql';

-- =====================================================
-- Notes:
-- =====================================================
-- 1. Customer stats auto-update on order creation/cancellation
-- 2. Only one default address per customer
-- 3. Orders linked to users via user_id
-- 4. RLS ensures customers only see their own data
-- 5. Reviews can only be created for completed orders
-- 6. Loyalty points: 1 point per dollar spent
--
-- =====================================================
