-- Widen customer free-text columns on `orders` from varchar(100) to text.
--
-- INCIDENT (2026-06-27): customers who typed a cake description longer than
-- 100 characters paid successfully, but the order was NEVER created and the
-- money was captured with no record (silent orphan payments). Root cause:
--
--   promote_pending_order() (called by the stripe-webhook on
--   payment_intent.succeeded) does:
--       INSERT INTO orders (..., theme, ...) VALUES (..., v_pending.theme, ...)
--   pending_orders.theme is unlimited `text`; orders.theme is varchar(100).
--   A theme > 100 chars raises 22001 "value too long for type character
--   varying(100)", the webhook returns 500, Stripe retries, the insert fails
--   identically every time, and the pending row is never promoted.
--
-- Evidence: stripe_webhook_events had 2 payment_intent.succeeded rows stuck at
-- status='failed' with last_error='value too long for type character
-- varying(100)' (06-26 14:37 = ORD-76MACA2C, theme 218 chars, $35; 06-27 20:35
-- = ORD-7M2CB3ZU, theme 319 chars, $240). Both PaymentIntents are `succeeded`
-- in live Stripe. Both had no orders row.
--
-- FIX: align orders' customer free-text columns with pending_orders (text), so
-- the webhook promotion can never overflow on a long-but-valid value. Widening
-- varchar(100) -> text is non-destructive: no existing data changes, no rewrite
-- of meaning, no constraint relaxed other than the arbitrary length cap.
--
-- Scope: only the varchar(100) columns that promote_pending_order copies from
-- an unlimited-text pending_orders source (theme, filling, delivery_apartment,
-- delivery_zone). Short/controlled columns (order_number, cake_size,
-- delivery_option, customer_language, customer_phone) are left untouched.

BEGIN;

ALTER TABLE public.orders ALTER COLUMN theme              TYPE text;
ALTER TABLE public.orders ALTER COLUMN filling            TYPE text;
ALTER TABLE public.orders ALTER COLUMN delivery_apartment TYPE text;
ALTER TABLE public.orders ALTER COLUMN delivery_zone      TYPE text;

COMMIT;
