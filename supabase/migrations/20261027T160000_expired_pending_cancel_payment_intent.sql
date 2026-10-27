-- ============================================================================
-- H4: cancel Stripe PaymentIntents on expired pending orders
-- ============================================================================
-- prune_expired_pending_orders (pg_cron, :05 hourly) marks lapsed rows
-- 'expired' but cannot call Stripe. review-sweeps (:20 hourly) now cancels
-- the PI of each expired row and stamps the two columns below.
--
-- The prune is amended so an expired row whose PI has NOT been resolved yet
-- is never deleted — deleting it is what turned a late payment into a
-- "pending_order not found" webhook retry loop with no order.
-- Otherwise identical to the 20260728T150000 definition.
-- ============================================================================

ALTER TABLE public.pending_orders
    ADD COLUMN IF NOT EXISTS payment_intent_canceled_at timestamptz,
    ADD COLUMN IF NOT EXISTS payment_intent_cancel_status text;

CREATE INDEX IF NOT EXISTS idx_pending_orders_expired_uncanceled_pi
    ON public.pending_orders (id)
    WHERE status = 'expired' AND payment_intent_id IS NOT NULL AND payment_intent_canceled_at IS NULL;

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
      AND image_review_result IS NULL
      -- keep rows until review-sweeps has resolved their PaymentIntent
      AND (payment_intent_id IS NULL OR payment_intent_canceled_at IS NOT NULL);

    DELETE FROM stripe_webhook_events
    WHERE received_at < now() - interval '30 days';

    RETURN v_marked;
END;
$$;

COMMENT ON COLUMN public.pending_orders.payment_intent_canceled_at IS
    'When review-sweeps resolved the Stripe PI of an expired row (canceled, already canceled, paid late, or missing).';
COMMENT ON COLUMN public.pending_orders.payment_intent_cancel_status IS
    'canceled | already_canceled | succeeded_late | missing. succeeded_late = customer paid after expiry; owner was alerted.';
