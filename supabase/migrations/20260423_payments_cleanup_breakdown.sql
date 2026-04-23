-- Payments cleanup + walk-in breakdown support
--
-- (1) Drop verify_stripe_payment RPC
--     It was a stub that only reads orders.stripe_payment_id, so it returned
--     verified=true for anything the webhook had already written — a tautology.
--     The real verification now lives in the verify-payment Edge Function,
--     which actually calls stripe.paymentIntents.retrieve and requires
--     status='succeeded' AND the promoted orders row to exist.
--     All callers have been removed in the same deploy.
--
-- (2) Extend create_new_order to accept subtotal / delivery_fee / tax_amount.
--     Walk-in orders (FrontDesk WalkInOrderModal) and any other direct
--     createOrder caller previously dropped these fields silently, leaving
--     NULLs in the orders table and breaking revenue reconciliation.

DROP FUNCTION IF EXISTS public.verify_stripe_payment(text);

CREATE OR REPLACE FUNCTION public.create_new_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_order orders;
BEGIN
  INSERT INTO orders (
    customer_name,
    customer_email,
    customer_phone,
    customer_language,
    delivery_option,
    delivery_address,
    payment_status,
    payment_method,
    subtotal,
    delivery_fee,
    tax_amount,
    total_amount,
    status,
    date_needed,
    time_needed,
    cake_size,
    filling,
    theme,
    dedication,
    reference_image_path,
    consent_given,
    consent_timestamp,
    stripe_payment_id,
    user_id,
    premium_filling_upcharge,
    order_number
  )
  VALUES (
    payload->>'customer_name',
    payload->>'customer_email',
    payload->>'customer_phone',
    COALESCE(payload->>'customer_language', 'en'),
    payload->>'delivery_option',
    payload->>'delivery_address',
    COALESCE(payload->>'payment_status', 'pending'),
    payload->>'payment_method',
    NULLIF(payload->>'subtotal', '')::numeric,
    COALESCE((payload->>'delivery_fee')::numeric, 0),
    COALESCE((payload->>'tax_amount')::numeric, 0),
    (payload->>'total_amount')::numeric,
    COALESCE(payload->>'status', 'pending'),
    (payload->>'date_needed')::date,
    (payload->>'time_needed')::time,
    payload->>'cake_size',
    payload->>'filling',
    payload->>'theme',
    payload->>'dedication',
    payload->>'reference_image_path',
    COALESCE((payload->>'consent_given')::boolean, true),
    COALESCE((payload->>'consent_timestamp')::timestamptz, now()),
    payload->>'stripe_payment_id',
    auth.uid(),
    COALESCE((payload->>'premium_filling_upcharge')::numeric, 0),
    COALESCE(payload->>'order_number', 'WALKIN-' || floor(random() * 100000)::text)
  )
  RETURNING * INTO new_order;

  RETURN to_jsonb(new_order);
END;
$$;
