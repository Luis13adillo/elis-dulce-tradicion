-- ============================================================================
-- M5: refund tracking — refunded_cents with a DB cap, webhook-driven status
-- ============================================================================
-- orders.refund_amount (numeric dollars) is written by order-cancel BEFORE
-- Stripe confirms anything, so it is the *requested* refund. refunded_cents
-- is the amount Stripe has actually refunded, set only by the stripe-webhook
-- through apply_stripe_refund(). The CHECK makes over-refunding impossible
-- at the database level regardless of which code path writes it.
-- ============================================================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0;

-- Backfill from rows the old webhook already marked refunded (it wrote
-- charge.amount_refunded into refund_amount). Capped so the CHECK holds.
UPDATE public.orders
SET refunded_cents = LEAST(
        GREATEST(round(COALESCE(refund_amount, 0) * 100)::int, 0),
        round(COALESCE(total_amount, 0) * 100)::int)
WHERE payment_status IN ('refunded', 'partially_refunded')
  AND refunded_cents = 0;

ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS orders_refunded_cents_cap;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_refunded_cents_cap
    CHECK (refunded_cents >= 0 AND refunded_cents <= round(COALESCE(total_amount, 0) * 100));

-- Called by stripe-webhook on charge.refunded / charge.refund.updated.
-- p_amount_refunded_cents is Stripe's cumulative charge.amount_refunded, so
-- the update is monotonic (GREATEST) and safe against out-of-order delivery.
CREATE OR REPLACE FUNCTION public.apply_stripe_refund(
    p_payment_intent_id text,
    p_amount_refunded_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order  orders;
    v_total  integer;
    v_new    integer;
BEGIN
    IF p_payment_intent_id IS NULL OR p_amount_refunded_cents IS NULL OR p_amount_refunded_cents < 0 THEN
        RAISE EXCEPTION 'apply_stripe_refund: invalid arguments';
    END IF;

    SELECT * INTO v_order FROM orders
    WHERE stripe_payment_id = p_payment_intent_id OR payment_intent_id = p_payment_intent_id
    ORDER BY id
    LIMIT 1
    FOR UPDATE;

    IF v_order IS NULL THEN
        RETURN jsonb_build_object('found', false);
    END IF;

    v_total := round(COALESCE(v_order.total_amount, 0) * 100)::int;
    IF p_amount_refunded_cents > v_total THEN
        -- Surface as a real error; the CHECK would reject it anyway.
        RAISE EXCEPTION 'refund % cents exceeds order % total % cents', p_amount_refunded_cents, v_order.order_number, v_total;
    END IF;

    v_new := GREATEST(v_order.refunded_cents, p_amount_refunded_cents);

    UPDATE orders
    SET refunded_cents      = v_new,
        refund_amount       = v_new / 100.0,
        payment_status      = CASE WHEN v_new >= v_total THEN 'refunded'
                                   WHEN v_new > 0 THEN 'partially_refunded'
                                   ELSE payment_status END,
        refund_status       = CASE WHEN v_new > 0 THEN 'processed' ELSE refund_status END,
        refund_processed_at = CASE WHEN v_new > 0 THEN COALESCE(refund_processed_at, now()) ELSE refund_processed_at END,
        updated_at          = now()
    WHERE id = v_order.id;

    RETURN jsonb_build_object(
        'found', true,
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'refunded_cents', v_new,
        'total_cents', v_total,
        'full', v_new >= v_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_refund(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_stripe_refund(text, integer) TO service_role;

COMMENT ON COLUMN public.orders.refunded_cents IS
    'Cumulative amount Stripe has refunded (cents). Written only by apply_stripe_refund via stripe-webhook. CHECK-capped at total_amount.';
