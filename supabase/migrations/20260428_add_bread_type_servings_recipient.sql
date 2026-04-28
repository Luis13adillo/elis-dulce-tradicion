-- Capture three pieces of order info that were previously thrown away or
-- never asked:
--   * bread_type / bread_type_value — the cake base flavor selection.
--     The form already collected this in FlavorStep.tsx but Order.tsx
--     never put it in the payload, so the bakery had no way to know
--     which sponge a customer wanted.
--   * servings — number of guests / portions. New field. Helps the
--     bakery confirm sizing.
--   * recipient_name — who the cake is for, separate from the dedication
--     text. Lets the kitchen ticket print a clean recipient name.
--
-- Discovered 2026-04-28 while investigating Dawn Specht's order
-- (id 111). All 4 columns nullable so existing rows aren't disturbed.

BEGIN;

-- ----------------------------------------------------------------------
-- 1. Schema: add nullable columns to both tables
-- ----------------------------------------------------------------------
ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS bread_type        TEXT,
  ADD COLUMN IF NOT EXISTS bread_type_value  TEXT,
  ADD COLUMN IF NOT EXISTS servings          INTEGER,
  ADD COLUMN IF NOT EXISTS recipient_name    TEXT;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS bread_type        TEXT,
  ADD COLUMN IF NOT EXISTS bread_type_value  TEXT,
  ADD COLUMN IF NOT EXISTS servings          INTEGER,
  ADD COLUMN IF NOT EXISTS recipient_name    TEXT;

-- Optional sanity check: servings must be positive when set.
ALTER TABLE public.pending_orders
  DROP CONSTRAINT IF EXISTS pending_orders_servings_positive;
ALTER TABLE public.pending_orders
  ADD CONSTRAINT pending_orders_servings_positive
    CHECK (servings IS NULL OR servings BETWEEN 1 AND 500);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_servings_positive;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_servings_positive
    CHECK (servings IS NULL OR servings BETWEEN 1 AND 500);

-- ----------------------------------------------------------------------
-- 2. create_pending_order — read new fields from payload jsonb and store
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_pending_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_paused         boolean;
    v_order_number   text;
    v_pending        pending_orders;
    v_user_id        uuid := auth.uid();
    v_attempts       int  := 0;
    v_client_idem    text := NULLIF(payload->>'client_idempotency_key', '');
    v_date_needed    date := (payload->>'date_needed')::date;
    v_time_needed    time := (payload->>'time_needed')::time;
    v_cake_size_val  text := NULLIF(payload->>'cake_size_value', '');
    v_filling_values jsonb := COALESCE(payload->'filling_values', '[]'::jsonb);
    v_client_total   numeric := (payload->>'total_amount')::numeric;
    v_client_prem    numeric := COALESCE((payload->>'premium_filling_upcharge')::numeric, 0);
    v_client_del_fee numeric := COALESCE((payload->>'delivery_fee')::numeric, 0);
    v_servings       int := NULLIF(payload->>'servings', '')::int;

    v_max_cap        int;
    v_min_lead_hrs   int;
    v_max_adv_days   int;

    v_base_price     numeric;
    v_num_premium    int;
    v_max_upcharge   numeric;
    v_expected_total numeric;
    v_hours_until    numeric;
    v_is_holiday     boolean;
    v_bh             business_hours%ROWTYPE;
    v_booked         int;
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

    SELECT max_daily_capacity, minimum_lead_time_hours, maximum_advance_days
      INTO v_max_cap, v_min_lead_hrs, v_max_adv_days
    FROM business_settings
    LIMIT 1;

    v_min_lead_hrs := COALESCE(v_min_lead_hrs, 48);
    v_max_adv_days := COALESCE(v_max_adv_days, 90);

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
                  AND expires_at > now())
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

    SELECT COUNT(*) INTO v_num_premium
    FROM cake_fillings
    WHERE value IN (SELECT jsonb_array_elements_text(v_filling_values))
      AND is_premium = true
      AND active = true;

    SELECT COALESCE(MAX(upcharge), 0) INTO v_max_upcharge
    FROM premium_filling_upcharges
    WHERE active = true;

    IF v_client_prem < 0 OR v_client_prem > (v_num_premium * v_max_upcharge) THEN
        RAISE EXCEPTION 'premium_filling_upcharge out of bounds (got %, max %)',
            v_client_prem, (v_num_premium * v_max_upcharge);
    END IF;

    IF v_client_del_fee < 0 OR v_client_del_fee > 50 THEN
        RAISE EXCEPTION 'delivery_fee out of bounds';
    END IF;

    v_expected_total := v_base_price + v_client_prem + v_client_del_fee;

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
        subtotal, tax_amount, discount_amount, total_amount,
        consent_given, consent_timestamp,
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
        v_client_prem,
        NULLIF(payload->>'allergies', ''),
        NULLIF(payload->>'bread_type', ''),
        NULLIF(payload->>'bread_type_value', ''),
        v_servings,
        NULLIF(payload->>'recipient_name', ''),
        v_date_needed,
        v_time_needed,
        COALESCE(payload->>'delivery_option', 'pickup'),
        payload->>'delivery_address',
        payload->>'delivery_apartment',
        payload->>'delivery_zone',
        v_client_del_fee,
        payload->>'delivery_instructions',
        NULLIF(payload->>'subtotal', '')::numeric,
        COALESCE((payload->>'tax_amount')::numeric, 0),
        COALESCE((payload->>'discount_amount')::numeric, 0),
        v_client_total,
        COALESCE((payload->>'consent_given')::boolean, true),
        COALESCE((payload->>'consent_timestamp')::timestamptz, now()),
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
        'idempotent_hit',   false
    );
END;
$function$;

-- ----------------------------------------------------------------------
-- 3. promote_pending_order — copy new fields from pending_orders -> orders
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_pending_order(
    p_pending_id uuid,
    p_payment_intent_id text,
    p_idempotency_key text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_pending   pending_orders;
    v_new_order orders;
    v_idem      text;
BEGIN
    SELECT * INTO v_pending FROM pending_orders
    WHERE id = p_pending_id
    FOR UPDATE;

    IF v_pending IS NULL THEN
        RAISE EXCEPTION 'pending_order not found: %', p_pending_id;
    END IF;

    IF v_pending.status = 'promoted' AND v_pending.promoted_order_id IS NOT NULL THEN
        SELECT * INTO v_new_order FROM orders WHERE id = v_pending.promoted_order_id;
        RETURN jsonb_build_object('order', to_jsonb(v_new_order), 'already_promoted', true);
    END IF;

    v_idem := COALESCE(p_idempotency_key, p_pending_id::text);

    INSERT INTO orders (
        order_number, status, payment_status, payment_method,
        customer_name, customer_email, customer_phone, customer_language,
        cake_size, filling, theme, dedication, reference_image_path,
        premium_filling_upcharge, allergies,
        bread_type, bread_type_value, servings, recipient_name,
        date_needed, time_needed,
        delivery_option, delivery_address, delivery_apartment,
        delivery_zone, delivery_fee, delivery_instructions,
        subtotal, tax_amount, discount_amount, total_amount,
        stripe_payment_id, payment_intent_id,
        idempotency_key, pending_order_id,
        user_id, consent_given, consent_timestamp
    ) VALUES (
        v_pending.order_number, 'pending', 'paid', 'stripe',
        v_pending.customer_name, v_pending.customer_email,
        v_pending.customer_phone, v_pending.customer_language,
        v_pending.cake_size, v_pending.filling, v_pending.theme,
        v_pending.dedication, v_pending.reference_image_path,
        v_pending.premium_filling_upcharge, v_pending.allergies,
        v_pending.bread_type, v_pending.bread_type_value,
        v_pending.servings, v_pending.recipient_name,
        v_pending.date_needed, v_pending.time_needed,
        v_pending.delivery_option, v_pending.delivery_address,
        v_pending.delivery_apartment, v_pending.delivery_zone,
        v_pending.delivery_fee, v_pending.delivery_instructions,
        v_pending.subtotal, v_pending.tax_amount,
        v_pending.discount_amount, v_pending.total_amount,
        p_payment_intent_id, p_payment_intent_id,
        v_idem, v_pending.id,
        v_pending.user_id, v_pending.consent_given, v_pending.consent_timestamp
    )
    ON CONFLICT (idempotency_key) DO UPDATE
        SET updated_at = now()
    RETURNING * INTO v_new_order;

    UPDATE pending_orders
    SET status = 'promoted',
        promoted_at = now(),
        promoted_order_id = v_new_order.id,
        payment_intent_id = p_payment_intent_id
    WHERE id = p_pending_id;

    RETURN jsonb_build_object('order', to_jsonb(v_new_order), 'already_promoted', false);
END;
$function$;

COMMIT;
