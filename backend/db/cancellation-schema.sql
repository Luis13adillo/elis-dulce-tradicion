-- =====================================================
-- Order Cancellation and Refund System Schema
-- =====================================================
-- Handles cancellation policies, refunds, and tracking
-- =====================================================

-- Cancellation Policies Table
CREATE TABLE IF NOT EXISTS cancellation_policies (
  id SERIAL PRIMARY KEY,
  hours_before_needed INTEGER NOT NULL,
  refund_percentage DECIMAL(5, 2) NOT NULL CHECK (refund_percentage >= 0 AND refund_percentage <= 100),
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(hours_before_needed)
);

-- Add cancellation fields to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS refund_processed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS refund_square_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS admin_cancellation_notes TEXT;

-- Create refunds table for detailed tracking
CREATE TABLE IF NOT EXISTS refunds (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES payments(id),
  square_payment_id VARCHAR(255),
  refund_amount DECIMAL(10, 2) NOT NULL,
  refund_percentage DECIMAL(5, 2) NOT NULL,
  refund_reason TEXT,
  refund_status VARCHAR(20) DEFAULT 'pending',
  square_refund_id VARCHAR(255),
  processed_by UUID REFERENCES auth.users(id),
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_at ON orders(cancelled_at);
CREATE INDEX IF NOT EXISTS idx_orders_cancelled_by ON orders(cancelled_by);
CREATE INDEX IF NOT EXISTS idx_orders_refund_status ON orders(refund_status);
CREATE INDEX IF NOT EXISTS idx_refunds_order_id ON refunds(order_id);
CREATE INDEX IF NOT EXISTS idx_refunds_square_refund_id ON refunds(square_refund_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_policies_hours ON cancellation_policies(hours_before_needed);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cancellation_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cancellation_policies_updated_at 
  BEFORE UPDATE ON cancellation_policies
  FOR EACH ROW EXECUTE FUNCTION update_cancellation_policies_updated_at();

-- Function to get applicable cancellation policy
CREATE OR REPLACE FUNCTION get_cancellation_policy(hours_before INTEGER)
RETURNS TABLE (
  id INTEGER,
  hours_before_needed INTEGER,
  refund_percentage DECIMAL,
  description TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cp.id,
    cp.hours_before_needed,
    cp.refund_percentage,
    cp.description
  FROM cancellation_policies cp
  WHERE cp.active = true
    AND cp.hours_before_needed <= hours_before
  ORDER BY cp.hours_before_needed DESC
  LIMIT 1;
END;
$$ language 'plpgsql';

-- Function to calculate refund amount based on policy
CREATE OR REPLACE FUNCTION calculate_refund_amount(
  order_total DECIMAL,
  hours_before INTEGER
)
RETURNS DECIMAL AS $$
DECLARE
  policy_refund_percentage DECIMAL;
BEGIN
  SELECT refund_percentage INTO policy_refund_percentage
  FROM get_cancellation_policy(hours_before);
  
  IF policy_refund_percentage IS NULL THEN
    RETURN 0;
  END IF;
  
  RETURN ROUND(order_total * (policy_refund_percentage / 100), 2);
END;
$$ language 'plpgsql';

-- Insert default cancellation policies
INSERT INTO cancellation_policies (hours_before_needed, refund_percentage, description, active)
VALUES 
  (48, 100.00, 'Full refund for cancellations more than 48 hours before needed date', true),
  (24, 50.00, '50% refund for cancellations 24-48 hours before needed date', true),
  (0, 0.00, 'No refund for cancellations less than 24 hours before needed date', true)
ON CONFLICT (hours_before_needed) DO NOTHING;

-- Update order_status_history to track cancellations
ALTER TABLE order_status_history
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10, 2);

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on cancellation_policies
ALTER TABLE cancellation_policies ENABLE ROW LEVEL SECURITY;

-- Public can view active cancellation policies
CREATE POLICY "Anyone can view active cancellation policies" ON cancellation_policies
  FOR SELECT USING (active = true);

-- Only admins can manage cancellation policies
CREATE POLICY "Admins can manage cancellation policies" ON cancellation_policies
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Enable RLS on refunds
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;

-- Customers can view their own refunds
CREATE POLICY "Customers can view their own refunds" ON refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = refunds.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- Admins can view all refunds
CREATE POLICY "Admins can view all refunds" ON refunds
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Only admins can create/update refunds
CREATE POLICY "Admins can manage refunds" ON refunds
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- =====================================================
-- Notes:
-- =====================================================
-- 1. Cancellation policies are evaluated in descending order of hours_before_needed
-- 2. Refund percentage is calculated based on the first matching policy
-- 3. Orders can be cancelled by customers or admins
-- 4. Refunds are tracked separately in the refunds table
-- 5. Square refund IDs are stored for reconciliation
-- 6. RLS ensures customers only see their own refunds
--
-- =====================================================
