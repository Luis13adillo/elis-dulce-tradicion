-- Fix create_new_order RPC to include all required fields

CREATE OR REPLACE FUNCTION create_new_order(payload jsonb)
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
    payment_status,
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
    COALESCE(payload->>'payment_status', 'pending'),
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
    COALESCE(payload->>'order_number', 'ORD-' || floor(random() * 100000)::text)
  )
  RETURNING * INTO new_order;

  RETURN to_jsonb(new_order);
END;
$$;

-- Ensure public can execute
GRANT EXECUTE ON FUNCTION create_new_order(jsonb) TO public;
GRANT EXECUTE ON FUNCTION create_new_order(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION create_new_order(jsonb) TO authenticated;
