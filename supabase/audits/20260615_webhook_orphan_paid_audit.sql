-- =====================================================================
-- Pre-deploy READ-ONLY production audit: orphan paid Stripe events
-- =====================================================================
-- Run this against PRODUCTION (Supabase project bebmkekmzcrgeraeakmp) BEFORE
-- applying migration 20260615T120000_webhook_event_processing_status.sql and
-- BEFORE deploying the stripe-webhook fix.
--
-- Purpose: find payments that Stripe accepted but whose order never landed --
-- the exact damage the dedup-poisoning bug could cause. These must be found and
-- manually recovered BEFORE the migration backfills statuses, otherwise the
-- evidence (a recorded webhook event with no matching order) is harder to spot.
--
-- SAFETY: every statement here is a SELECT. There are NO writes. Do NOT add
-- INSERT/UPDATE/DELETE. Do NOT modify production data. This file is in
-- supabase/audits/ (NOT supabase/migrations/) so `supabase db push` never runs
-- it automatically.
--
-- This audit is NOT a substitute for the Stripe Dashboard: a row appearing here
-- is a *candidate* orphan. Confirm each PaymentIntent in the Stripe Dashboard
-- (LIVE mode) before treating it as a real lost order.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Q1. Succeeded webhook events with NO matching orders row.
--     This is the primary orphan signal: Stripe says paid, we have no order.
-- ---------------------------------------------------------------------
SELECT
    e.event_id,
    e.received_at,
    e.payload->'data'->'object'->>'id'                              AS payment_intent_id,
    e.payload->'data'->'object'->'metadata'->>'pending_order_id'    AS pending_order_id,
    e.payload->'data'->'object'->'metadata'->>'order_number'        AS order_number,
    ((e.payload->'data'->'object'->>'amount')::numeric / 100)       AS amount_usd,
    e.payload->'data'->'object'->>'receipt_email'                   AS receipt_email
FROM stripe_webhook_events e
LEFT JOIN orders o
    ON o.payment_intent_id = e.payload->'data'->'object'->>'id'
WHERE e.event_type = 'payment_intent.succeeded'
  AND o.id IS NULL
ORDER BY e.received_at DESC;

-- ---------------------------------------------------------------------
-- Q2. Succeeded events whose pending_order is NOT in 'promoted' state.
--     Confirms the promote step never completed for that paid order.
--
--     The pending_order_id comes from free-form Stripe metadata, which on
--     legacy/edge events may be missing, empty, or non-UUID. Casting it
--     directly to uuid would abort this read-only audit with
--     "invalid input syntax for type uuid". Extract it as text in a CTE and
--     only cast when it matches the UUID shape; otherwise leave it NULL (the
--     LEFT JOIN then yields no pending row, which is itself a valid finding).
-- ---------------------------------------------------------------------
WITH succeeded AS (
    SELECT
        e.event_id,
        e.received_at,
        (e.payload->'data'->'object'->'metadata'->>'pending_order_id') AS pending_order_id_text
    FROM stripe_webhook_events e
    WHERE e.event_type = 'payment_intent.succeeded'
)
SELECT
    s.event_id,
    s.received_at,
    s.pending_order_id_text AS pending_order_id,
    p.status                AS pending_status,
    p.promoted_order_id,
    p.total_amount,
    p.customer_email
FROM succeeded s
LEFT JOIN pending_orders p
    ON p.id = CASE
        WHEN s.pending_order_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN s.pending_order_id_text::uuid
        ELSE NULL
    END
WHERE p.id IS NULL OR p.status <> 'promoted'
ORDER BY s.received_at DESC;

-- ---------------------------------------------------------------------
-- Q3. pending_orders that already have a PaymentIntent but never promoted.
--     Each payment_intent_id here must be checked in the Stripe Dashboard
--     (LIVE): if Stripe shows it 'succeeded', this is a lost paid order.
-- ---------------------------------------------------------------------
SELECT
    id                AS pending_order_id,
    order_number,
    status,
    payment_intent_id,
    total_amount,
    customer_email,
    customer_phone,
    created_at,
    expires_at
FROM pending_orders
WHERE status IN ('awaiting_payment', 'payment_failed')
  AND payment_intent_id IS NOT NULL
ORDER BY created_at DESC;

-- ---------------------------------------------------------------------
-- Q4. Summary counts — quick go/no-go before deploy.
--     Expect orphan_succeeded_events = 0. Any non-zero count means recover
--     those orders (or consciously accept them) BEFORE applying the migration.
-- ---------------------------------------------------------------------
SELECT
    (SELECT COUNT(*) FROM stripe_webhook_events
        WHERE event_type = 'payment_intent.succeeded')                       AS total_succeeded_events,
    (SELECT COUNT(*) FROM stripe_webhook_events e
        WHERE e.event_type = 'payment_intent.succeeded'
          AND NOT EXISTS (SELECT 1 FROM orders o
                          WHERE o.payment_intent_id = e.payload->'data'->'object'->>'id')) AS orphan_succeeded_events,
    (SELECT COUNT(*) FROM pending_orders
        WHERE status IN ('awaiting_payment','payment_failed')
          AND payment_intent_id IS NOT NULL)                                 AS pendings_with_pi_not_promoted;
