-- ============================================================================
-- Image review workflow — Phase 1 schema (pre-payment AI photo review)
-- ============================================================================
-- Adds the review state to pending_orders (parallel to the payment-lifecycle
-- `status` machine — deliberately NOT a new orders status), the feature flag +
-- knobs on business_settings, the staff read grant, an audit trigger, and the
-- prune cron that was defined in 20260422 but never actually scheduled on the
-- new production project (verified live 2026-07-28: cron.job had only
-- daily-sales-report, and 25 awaiting_payment rows sat past expiry unmarked).
--
-- Review status meanings:
--   not_required   — no reference photo on the order (or feature off)
--   pending        — photo present, AI verdict not recorded yet
--   passed         — AI verdict MATCH (or shadow mode recorded-and-passed)
--   needs_review   — MISMATCH / UNCERTAIN / ANALYSIS_FAILED / timeout / refusal
--   approved       — staff approved (as-is or with revisions); payment window open
--   declined       — staff declined the request
--   review_expired — hold or payment window lapsed; reopenable by staff
--
-- Everything here is additive. Rollback = feature flag 'off' (columns inert).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. pending_orders review columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.pending_orders
    ADD COLUMN IF NOT EXISTS image_review_status text NOT NULL DEFAULT 'not_required',
    ADD COLUMN IF NOT EXISTS image_review_result jsonb,
    ADD COLUMN IF NOT EXISTS image_reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS payment_link_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS payment_reminder_sent_at timestamptz,
    ADD COLUMN IF NOT EXISTS price_revision int NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS original_total_amount numeric(10,2),
    ADD COLUMN IF NOT EXISTS review_resolved_by uuid,
    ADD COLUMN IF NOT EXISTS review_resolved_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pending_orders_image_review_status_check'
          AND conrelid = 'public.pending_orders'::regclass
    ) THEN
        ALTER TABLE public.pending_orders
            ADD CONSTRAINT pending_orders_image_review_status_check
            CHECK (image_review_status IN (
                'not_required', 'pending', 'passed', 'needs_review',
                'approved', 'declined', 'review_expired'
            ));
    END IF;
END $$;

-- Queue + sweep lookups. The existing idx_pending_orders_status_expires is
-- partial on status='awaiting_payment' and does not cover review states.
CREATE INDEX IF NOT EXISTS idx_pending_orders_image_review
    ON public.pending_orders (image_review_status, expires_at)
    WHERE image_review_status IN ('needs_review', 'approved', 'review_expired');

-- ---------------------------------------------------------------------------
-- 2. business_settings feature flag + knobs (house pattern: one column per
--    setting, read with SELECT ... LIMIT 1, like online_orders_paused)
-- ---------------------------------------------------------------------------
ALTER TABLE public.business_settings
    ADD COLUMN IF NOT EXISTS image_review_mode text NOT NULL DEFAULT 'off',
    ADD COLUMN IF NOT EXISTS review_payment_link_hours int NOT NULL DEFAULT 48,
    ADD COLUMN IF NOT EXISTS review_hold_days int NOT NULL DEFAULT 7,
    ADD COLUMN IF NOT EXISTS review_reminder_hours int NOT NULL DEFAULT 24;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'business_settings_image_review_mode_check'
          AND conrelid = 'public.business_settings'::regclass
    ) THEN
        ALTER TABLE public.business_settings
            ADD CONSTRAINT business_settings_image_review_mode_check
            CHECK (image_review_mode IN ('off', 'shadow', 'enforce'));
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Staff read access. pending_orders has had staff/own-rows SELECT RLS
--    policies since 20260422, but NO table-level grant — PostgREST checks
--    grants before RLS, so the review queue would silently 42501 without
--    this (the same trap as the 20260620 grant incidents). anon is
--    deliberately excluded: customers reach their pending order only through
--    the get_pending_order RPC.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.pending_orders TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Audit history for review actions — reuse the existing generic
--    audit_table_change() trigger (full old/new row snapshots into
--    audit_logs, staff-only read). pending_orders had no audit trigger.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS audit_pending_orders_trigger ON public.pending_orders;
CREATE TRIGGER audit_pending_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.pending_orders
    FOR EACH ROW EXECUTE FUNCTION audit_table_change();

-- ---------------------------------------------------------------------------
-- 5. Prune function, amended for review rows:
--    * rows whose hold/payment window lapses get image_review_status
--      'review_expired' so the staff queue can list them as reopenable;
--    * rows that ever had a review verdict are NEVER auto-deleted (reopenable
--      history + audit); only never-reviewed junk is deleted after 7 days.
--    Otherwise identical to the 20260422 definition.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prune_expired_pending_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_marked int;
BEGIN
    UPDATE pending_orders
    SET status = 'expired',
        image_review_status = CASE
            WHEN image_review_status IN ('needs_review', 'approved')
                THEN 'review_expired'
            ELSE image_review_status
        END
    WHERE status IN ('awaiting_payment', 'payment_failed')
      AND expires_at < now();
    GET DIAGNOSTICS v_marked = ROW_COUNT;

    DELETE FROM pending_orders
    WHERE status = 'expired'
      AND updated_at < now() - interval '7 days'
      AND image_review_result IS NULL;

    -- Also prune old webhook dedup records after 30d — they're only useful
    -- as long as Stripe might retry the event.
    DELETE FROM stripe_webhook_events
    WHERE received_at < now() - interval '30 days';

    RETURN v_marked;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Actually schedule the prune (pure SQL job, project-agnostic). Verified
--    missing on prod 2026-07-28 despite the 20260422 migration defining it.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    PERFORM cron.unschedule('prune-expired-pending-orders');
EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist yet
END $$;

SELECT cron.schedule(
    'prune-expired-pending-orders',
    '5 * * * *',
    $$SELECT public.prune_expired_pending_orders();$$
);

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN public.pending_orders.image_review_status IS
    'Pre-payment photo review state. Parallel to the payment-lifecycle status column; create-payment-intent blocks PI creation in enforce mode unless passed/approved (or no photo).';
COMMENT ON COLUMN public.pending_orders.image_review_result IS
    'AI verdict + staff resolution history (jsonb). Never exposed to customers: not returned by get_pending_order or get_public_order.';
COMMENT ON COLUMN public.pending_orders.price_revision IS
    'Bumped on every staff price change. create-payment-intent versions its Stripe idempotency key with this so a revised price can never replay the old-amount PaymentIntent.';
COMMENT ON COLUMN public.business_settings.image_review_mode IS
    'off = feature inert; shadow = record AI verdicts, never gate (calibration); enforce = block payment until passed/approved.';
