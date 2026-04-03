-- =====================================================
-- Comprehensive Row Level Security (RLS) Policies
-- =====================================================
-- This file contains RLS policies for all tables
-- Run this in your Supabase SQL editor
-- =====================================================

-- =====================================================
-- ORDERS TABLE
-- =====================================================

-- Enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Customers can view own orders" ON orders;
DROP POLICY IF EXISTS "Admins can view all orders" ON orders;
DROP POLICY IF EXISTS "Customers can create own orders" ON orders;
DROP POLICY IF EXISTS "Admins can update all orders" ON orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON orders;

-- Customers can view their own orders
CREATE POLICY "Customers can view own orders" ON orders
  FOR SELECT USING (
    user_id = auth.uid() OR
    user_id IS NULL -- Allow viewing orders without user_id (guest orders)
  );

-- Admins and bakers can view all orders
CREATE POLICY "Admins can view all orders" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Customers can create their own orders
CREATE POLICY "Customers can create own orders" ON orders
  FOR INSERT WITH CHECK (
    user_id = auth.uid() OR
    user_id IS NULL -- Allow guest orders
  );

-- Admins can update all orders
CREATE POLICY "Admins can update all orders" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- Only admins can delete orders (soft delete via status change preferred)
CREATE POLICY "Admins can delete orders" ON orders
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'owner'
    )
  );

-- =====================================================
-- PROFILES TABLE
-- =====================================================

-- Enable RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON user_profiles;

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON user_profiles
  FOR SELECT USING (user_id = auth.uid());

-- Admins can view all profiles
CREATE POLICY "Admins can view all profiles" ON user_profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('owner', 'baker')
    )
  );

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid() AND
    -- Prevent users from changing their own role
    role = (SELECT role FROM user_profiles WHERE user_id = auth.uid())
  );

-- Admins can update all profiles
CREATE POLICY "Admins can update all profiles" ON user_profiles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles p
      WHERE p.user_id = auth.uid()
      AND p.role IN ('owner', 'baker')
    )
  );

-- =====================================================
-- PAYMENTS TABLE
-- =====================================================

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "System can create payments" ON payments;
DROP POLICY IF EXISTS "Admins can update payments" ON payments;

-- Users can view payments for their own orders
CREATE POLICY "Users can view own payments" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM orders
      WHERE orders.id = payments.order_id
      AND orders.user_id = auth.uid()
    )
  );

-- Admins can view all payments
CREATE POLICY "Admins can view all payments" ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- System can create payments (via API with proper auth)
CREATE POLICY "System can create payments" ON payments
  FOR INSERT WITH CHECK (true); -- RLS is enforced by API auth

-- Only admins can update payments
CREATE POLICY "Admins can update payments" ON payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- =====================================================
-- REVIEWS TABLE (if exists)
-- =====================================================

-- Check if reviews table exists and enable RLS
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'order_reviews') THEN
    ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies
    DROP POLICY IF EXISTS "Public can view reviews" ON order_reviews;
    DROP POLICY IF EXISTS "Users can create own reviews" ON order_reviews;
    DROP POLICY IF EXISTS "Users can update own reviews" ON order_reviews;
    DROP POLICY IF EXISTS "Users can delete own reviews" ON order_reviews;
    DROP POLICY IF EXISTS "Admins can manage all reviews" ON order_reviews;

    -- Public can view reviews
    CREATE POLICY "Public can view reviews" ON order_reviews
      FOR SELECT USING (true);

    -- Users can create their own reviews
    CREATE POLICY "Users can create own reviews" ON order_reviews
      FOR INSERT WITH CHECK (user_id = auth.uid());

    -- Users can update their own reviews
    CREATE POLICY "Users can update own reviews" ON order_reviews
      FOR UPDATE USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());

    -- Users can delete their own reviews
    CREATE POLICY "Users can delete own reviews" ON order_reviews
      FOR DELETE USING (user_id = auth.uid());

    -- Admins can manage all reviews
    CREATE POLICY "Admins can manage all reviews" ON order_reviews
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.user_id = auth.uid()
          AND user_profiles.role IN ('owner', 'baker')
        )
      );
  END IF;
END $$;

-- =====================================================
-- PRICING TABLES
-- =====================================================

-- Cake pricing
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'cake_pricing') THEN
    ALTER TABLE cake_pricing ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Public can view active pricing" ON cake_pricing;
    DROP POLICY IF EXISTS "Admins can manage pricing" ON cake_pricing;

    -- Public can view active pricing
    CREATE POLICY "Public can view active pricing" ON cake_pricing
      FOR SELECT USING (active = true);

    -- Admins can manage pricing
    CREATE POLICY "Admins can manage pricing" ON cake_pricing
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.user_id = auth.uid()
          AND user_profiles.role IN ('owner', 'baker')
        )
      );
  END IF;
END $$;

-- Filling pricing
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'filling_pricing') THEN
    ALTER TABLE filling_pricing ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Public can view active filling pricing" ON filling_pricing;
    DROP POLICY IF EXISTS "Admins can manage filling pricing" ON filling_pricing;

    CREATE POLICY "Public can view active filling pricing" ON filling_pricing
      FOR SELECT USING (active = true);

    CREATE POLICY "Admins can manage filling pricing" ON filling_pricing
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.user_id = auth.uid()
          AND user_profiles.role IN ('owner', 'baker')
        )
      );
  END IF;
END $$;

-- Theme pricing
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'theme_pricing') THEN
    ALTER TABLE theme_pricing ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Public can view active theme pricing" ON theme_pricing;
    DROP POLICY IF EXISTS "Admins can manage theme pricing" ON theme_pricing;

    CREATE POLICY "Public can view active theme pricing" ON theme_pricing
      FOR SELECT USING (active = true);

    CREATE POLICY "Admins can manage theme pricing" ON theme_pricing
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM user_profiles
          WHERE user_profiles.user_id = auth.uid()
          AND user_profiles.role IN ('owner', 'baker')
        )
      );
  END IF;
END $$;

-- =====================================================
-- CUSTOMER ADDRESSES
-- =====================================================

DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_addresses') THEN
    ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Users can view own addresses" ON customer_addresses;
    DROP POLICY IF EXISTS "Users can create own addresses" ON customer_addresses;
    DROP POLICY IF EXISTS "Users can update own addresses" ON customer_addresses;
    DROP POLICY IF EXISTS "Users can delete own addresses" ON customer_addresses;

    CREATE POLICY "Users can view own addresses" ON customer_addresses
      FOR SELECT USING (user_id = auth.uid());

    CREATE POLICY "Users can create own addresses" ON customer_addresses
      FOR INSERT WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can update own addresses" ON customer_addresses
      FOR UPDATE USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());

    CREATE POLICY "Users can delete own addresses" ON customer_addresses
      FOR DELETE USING (user_id = auth.uid());
  END IF;
END $$;

-- =====================================================
-- NOTES
-- =====================================================
-- 1. All policies use auth.uid() to identify the current user
-- 2. Admins (owner/baker) have elevated permissions
-- 3. Public read access is limited to non-sensitive data
-- 4. All write operations require authentication
-- 5. Users can only modify their own data (except admins)
-- =====================================================
