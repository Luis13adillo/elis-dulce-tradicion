-- RESTORE FILE — captured 2026-04-23 before the "orders paused" maintenance override.
-- To re-open online orders, run this SQL against the production Supabase project
-- (rnszrscxwkdwvvlsihqc). This is the exact function body that was live immediately
-- before the pause.

CREATE OR REPLACE FUNCTION public.create_pending_order(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_order_number text;
    v_pending pending_orders;
    v_user_id uuid := auth.uid();
    v_attempts int := 0;
BEGIN
    LOOP
        v_order_number := 'ORD-' || lpad(floor(random() * 100000)::text, 5, '0');
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM pending_orders WHERE order_number = v_order_number
            UNION ALL
            SELECT 1 FROM orders WHERE order_number = v_order_number
        );
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique order_number';
        END IF;
    END LOOP;

    IF payload->>'customer_name' IS NULL OR payload->>'customer_email' IS NULL
       OR payload->>'customer_phone' IS NULL OR payload->>'cake_size' IS NULL
       OR payload->>'filling' IS NULL OR payload->>'theme' IS NULL
       OR payload->>'date_needed' IS NULL OR payload->>'time_needed' IS NULL
       OR payload->>'total_amount' IS NULL THEN
        RAISE EXCEPTION 'Missing required order fields';
    END IF;

    IF (payload->>'total_amount')::numeric <= 0
       OR (payload->>'total_amount')::numeric > 10000 THEN
        RAISE EXCEPTION 'Invalid total_amount';
    END IF;

    INSERT INTO pending_orders (
        order_number, status, user_id,
        customer_name, customer_email, customer_phone, customer_language,
        cake_size, cake_size_value, filling, filling_values, theme,
        dedication, reference_image_path, premium_filling_upcharge,
        date_needed, time_needed,
        delivery_option, delivery_address, delivery_apartment,
        delivery_zone, delivery_fee, delivery_instructions,
        subtotal, tax_amount, discount_amount, total_amount,
        consent_given, consent_timestamp,
        raw_payload
    ) VALUES (
        v_order_number, 'awaiting_payment', v_user_id,
        payload->>'customer_name',
        payload->>'customer_email',
        payload->>'customer_phone',
        COALESCE(payload->>'customer_language', 'en'),
        payload->>'cake_size',
        payload->>'cake_size_value',
        payload->>'filling',
        payload->'filling_values',
        payload->>'theme',
        payload->>'dedication',
        payload->>'reference_image_path',
        COALESCE((payload->>'premium_filling_upcharge')::numeric, 0),
        (payload->>'date_needed')::date,
        (payload->>'time_needed')::time,
        COALESCE(payload->>'delivery_option', 'pickup'),
        payload->>'delivery_address',
        payload->>'delivery_apartment',
        payload->>'delivery_zone',
        COALESCE((payload->>'delivery_fee')::numeric, 0),
        payload->>'delivery_instructions',
        NULLIF(payload->>'subtotal', '')::numeric,
        COALESCE((payload->>'tax_amount')::numeric, 0),
        COALESCE((payload->>'discount_amount')::numeric, 0),
        (payload->>'total_amount')::numeric,
        COALESCE((payload->>'consent_given')::boolean, true),
        COALESCE((payload->>'consent_timestamp')::timestamptz, now()),
        payload
    )
    RETURNING * INTO v_pending;

    RETURN jsonb_build_object(
        'pending_order_id', v_pending.id,
        'order_number', v_pending.order_number,
        'total_amount', v_pending.total_amount,
        'expires_at', v_pending.expires_at
    );
END;
$function$;
