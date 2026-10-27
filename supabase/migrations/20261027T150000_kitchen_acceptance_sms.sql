-- ============================================================================
-- Kitchen acceptance backup SMS — bookkeeping columns
-- ============================================================================
-- The kitchen-acceptance-alerts Edge Function claims a paid, still-'pending'
-- order by stamping kitchen_alert_sms_at (NULL -> now) before attempting the
-- backup text, so overlapping cron runs can never send twice. The outcome
-- ('disabled', 'no_provider', 'no_recipient', 'sent', 'error') is recorded in
-- kitchen_alert_sms_status for auditing.
--
-- Additive only. The pg_cron schedule is NOT in this file (it needs the
-- project URL and CRON_SECRET substituted, like review-sweeps); see the PR
-- description for the snippet to run after deploying the function.
-- ============================================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS kitchen_alert_sms_at timestamptz,
    ADD COLUMN IF NOT EXISTS kitchen_alert_sms_status text;

CREATE INDEX IF NOT EXISTS idx_orders_unaccepted_paid
    ON public.orders (created_at)
    WHERE status = 'pending' AND payment_status = 'paid' AND kitchen_alert_sms_at IS NULL;

COMMENT ON COLUMN public.orders.kitchen_alert_sms_at IS
    'When kitchen-acceptance-alerts claimed this order for the 3-minute unaccepted backup SMS. NULL = not attempted.';
COMMENT ON COLUMN public.orders.kitchen_alert_sms_status IS
    'Outcome of the backup SMS attempt: disabled | no_provider | no_recipient | sent | error.';
