-- =====================================================
-- Pricing System Database Schema
-- =====================================================
-- Flexible pricing system for cake orders
-- =====================================================

-- Cake Size Pricing
CREATE TABLE IF NOT EXISTS cake_pricing (
  id SERIAL PRIMARY KEY,
  size VARCHAR(50) UNIQUE NOT NULL,
  base_price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Filling Pricing (Additional Costs)
CREATE TABLE IF NOT EXISTS filling_pricing (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  additional_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Theme Pricing (Additional Costs)
CREATE TABLE IF NOT EXISTS theme_pricing (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  additional_cost DECIMAL(10, 2) NOT NULL DEFAULT 0,
  description TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Delivery Zones
CREATE TABLE IF NOT EXISTS delivery_zones (
  id SERIAL PRIMARY KEY,
  zone_name VARCHAR(100) NOT NULL,
  base_fee DECIMAL(10, 2) NOT NULL DEFAULT 0,
  per_mile_rate DECIMAL(10, 2) NOT NULL DEFAULT 0,
  max_distance DECIMAL(10, 2), -- NULL = no limit
  zip_codes TEXT[], -- Array of zip codes in this zone
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tax Rates
CREATE TABLE IF NOT EXISTS tax_rates (
  id SERIAL PRIMARY KEY,
  state VARCHAR(2) NOT NULL,
  county VARCHAR(100),
  rate DECIMAL(5, 4) NOT NULL, -- e.g., 0.0825 for 8.25%
  effective_date DATE NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(state, county, effective_date)
);

-- Promo Codes
CREATE TABLE IF NOT EXISTS promo_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  discount_type VARCHAR(20) NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value DECIMAL(10, 2) NOT NULL,
  min_order_amount DECIMAL(10, 2) DEFAULT 0,
  max_discount_amount DECIMAL(10, 2), -- NULL = no limit
  valid_from TIMESTAMP NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  usage_limit INTEGER, -- NULL = unlimited
  usage_count INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CHECK (valid_until > valid_from)
);

-- Price History (Audit Trail)
CREATE TABLE IF NOT EXISTS price_history (
  id SERIAL PRIMARY KEY,
  pricing_type VARCHAR(50) NOT NULL, -- 'cake', 'filling', 'theme', 'delivery', 'tax'
  pricing_id INTEGER NOT NULL,
  old_value DECIMAL(10, 2),
  new_value DECIMAL(10, 2),
  changed_by INTEGER REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cake_pricing_active ON cake_pricing(active);
CREATE INDEX IF NOT EXISTS idx_filling_pricing_active ON filling_pricing(active);
CREATE INDEX IF NOT EXISTS idx_theme_pricing_active ON theme_pricing(active);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON delivery_zones(active);
CREATE INDEX IF NOT EXISTS idx_tax_rates_active ON tax_rates(active, state, county);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes(active, code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_valid ON promo_codes(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_price_history_pricing ON price_history(pricing_type, pricing_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_cake_pricing_updated_at BEFORE UPDATE ON cake_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_filling_pricing_updated_at BEFORE UPDATE ON filling_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_theme_pricing_updated_at BEFORE UPDATE ON theme_pricing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_delivery_zones_updated_at BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_rates_updated_at BEFORE UPDATE ON tax_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_promo_codes_updated_at BEFORE UPDATE ON promo_codes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log price changes
CREATE OR REPLACE FUNCTION log_price_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.base_price IS DISTINCT FROM NEW.base_price OR
     OLD.additional_cost IS DISTINCT FROM NEW.additional_cost OR
     OLD.base_fee IS DISTINCT FROM NEW.base_fee OR
     OLD.per_mile_rate IS DISTINCT FROM NEW.per_mile_rate OR
     OLD.rate IS DISTINCT FROM NEW.rate THEN
    
    INSERT INTO price_history (
      pricing_type,
      pricing_id,
      old_value,
      new_value,
      changed_by
    ) VALUES (
      TG_TABLE_NAME::text,
      NEW.id,
      COALESCE(OLD.base_price, OLD.additional_cost, OLD.base_fee, OLD.rate),
      COALESCE(NEW.base_price, NEW.additional_cost, NEW.base_fee, NEW.rate),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for price history
CREATE TRIGGER log_cake_pricing_changes AFTER UPDATE ON cake_pricing
  FOR EACH ROW EXECUTE FUNCTION log_price_change();

CREATE TRIGGER log_filling_pricing_changes AFTER UPDATE ON filling_pricing
  FOR EACH ROW EXECUTE FUNCTION log_price_change();

CREATE TRIGGER log_theme_pricing_changes AFTER UPDATE ON theme_pricing
  FOR EACH ROW EXECUTE FUNCTION log_price_change();

CREATE TRIGGER log_delivery_zones_changes AFTER UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION log_price_change();

CREATE TRIGGER log_tax_rates_changes AFTER UPDATE ON tax_rates
  FOR EACH ROW EXECUTE FUNCTION log_price_change();

-- Insert default pricing data
INSERT INTO cake_pricing (size, base_price, description, active) VALUES
  ('Small (6")', 25.00, 'Serves 6-8 people', true),
  ('Medium (8")', 35.00, 'Serves 10-12 people', true),
  ('Large (10")', 50.00, 'Serves 15-20 people', true),
  ('X-Large (12")', 70.00, 'Serves 25-30 people', true)
ON CONFLICT (size) DO NOTHING;

INSERT INTO filling_pricing (name, additional_cost, description, active) VALUES
  ('Vanilla', 0.00, 'Classic vanilla filling', true),
  ('Chocolate', 2.00, 'Rich chocolate filling', true),
  ('Strawberry', 3.00, 'Fresh strawberry filling', true),
  ('Tres Leches', 5.00, 'Traditional tres leches', true),
  ('Caramel', 3.00, 'Caramel filling', true),
  ('Lemon', 2.50, 'Lemon curd filling', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO theme_pricing (name, additional_cost, description, active) VALUES
  ('Simple', 0.00, 'Basic decoration', true),
  ('Standard', 10.00, 'Standard themed decoration', true),
  ('Elaborate', 25.00, 'Complex themed decoration', true),
  ('Custom Design', 50.00, 'Fully custom design', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO delivery_zones (zone_name, base_fee, per_mile_rate, max_distance, zip_codes, active) VALUES
  ('Local (0-5 miles)', 5.00, 1.50, 5.0, ARRAY['90001', '90002'], true),
  ('Nearby (5-10 miles)', 10.00, 2.00, 10.0, ARRAY['90003', '90004'], true),
  ('Extended (10-15 miles)', 15.00, 2.50, 15.0, ARRAY['90005', '90006'], true),
  ('Long Distance (15+ miles)', 20.00, 3.00, NULL, ARRAY['90007', '90008'], true)
ON CONFLICT DO NOTHING;

INSERT INTO tax_rates (state, county, rate, effective_date, active) VALUES
  ('CA', 'Los Angeles', 0.0975, CURRENT_DATE, true),
  ('CA', 'Orange', 0.0825, CURRENT_DATE, true),
  ('CA', NULL, 0.0725, CURRENT_DATE, true) -- Default CA rate
ON CONFLICT (state, county, effective_date) DO NOTHING;

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- Enable RLS on all pricing tables
ALTER TABLE cake_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE filling_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;

-- Public read access to active pricing
CREATE POLICY "Anyone can view active pricing" ON cake_pricing
  FOR SELECT USING (active = true);

CREATE POLICY "Anyone can view active filling pricing" ON filling_pricing
  FOR SELECT USING (active = true);

CREATE POLICY "Anyone can view active theme pricing" ON theme_pricing
  FOR SELECT USING (active = true);

CREATE POLICY "Anyone can view active delivery zones" ON delivery_zones
  FOR SELECT USING (active = true);

CREATE POLICY "Anyone can view active tax rates" ON tax_rates
  FOR SELECT USING (active = true);

CREATE POLICY "Anyone can view active promo codes" ON promo_codes
  FOR SELECT USING (active = true AND 
    valid_from <= CURRENT_TIMESTAMP AND 
    valid_until >= CURRENT_TIMESTAMP);

-- Admin/owner full access
CREATE POLICY "Admins can manage cake pricing" ON cake_pricing
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage filling pricing" ON filling_pricing
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage theme pricing" ON theme_pricing
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage delivery zones" ON delivery_zones
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage tax rates" ON tax_rates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can manage promo codes" ON promo_codes
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

CREATE POLICY "Admins can view price history" ON price_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role IN ('owner', 'baker')
    )
  );

-- =====================================================
-- Notes:
-- =====================================================
-- 1. All pricing tables have active flag for soft deletes
-- 2. Price history tracks all changes with audit trail
-- 3. RLS policies allow public read of active prices
-- 4. Only owners/bakers can modify pricing
-- 5. Promo codes have usage limits and validity periods
-- 6. Delivery zones support zip code arrays and distance-based pricing
-- 7. Tax rates support state/county specific rates
--
-- =====================================================
