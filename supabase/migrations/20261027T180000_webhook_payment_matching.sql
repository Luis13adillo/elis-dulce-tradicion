-- ============================================================================
-- H1 + H3: verify the payment before promoting; never fail a promoted row
-- ============================================================================
-- H3: promote_pending_order never checked what was paid. The webhook now calls
--     promote_pending_order_verified, which locks the pending row and checks,
--     before promoting:
--       * amount_received (cents) = round(total_amount * 100)
--       * currency = 'usd'
--       * the PI id matches pending.payment_intent_id (when one is stored)
--       * an already-promoted row was paid by the SAME PI (else: duplicate)
--     On mismatch it does NOT promote; it records the reason in
--     payment_review_* columns and returns flagged=true so the webhook alerts
--     the owner and acknowledges the event (a retry would mismatch again).
-- H1: mark_pending_order_failed no longer touches a 'promoted' row (an
--     out-of-order payment_failed after a successful retry used to flip a
--     paid order back to payment_failed and email "payment failed").
-- ============================================================================

ALTER TABLE public.pending_orders
    ADD COLUMN IF NOT EXISTS payment_review_reason text,
    ADD COLUMN IF NOT EXISTS payment_review_details jsonb,
    ADD COLUMN IF NOT EXISTS payment_review_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_pending_orders_payment_review
    ON public.pending_orders (payment_review_at)
    WHERE payment_review_reason IS NOT NULL;

CREATE OR REPLACE FUNCTION public.promote_pending_order_verified(
    p_pending_id uuid,
    p_payment_intent_id text,
    p_amount_received_cents integer,
    p_currency text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending  pending_orders;
    v_expected integer;
    v_reason   text;
    v_details  jsonb;
BEGIN
    SELECT * INTO v_pending FROM pending_orders WHERE id = p_pending_id FOR UPDATE;
    IF v_pending IS NULL THEN
        RAISE EXCEPTION 'pending_order not found: %', p_pending_id;
    END IF;

    v_expected := round(COALESCE(v_pending.total_amount, 0) * 100)::int;

    IF v_pending.status = 'promoted' THEN
        IF v_pending.payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
            v_reason := 'duplicate_payment';
        END IF;
    ELSIF lower(COALESCE(p_currency, '')) <> 'usd' THEN
        v_reason := 'currency_mismatch';
    ELSIF p_amount_received_cents IS DISTINCT FROM v_expected THEN
        v_reason := 'amount_mismatch';
    ELSIF v_pending.payment_intent_id IS NOT NULL
          AND v_pending.payment_intent_id <> p_payment_intent_id THEN
        v_reason := 'payment_intent_mismatch';
    END IF;

    IF v_reason IS NOT NULL THEN
        v_details := jsonb_build_object(
            'payment_intent_id', p_payment_intent_id,
            'expected_payment_intent_id', v_pending.payment_intent_id,
            'amount_received_cents', p_amount_received_cents,
            'expected_cents', v_expected,
            'currency', p_currency,
            'pending_status', v_pending.status
        );
        UPDATE pending_orders
        SET payment_review_reason = v_reason,
            payment_review_details = v_details,
            payment_review_at = now()
        WHERE id = p_pending_id;
        RETURN jsonb_build_object(
            'flagged', true,
            'reason', v_reason,
            'details', v_details,
            'order_number', v_pending.order_number,
            'promoted_order_id', v_pending.promoted_order_id
        );
    END IF;

    -- Same transaction; promote_pending_order re-takes the row lock we hold.
    RETURN promote_pending_order(p_pending_id, p_payment_intent_id, p_pending_id::text)
        || jsonb_build_object('flagged', false);
END;
$$;

REVOKE ALL ON FUNCTION public.promote_pending_order_verified(uuid, text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_pending_order_verified(uuid, text, integer, text) TO service_role;

-- H1: guard against already-promoted rows. Same signature, grants preserved.
CREATE OR REPLACE FUNCTION public.mark_pending_order_failed(
    p_pending_id uuid,
    p_payment_intent_id text,
    p_error_message text,
    p_error_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row pending_orders;
BEGIN
    SELECT * INTO v_row FROM pending_orders WHERE id = p_pending_id FOR UPDATE;
    IF v_row IS NULL THEN
        RAISE EXCEPTION 'pending_order not found: %', p_pending_id;
    END IF;

    IF v_row.status = 'promoted' THEN
        -- Paid already (e.g. decline then successful retry, events out of
        -- order). Leave it alone; the webhook skips the failure emails.
        RETURN jsonb_build_object('skipped', true, 'reason', 'already_promoted', 'order_number', v_row.order_number);
    END IF;

    UPDATE pending_orders
    SET status = 'payment_failed',
        payment_intent_id = p_payment_intent_id,
        error_message = p_error_message,
        error_code = p_error_code,
        -- Extend expiry so the customer has 24h from the failure to retry
        expires_at = now() + interval '24 hours'
    WHERE id = p_pending_id
    RETURNING * INTO v_row;

    RETURN to_jsonb(v_row);
END;
$$;

COMMENT ON COLUMN public.pending_orders.payment_review_reason IS
    'Set by promote_pending_order_verified when a succeeded PI did not match (amount_mismatch, currency_mismatch, payment_intent_mismatch, duplicate_payment). The order was NOT promoted; owner was alerted.';
