-- =====================================================
-- Cake Menu Structure Update
-- =====================================================
-- Requested by owner (2026-06-17). Four data-only changes to the
-- custom-cake order form options. No schema (DDL) changes.
--
-- 1. Red Velvet / Yellow Cake / Carrot Cake are FLAVORS (bread types),
--    not fillings. Add them to bread_types; deactivate the old
--    red-velvet filling row.
-- 2. Add fillings: Zarzamora, Chocolate Mousse, Strawberry Mousse,
--    Dulce de Leche, Strawberry Shortcake.
-- 3. Replace the generic "Mousse" filling with the two specific mousse
--    flavors (deactivate generic 'mousse').
-- 4. Premium filling upcharge (Option A — data only): set the 8" and 10"
--    upcharge to $10 and remove the full-sheet upcharge. This stays on
--    the existing size-keyed schema and is only acceptable because the
--    ONLY premium fillings are Tiramisu and Relleno de Flan, so the
--    per-size amount effectively applies to just those two. The premium
--    upcharge schema is NOT changed; per-filling upcharges remain
--    unsupported (would require a schema + RPC + UI change).
--
-- Idempotent: all INSERTs use ON CONFLICT (value) DO UPDATE so this can
-- be re-applied and will reconcile rows the owner may have added by hand
-- via the Supabase Table Editor.
--
-- Spanish labels below are best-guess and should be confirmed by the owner.
-- =====================================================

BEGIN;

-- ----------------------------------------------------------------------
-- 1. Flavors: add Red Velvet, Yellow Cake, Carrot Cake as bread types
-- ----------------------------------------------------------------------
INSERT INTO bread_types (value, label_en, description, active, sort_order) VALUES
    ('red-velvet',  'Red Velvet',  'Rich & Velvety',    true, 4),
    ('yellow-cake', 'Yellow Cake', 'Classic & Buttery', true, 5),
    ('carrot-cake', 'Carrot Cake', 'Spiced & Moist',    true, 6)
ON CONFLICT (value) DO UPDATE SET
    label_en    = EXCLUDED.label_en,
    description = EXCLUDED.description,
    active      = true,
    sort_order  = EXCLUDED.sort_order;

-- Red Velvet is now a flavor, not a filling — retire the old filling row.
-- Deactivated (not deleted) so it is recoverable and any historical
-- lookups still resolve. Orders snapshot their own filling text, so this
-- does not affect past orders.
UPDATE cake_fillings SET active = false WHERE value = 'red-velvet';

-- ----------------------------------------------------------------------
-- 2 & 3. Fillings: replace generic Mousse with specific mousse flavors,
--        add the remaining missing fillings.
-- ----------------------------------------------------------------------

-- Retire the generic "Mousse" filling in favor of specific flavors.
UPDATE cake_fillings SET active = false WHERE value = 'mousse';

INSERT INTO cake_fillings (value, label_en, sub_label, is_premium, active, sort_order) VALUES
    ('zarzamora',            'Zarzamora',           'Blackberry',          false, true, 15),
    ('chocolate-mousse',     'Mousse de Chocolate', 'Chocolate Mousse',    false, true, 16),
    ('strawberry-mousse',    'Mousse de Fresa',     'Strawberry Mousse',   false, true, 17),
    ('dulce-de-leche',       'Dulce de Leche',      'Caramel',             false, true, 18),
    ('strawberry-shortcake', 'Strawberry Shortcake','Fresas con Crema',    false, true, 19)
ON CONFLICT (value) DO UPDATE SET
    label_en   = EXCLUDED.label_en,
    sub_label  = EXCLUDED.sub_label,
    is_premium = EXCLUDED.is_premium,
    active     = true,
    sort_order = EXCLUDED.sort_order;

-- ----------------------------------------------------------------------
-- 4. Premium filling upcharge (Option A) — data only, no schema change.
--    8" and 10" upcharge = $10; full-sheet upcharge removed (deactivated).
--    Safe because Tiramisu and Relleno de Flan are the only premium
--    fillings, so this per-size amount only ever applies to them.
-- ----------------------------------------------------------------------
INSERT INTO premium_filling_upcharges (size_value, label_en, label_es, upcharge, active) VALUES
    ('8-round',  '8"',  '8"',  10.00, true),
    ('10-round', '10"', '10"', 10.00, true)
ON CONFLICT (size_value) DO UPDATE SET
    label_en = EXCLUDED.label_en,
    label_es = EXCLUDED.label_es,
    upcharge = EXCLUDED.upcharge,
    active   = true;

-- Remove the full-sheet premium upcharge (deactivate; reversible).
UPDATE premium_filling_upcharges SET active = false WHERE size_value = 'full-sheet';

COMMIT;
