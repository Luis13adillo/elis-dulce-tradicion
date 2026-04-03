-- =====================================================
-- Order Form Options: Pricing Tables
-- Phase 08: Menu Database Migration
-- =====================================================
-- Replaces hardcoded arrays in Order.tsx (lines 22-61)
-- Owner edits via Supabase Table Editor (no UI in Phase 8)
-- TIME_OPTIONS excluded: Phase 5 (FIX-07) already handles
-- time slots dynamically via business_hours table.
-- =====================================================

-- 1. Cake Sizes
CREATE TABLE IF NOT EXISTS cake_sizes (
    id BIGSERIAL PRIMARY KEY,
    value TEXT UNIQUE NOT NULL,
    label_en TEXT NOT NULL,
    label_es TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    serves TEXT NOT NULL,
    featured BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0
);

-- 2. Bread Types
CREATE TABLE IF NOT EXISTS bread_types (
    id BIGSERIAL PRIMARY KEY,
    value TEXT UNIQUE NOT NULL,
    label_en TEXT NOT NULL,
    description TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0
);

-- 3. Cake Fillings
CREATE TABLE IF NOT EXISTS cake_fillings (
    id BIGSERIAL PRIMARY KEY,
    value TEXT UNIQUE NOT NULL,
    label_en TEXT NOT NULL,
    sub_label TEXT NOT NULL,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0
);

-- 4. Premium Filling Upcharges
-- Maps size_value (e.g. '10-round', 'full-sheet') to upcharge amount
CREATE TABLE IF NOT EXISTS premium_filling_upcharges (
    id BIGSERIAL PRIMARY KEY,
    size_value TEXT UNIQUE NOT NULL,
    label_en TEXT NOT NULL,
    label_es TEXT NOT NULL,
    upcharge DECIMAL(10,2) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true
);

-- =====================================================
-- RLS Policies
-- =====================================================

ALTER TABLE cake_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE bread_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE cake_fillings ENABLE ROW LEVEL SECURITY;
ALTER TABLE premium_filling_upcharges ENABLE ROW LEVEL SECURITY;

-- Public can SELECT active rows (needed for order form, unauthenticated customers)
CREATE POLICY "Public can view active cake sizes"
    ON cake_sizes FOR SELECT
    USING (active = true);

CREATE POLICY "Public can view active bread types"
    ON bread_types FOR SELECT
    USING (active = true);

CREATE POLICY "Public can view active cake fillings"
    ON cake_fillings FOR SELECT
    USING (active = true);

CREATE POLICY "Public can view active premium upcharges"
    ON premium_filling_upcharges FOR SELECT
    USING (active = true);

-- Only service_role can INSERT/UPDATE/DELETE (owner uses Table Editor which uses service_role)
CREATE POLICY "Service role full access to cake_sizes"
    ON cake_sizes FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to bread_types"
    ON bread_types FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to cake_fillings"
    ON cake_fillings FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to premium_filling_upcharges"
    ON premium_filling_upcharges FOR ALL
    USING (auth.role() = 'service_role');

-- =====================================================
-- Seed Data (exact values from Order.tsx lines 22-61)
-- =====================================================

INSERT INTO cake_sizes (value, label_en, label_es, price, serves, featured, sort_order) VALUES
    ('6-round',       '6" Round',       '6" Redondo',        30.00,  '6-8',    false, 1),
    ('8-round',       '8" Round',       '8" Redondo',        35.00,  '10-12',  false, 2),
    ('10-round',      '10" Round',      '10" Redondo',       55.00,  '20-25',  true,  3),
    ('12-round',      '12" Round',      '12" Redondo',       85.00,  '30-35',  false, 4),
    ('quarter-sheet', '1/4 Sheet',      '1/4 Plancha',       70.00,  '20-25',  false, 5),
    ('half-sheet',    '1/2 Sheet',      '1/2 Plancha',       135.00, '40-50',  false, 6),
    ('full-sheet',    'Full Sheet',     'Plancha Completa',  240.00, '90-100', false, 7),
    ('8-hard-shape',  '8" Hard Shape',  '8" Forma Especial', 50.00,  '10-12',  false, 8)
ON CONFLICT (value) DO NOTHING;

INSERT INTO bread_types (value, label_en, description, sort_order) VALUES
    ('tres-leches', '3 Leches',  'Moist & Traditional', 1),
    ('chocolate',   'Chocolate', 'Rich & Decadent',     2),
    ('vanilla',     'Regular',   'Classic Vanilla',     3)
ON CONFLICT (value) DO NOTHING;

INSERT INTO cake_fillings (value, label_en, sub_label, is_premium, sort_order) VALUES
    ('strawberry',     'Fresa',           'Strawberry',      false, 1),
    ('chocolate-chip', 'Choco Chip',      'Dark Chocolate',  false, 2),
    ('mocha',          'Mocha',           'Coffee Blend',    false, 3),
    ('mousse',         'Mousse',          'Whipped',         false, 4),
    ('napolitano',     'Napolitano',      'Mix',             false, 5),
    ('pecan',          'Nuez',            'Pecan',           false, 6),
    ('coconut',        'Coco',            'Coconut',         false, 7),
    ('pineapple',      'Pina',            'Pineapple',       false, 8),
    ('pina-colada',    'Pina Colada',     'Tropical',        false, 9),
    ('peach',          'Durazno',         'Peach',           false, 10),
    ('tiramisu',       'Tiramisu',        'Italian Style',   true,  11),
    ('relleno-flan',   'Relleno de Flan', 'Flan Filling',    true,  12),
    ('oreo',           'Oreo',            'Cookies & Cream', false, 13),
    ('red-velvet',     'Red Velvet',      'Cream Cheese',    false, 14)
ON CONFLICT (value) DO NOTHING;

INSERT INTO premium_filling_upcharges (size_value, label_en, label_es, upcharge) VALUES
    ('10-round',   '10"',        '10"',              5.00),
    ('full-sheet', 'Full Sheet', 'Plancha Completa', 20.00)
ON CONFLICT (size_value) DO NOTHING;
