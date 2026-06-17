-- =====================================================
-- Menu data correction (2026-06-17) — DATA ONLY
-- =====================================================
-- No schema (DDL), RPC, UI, checkout, payment, or styling changes.
--
-- 1) 1/4 Sheet (quarter-sheet): base price $70 -> $75, serves "20-25" -> "20-30"
--    (owner requirement).
-- 2) Cosmetic Spanish label fix: "Pina" -> "Piña", "Pina Colada" -> "Piña Colada".
--
-- Strawberry Shortcake label intentionally NOT changed here — pending owner
-- confirmation of the Spanish/English label preference.
--
-- Idempotent: UPDATEs are scoped by `value`; the label fixes are additionally
-- guarded on the current value so re-running is a no-op.
-- =====================================================

BEGIN;

UPDATE cake_sizes
   SET price  = 75.00,
       serves = '20-30'
 WHERE value = 'quarter-sheet';

UPDATE cake_fillings
   SET label_en = 'Piña'
 WHERE value = 'pineapple' AND label_en = 'Pina';

UPDATE cake_fillings
   SET label_en = 'Piña Colada'
 WHERE value = 'pina-colada' AND label_en = 'Pina Colada';

COMMIT;
