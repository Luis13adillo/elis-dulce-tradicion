-- Webhook event processing-status tracking
--
-- Fixes a dedup-poisoning bug in stripe-webhook (Tier A payments).
--
-- BEFORE: the webhook inserted the Stripe event_id into stripe_webhook_events
-- *before* doing any work, then processed (promote_pending_order + email). The
-- insert is its own committed transaction, separate from the processing calls.
-- If processing then failed (transient DB error, lock timeout, RPC throw), the
-- handler returned 500 so Stripe would retry — but the dedup row was already
-- committed. On retry the insert hit the 23505 unique violation and the handler
-- short-circuited as a "duplicate," so the event was NEVER reprocessed. Result:
-- customer charged, pending_order never promoted, no order at the kitchen, no
-- confirmation email. This is a plausible root cause of the "orders not falling
-- into the system" reports.
--
-- AFTER: the dedup row carries a processing status. The webhook only treats a
-- duplicate as a no-op when the prior attempt reached 'processed'. A row left in
-- 'processing' or 'failed' (an incomplete prior attempt) is reprocessed on the
-- next Stripe retry. promote_pending_order is already idempotent (it locks the
-- pending row and returns already_promoted on a second call), so reprocessing is
-- safe and never double-creates an order or double-sends the email.
--
-- Scope: dedup/idempotency bookkeeping only. No change to promote_pending_order,
-- create_pending_order, or any order/payment row. Backward compatible.

BEGIN;

-- 1. Add the tracking columns (nullable first so we can backfill safely).
ALTER TABLE stripe_webhook_events
    ADD COLUMN IF NOT EXISTS status       text,
    ADD COLUMN IF NOT EXISTS processed_at timestamptz,
    ADD COLUMN IF NOT EXISTS last_error   text;

-- 2. Backfill existing rows. Under the old insert-before-process logic, an
--    existing row meant "we already received (and almost always processed)
--    this event." Mark them 'processed' so historical events keep
--    short-circuiting and are not reprocessed if Stripe ever re-delivers.
UPDATE stripe_webhook_events SET status = 'processed' WHERE status IS NULL;

-- 3. Now enforce the default + NOT NULL + allowed values.
ALTER TABLE stripe_webhook_events
    ALTER COLUMN status SET DEFAULT 'processing',
    ALTER COLUMN status SET NOT NULL;

ALTER TABLE stripe_webhook_events
    DROP CONSTRAINT IF EXISTS stripe_webhook_events_status_check;
ALTER TABLE stripe_webhook_events
    ADD CONSTRAINT stripe_webhook_events_status_check
        CHECK (status IN ('received', 'processing', 'processed', 'failed'));

-- 4. Helps the prune job and any "stuck processing" diagnostics.
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
    ON stripe_webhook_events (status)
    WHERE status <> 'processed';

COMMIT;
