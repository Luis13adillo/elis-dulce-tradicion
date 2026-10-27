-- ============================================================================
-- H5: price the premium filling upcharge on the server
-- ============================================================================
-- Before: create_pending_order_secure trusted payload.premium_filling_upcharge
-- as long as it was within 0..(n_premium * MAX(upcharge)). A crafted request
-- could send 0 (or the cheapest size) and pay less.
-- Now: the client's number is ignored. The wizard sends
--   premium_filling_sizes: { "<filling slug>": "<premium size_value>" }
-- and price_premium_fillings() sums premium_filling_upcharges.upcharge for
-- every distinct premium filling in filling_values. A premium filling with
-- no size, or an unknown/inactive size, is rejected. The server value is
-- what's used in the expected total AND stored on the pending row.
--
-- create_pending_order_secure below is the 20260729T120000 definition with
-- only the premium block changed (marked "H5:"). The public
-- create_pending_order wrapper calls it, so both entry points are covered.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.price_premium_fillings(
    p_filling_values jsonb,
    p_sizes jsonb
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total   numeric := 0;
    v_filling text;
    v_size    text;
    v_charge  numeric;
BEGIN
    IF p_filling_values IS NULL OR jsonb_typeof(p_filling_values) <> 'array' THEN
        RETURN 0;
    END IF;
    IF p_sizes IS NULL OR jsonb_typeof(p_sizes) <> 'object' THEN
        p_sizes := '{}'::jsonb;
    END IF;

    FOR v_filling IN
        SELECT DISTINCT f.value
        FROM cake_fillings f
        WHERE f.value IN (SELECT jsonb_array_elements_text(p_filling_values))
          AND f.is_premium = true
          AND f.active = true
    LOOP
        v_size := NULLIF(p_sizes->>v_filling, '');
        IF v_size IS NULL THEN
            RAISE EXCEPTION 'Select a size for premium filling %', v_filling;
        END IF;
        SELECT upcharge INTO v_charge
        FROM premium_filling_upcharges
        WHERE size_value = v_size AND active = true;
        IF v_charge IS NULL THEN
            RAISE EXCEPTION 'Unknown premium filling size % for %', v_size, v_filling;
        END IF;
        v_total := v_total + v_charge;
    END LOOP;

    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.price_premium_fillings(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_premium_fillings(jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.create_pending_order_secure(payload jsonb, p_verdict jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_paused         boolean;
    v_order_number   text;
    v_pending        pending_orders;
    -- DELIVERY: under service_role auth.uid() is NULL; the Edge Function
    -- resolves the caller's JWT and passes the verified id in the payload.
    -- The public wrapper strips 'verified_user_id' so it cannot be spoofed.
    v_user_id        uuid := COALESCE(auth.uid(), NULLIF(payload->>'verified_user_id', '')::uuid);
    v_attempts       int  := 0;
    v_client_idem    text := NULLIF(payload->>'client_idempotency_key', '');
    v_date_needed    date := (payload->>'date_needed')::date;
    v_time_needed    time := (payload->>'time_needed')::time;
    v_cake_size_val  text := NULLIF(payload->>'cake_size_value', '');
    v_filling_values jsonb := COALESCE(payload->'filling_values', '[]'::jsonb);
    v_client_total   numeric := (payload->>'total_amount')::numeric;
    -- H5: the client's premium_filling_upcharge is IGNORED. The upcharge is
    -- priced from premium_filling_upcharges using the per-filling size map.
    v_prem_sizes     jsonb := COALESCE(payload->'premium_filling_sizes', '{}'::jsonb);
    v_server_prem    numeric;
    v_servings       int := NULLIF(payload->>'servings', '')::int;

    v_max_cap        int;
    v_min_lead_hrs   int;
    v_max_adv_days   int;
    v_hold_days      int;

    v_base_price     numeric;
    v_expected_total numeric;
    v_hours_until    numeric;
    v_is_holiday     boolean;
    v_bh             business_hours%ROWTYPE;
    v_booked         int;

    -- DELIVERY: server-derived fee state. The client's delivery_fee field is
    -- IGNORED in this function — fee is derived from the verdict alone.
    v_delivery_option text := COALESCE(payload->>'delivery_option', 'pickup');
    v_quote_status    text;
    v_delivery_fee    numeric;
    v_distance        numeric;
    v_verify_method   text;
    v_expires_at      timestamptz;
BEGIN
    -- KILL SWITCH: hard stop online orders when business_settings says so.
    SELECT online_orders_paused INTO v_paused FROM business_settings LIMIT 1;
    IF v_paused IS TRUE THEN
        RAISE EXCEPTION 'Online orders are temporarily paused. Please call (610) 279-6200 to place your order.'
            USING ERRCODE = 'P0001';
    END IF;

    IF v_client_idem IS NOT NULL THEN
        SELECT * INTO v_pending
        FROM pending_orders
        WHERE client_idempotency_key = v_client_idem
          AND status IN ('awaiting_payment', 'payment_failed')
          AND expires_at > now();

        IF v_pending.id IS NOT NULL THEN
            RETURN jsonb_build_object(
                'pending_order_id', v_pending.id,
                'order_number',     v_pending.order_number,
                'total_amount',     v_pending.total_amount,
                'expires_at',       v_pending.expires_at,
                'delivery_quote_status', v_pending.delivery_quote_status,
                'delivery_fee',     v_pending.delivery_fee,
                'idempotent_hit',   true
            );
        END IF;
    END IF;

    IF payload->>'customer_name'  IS NULL OR payload->>'customer_email' IS NULL
       OR payload->>'customer_phone' IS NULL OR payload->>'cake_size'   IS NULL
       OR payload->>'filling'      IS NULL OR payload->>'theme'         IS NULL
       OR payload->>'date_needed'  IS NULL OR payload->>'time_needed'   IS NULL
       OR payload->>'total_amount' IS NULL THEN
        RAISE EXCEPTION 'Missing required order fields';
    END IF;

    IF v_client_total <= 0 OR v_client_total > 10000 THEN
        RAISE EXCEPTION 'Invalid total_amount';
    END IF;

    -- DELIVERY: derive fee state from the server-side verdict.
    --   flat            -> verified <= 5.0 driving miles, fee locked at $5.00
    --   quote_required  -> > 5 miles OR unverifiable OR no verdict at all
    --                      (direct RPC callers can never mint a flat fee)
    IF v_delivery_option = 'delivery' THEN
        IF NULLIF(payload->>'delivery_address', '') IS NULL THEN
            RAISE EXCEPTION 'delivery_address is required for delivery orders';
        END IF;
        v_distance      := NULLIF(p_verdict->>'distance_miles', '')::numeric;
        v_verify_method := NULLIF(p_verdict->>'method', '');
        IF p_verdict IS NOT NULL AND p_verdict->>'status' = 'flat' THEN
            IF v_distance IS NULL OR v_distance < 0 OR v_distance > 5.0 THEN
                RAISE EXCEPTION 'flat delivery verdict requires a verified distance <= 5.0 miles (got %)', v_distance;
            END IF;
            v_quote_status := 'flat';
            v_delivery_fee := 5.00;           -- the flat fee is owned HERE
        ELSE
            v_quote_status := 'quote_required';
            v_delivery_fee := 0;              -- unpaid until staff quotes
        END IF;
    ELSE
        v_quote_status := 'not_required';
        v_delivery_fee := 0;
    END IF;

    SELECT max_daily_capacity, minimum_lead_time_hours, maximum_advance_days, review_hold_days
      INTO v_max_cap, v_min_lead_hrs, v_max_adv_days, v_hold_days
    FROM business_settings
    LIMIT 1;

    v_min_lead_hrs := COALESCE(v_min_lead_hrs, 48);
    v_max_adv_days := COALESCE(v_max_adv_days, 90);
    v_hold_days    := COALESCE(v_hold_days, 7);

    -- DELIVERY: quote-held rows wait for staff, so they get the same long
    -- hold window review-held rows get instead of the 24h payment window.
    v_expires_at := CASE WHEN v_quote_status = 'quote_required'
                         THEN now() + make_interval(days => v_hold_days)
                         ELSE now() + interval '24 hours' END;

    v_hours_until := EXTRACT(EPOCH FROM (
        (v_date_needed + v_time_needed)::timestamp - now()::timestamp
    )) / 3600.0;

    IF v_hours_until < (v_min_lead_hrs - 2) THEN
        RAISE EXCEPTION 'Order must be placed at least % hours in advance (got %.1f)',
            v_min_lead_hrs, v_hours_until;
    END IF;

    IF v_date_needed > (CURRENT_DATE + v_max_adv_days) THEN
        RAISE EXCEPTION 'Order date must be within % days from today', v_max_adv_days;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM holiday_closures
        WHERE closure_date = v_date_needed
           OR (is_recurring = true
               AND EXTRACT(MONTH FROM closure_date) = EXTRACT(MONTH FROM v_date_needed)
               AND EXTRACT(DAY   FROM closure_date) = EXTRACT(DAY   FROM v_date_needed))
    ) INTO v_is_holiday;

    IF v_is_holiday THEN
        RAISE EXCEPTION 'Selected date is a holiday closure';
    END IF;

    SELECT * INTO v_bh
    FROM business_hours
    WHERE day_of_week = EXTRACT(DOW FROM v_date_needed)::int
    LIMIT 1;

    IF v_bh.day_of_week IS NOT NULL
       AND (v_bh.is_closed = true OR v_bh.is_open = false) THEN
        RAISE EXCEPTION 'Store is closed on that day of the week';
    END IF;

    IF v_max_cap IS NOT NULL THEN
        SELECT (
            (SELECT COUNT(*) FROM orders
                WHERE date_needed = v_date_needed
                  AND status != 'cancelled')
            +
            (SELECT COUNT(*) FROM pending_orders
                WHERE date_needed = v_date_needed
                  AND status = 'awaiting_payment'
                  AND expires_at > now()
                  -- Review-held rows do not consume capacity. 'approved'
                  -- rows (open payment window) still count — that IS the
                  -- protected slot; expiry releases it automatically.
                  AND image_review_status NOT IN ('needs_review', 'declined', 'review_expired')
                  -- DELIVERY: quote-held rows do not consume capacity
                  -- either; the slot is claimed when staff quotes.
                  AND delivery_quote_status <> 'quote_required')
        ) INTO v_booked;

        IF v_booked >= v_max_cap THEN
            RAISE EXCEPTION 'Selected date is fully booked (% / %)', v_booked, v_max_cap;
        END IF;
    END IF;

    IF v_cake_size_val IS NULL THEN
        RAISE EXCEPTION 'cake_size_value (slug) is required for pricing';
    END IF;

    SELECT price INTO v_base_price
    FROM cake_sizes
    WHERE value = v_cake_size_val AND active = true;

    IF v_base_price IS NULL THEN
        RAISE EXCEPTION 'Unknown cake_size_value: %', v_cake_size_val;
    END IF;

    -- H5: server-priced premium upcharge (raises on a missing/unknown size).
    v_server_prem := public.price_premium_fillings(v_filling_values, v_prem_sizes);

    -- DELIVERY: expected total uses the SERVER-derived fee. The old
    -- client-supplied delivery_fee (bounded 0..50) is gone entirely.
    v_expected_total := v_base_price + v_server_prem + v_delivery_fee;

    IF abs(v_client_total - v_expected_total) > 0.01 THEN
        RAISE EXCEPTION 'total_amount mismatch (client: %, server: %)',
            v_client_total, v_expected_total;
    END IF;

    LOOP
        v_order_number := 'ORD-' || _random_order_number_token(8);
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM pending_orders WHERE order_number = v_order_number
            UNION ALL
            SELECT 1 FROM orders WHERE order_number = v_order_number
        );
        v_attempts := v_attempts + 1;
        IF v_attempts > 10 THEN
            RAISE EXCEPTION 'Could not generate unique order_number after 10 attempts';
        END IF;
    END LOOP;

    INSERT INTO pending_orders (
        order_number, status, user_id,
        customer_name, customer_email, customer_phone, customer_language,
        cake_size, cake_size_value, filling, filling_values, theme,
        dedication, reference_image_path, premium_filling_upcharge,
        allergies,
        bread_type, bread_type_value, servings, recipient_name,
        date_needed, time_needed,
        delivery_option, delivery_address, delivery_apartment,
        delivery_zone, delivery_fee, delivery_instructions,
        delivery_quote_status, delivery_distance_miles, delivery_verify_method,
        subtotal, tax_amount, discount_amount, total_amount,
        consent_given, consent_timestamp,
        expires_at,
        raw_payload, client_idempotency_key
    ) VALUES (
        v_order_number, 'awaiting_payment', v_user_id,
        payload->>'customer_name',
        payload->>'customer_email',
        payload->>'customer_phone',
        COALESCE(payload->>'customer_language', 'en'),
        payload->>'cake_size',
        v_cake_size_val,
        payload->>'filling',
        v_filling_values,
        payload->>'theme',
        payload->>'dedication',
        payload->>'reference_image_path',
        v_server_prem,
        NULLIF(payload->>'allergies', ''),
        NULLIF(payload->>'bread_type', ''),
        NULLIF(payload->>'bread_type_value', ''),
        v_servings,
        NULLIF(payload->>'recipient_name', ''),
        v_date_needed,
        v_time_needed,
        v_delivery_option,
        payload->>'delivery_address',
        payload->>'delivery_apartment',
        payload->>'delivery_zone',
        v_delivery_fee,
        payload->>'delivery_instructions',
        v_quote_status,
        v_distance,
        v_verify_method,
        NULLIF(payload->>'subtotal', '')::numeric,
        COALESCE((payload->>'tax_amount')::numeric, 0),
        COALESCE((payload->>'discount_amount')::numeric, 0),
        v_client_total,
        COALESCE((payload->>'consent_given')::boolean, true),
        COALESCE((payload->>'consent_timestamp')::timestamptz, now()),
        v_expires_at,
        payload, v_client_idem
    )
    ON CONFLICT (client_idempotency_key)
        WHERE client_idempotency_key IS NOT NULL
        DO UPDATE SET updated_at = now()
    RETURNING * INTO v_pending;

    RETURN jsonb_build_object(
        'pending_order_id', v_pending.id,
        'order_number',     v_pending.order_number,
        'total_amount',     v_pending.total_amount,
        'expires_at',       v_pending.expires_at,
        'delivery_quote_status', v_pending.delivery_quote_status,
        'delivery_fee',     v_pending.delivery_fee,
        'idempotent_hit',   false
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_pending_order_secure(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_pending_order_secure(jsonb, jsonb) TO service_role;
