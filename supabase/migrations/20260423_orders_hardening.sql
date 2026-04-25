-- Orders Hardening — companion to 20260422_tier_a_bulletproof_payments.sql
--
-- Closes six gaps found in the 2026-04-22 orders audit:
--   #1 Server-side pricing was not enforced (client-trusted total_amount).
--   #2 Admin minimum_lead_time_hours / maximum_advance_days were not enforced.
--   #3 max_daily_capacity was not enforced at submit.
--   #4 Order numbers were 5-digit random (100k space, collision-prone).
--   #5 `allergies` field did not exist; FoodSafetyDisclaimer was not wired.
--   #7 Client double-click could create two pending_orders rows.
--
-- Scope: customer-website pending-order path only. Walk-in orders
-- (create_new_order) are the Front Desk skill's concern and are not touched.

BEGIN;

-- =========================================================================
-- 1. Schema additions
-- =========================================================================

-- Client-supplied UUID lets a double-click retry surface the same pending row
-- instead of inserting a duplicate. UNIQUE across pending_orders only (the
-- key is scoped to the session, not the lifetime of the order in `orders`).
ALTER TABLE pending_orders
    ADD COLUMN IF NOT EXISTS client_idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS pending_orders_client_idem_uniq
    ON pending_orders (client_idempotency_key)
    WHERE client_idempotency_key IS NOT NULL;

-- Free-text allergies / dietary notes on BOTH sides. Kept deliberately simple
-- (text) so Eli can read whatever the customer typed. Structured categories
-- are a future product decision — this just stops allergy info from being
-- buried inside the `theme` / `dedication` fields.
ALTER TABLE pending_orders
    ADD COLUMN IF NOT EXISTS allergies text;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS allergies text;


-- =========================================================================
-- 2. Random order-number token generator
-- =========================================================================
-- Charset excludes 0/1/I/O/L to avoid "did you say oh or zero" phone calls.
-- 31 chars × 8 positions ≈ 8.5e11 space (vs 1e5 before). Collision after
-- ~1M orders is still < 0.1%. Retry loop in the RPC handles the rest.
CREATE OR REPLACE FUNCTION _random_order_number_token(p_length int DEFAULT 8)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    chars  text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    result text := '';
    i      int;
BEGIN
    FOR i IN 1..p_length LOOP
        result := result || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    RETURN result;
END;
$$;


-- =========================================================================
-- 3. Replace create_pending_order with the hardened version
-- =========================================================================
-- Still SECURITY DEFINER so guest checkouts (no auth.uid()) work. Everything
-- the old function did, plus: idempotency, pricing recompute, capacity,
-- lead/advance window, business-hours closure, holiday closure, allergies.
CREATE OR REPLACE FUNCTION create_pending_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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

    -- Business-settings lookups
    v_max_cap        int;
    v_min_lead_hrs   int;
    v_max_adv_days   int;

    -- Validation scratch
    v_base_price     numeric;
    v_num_premium    int;
    v_max_upcharge   numeric;
    v_expected_total numeric;
    v_hours_until    numeric;
    v_is_holiday     boolean;
    v_bh             business_hours%ROWTYPE;
    v_booked         int;
BEGIN
    -- =====================================================================
    -- (a) Idempotency — same client UUID means same submit. Return existing.
    -- =====================================================================
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

    -- =====================================================================
    -- (b) Required fields — fail loudly, no half rows.
    -- =====================================================================
    IF payload->>'customer_name'  IS NULL OR payload->>'customer_email' IS NULL
       OR payload->>'customer_phone' IS NULL OR payload->>'cake_size'   IS NULL
       OR payload->>'filling'      IS NULL OR payload->>'theme'         IS NULL
       OR payload->>'date_needed'  IS NULL OR payload->>'time_needed'   IS NULL
       OR payload->>'total_amount' IS NULL THEN
        RAISE EXCEPTION 'Missing required order fields';
    END IF;

    -- Outer bounds — cheap sanity before we hit the DB for the recompute.
    IF v_client_total <= 0 OR v_client_total > 10000 THEN
        RAISE EXCEPTION 'Invalid total_amount';
    END IF;

    -- =====================================================================
    -- (c) Load business settings once.
    -- =====================================================================
    SELECT max_daily_capacity, minimum_lead_time_hours, maximum_advance_days
      INTO v_max_cap, v_min_lead_hrs, v_max_adv_days
    FROM business_settings
    LIMIT 1;

    v_min_lead_hrs := COALESCE(v_min_lead_hrs, 48);
    v_max_adv_days := COALESCE(v_max_adv_days, 90);

    -- =====================================================================
    -- (d) Lead time — use the admin-configured minimum.
    --     2-hour fuzz absorbs TZ skew between browser and Postgres UTC.
    -- =====================================================================
    v_hours_until := EXTRACT(EPOCH FROM (
        (v_date_needed + v_time_needed)::timestamp - now()::timestamp
    )) / 3600.0;

    IF v_hours_until < (v_min_lead_hrs - 2) THEN
        RAISE EXCEPTION 'Order must be placed at least % hours in advance (got %.1f)',
            v_min_lead_hrs, v_hours_until;
    END IF;

    -- =====================================================================
    -- (e) Max advance window.
    -- =====================================================================
    IF v_date_needed > (CURRENT_DATE + v_max_adv_days) THEN
        RAISE EXCEPTION 'Order date must be within % days from today', v_max_adv_days;
    END IF;

    -- =====================================================================
    -- (f) Holiday closure — supports one-off AND recurring month/day rules.
    -- =====================================================================
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

    -- =====================================================================
    -- (g) Business hours — block days marked closed.
    --     Schema has both is_open and is_closed; we honor whichever is set.
    -- =====================================================================
    SELECT * INTO v_bh
    FROM business_hours
    WHERE day_of_week = EXTRACT(DOW FROM v_date_needed)::int
    LIMIT 1;

    IF v_bh.day_of_week IS NOT NULL
       AND (v_bh.is_closed = true OR v_bh.is_open = false) THEN
        RAISE EXCEPTION 'Store is closed on that day of the week';
    END IF;

    -- =====================================================================
    -- (h) Capacity — count paid orders + currently-alive pending orders.
    -- =====================================================================
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

    -- =====================================================================
    -- (i) Pricing recompute — server is authoritative.
    --     - base price comes from cake_sizes (by slug)
    --     - premium upcharge capped at num_premium × max(upcharge)
    --     - delivery fee capped at $50 (wider audit is in the delivery skill)
    --     - accept client total within 1¢ of server total
    -- =====================================================================
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

    -- =====================================================================
    -- (j) Generate a wide, non-sequential order number.
    -- =====================================================================
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

    -- =====================================================================
    -- (k) Insert. Uses ON CONFLICT on client_idempotency_key as a second
    --     line of defence in case two parallel calls slip past step (a).
    -- =====================================================================
    INSERT INTO pending_orders (
        order_number, status, user_id,
        customer_name, customer_email, customer_phone, customer_language,
        cake_size, cake_size_value, filling, filling_values, theme,
        dedication, reference_image_path, premium_filling_upcharge,
        allergies,
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
        DO UPDATE SET updated_at = now()  -- no-op; lets RETURNING fire
    RETURNING * INTO v_pending;

    RETURN jsonb_build_object(
        'pending_order_id', v_pending.id,
        'order_number',     v_pending.order_number,
        'total_amount',     v_pending.total_amount,
        'expires_at',       v_pending.expires_at,
        'idempotent_hit',   false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION create_pending_order(jsonb) TO anon, authenticated;


-- =========================================================================
-- 4. Replace promote_pending_order so it copies the new `allergies` column
-- =========================================================================
-- The rest of the function is identical to the Tier A version; only the
-- INSERT column list changes.
CREATE OR REPLACE FUNCTION promote_pending_order(
    p_pending_id uuid,
    p_payment_intent_id text,
    p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION promote_pending_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION promote_pending_order(uuid, text, text) TO service_role;


-- =========================================================================
-- 5. Expose get_pending_order with the new fields
-- =========================================================================
-- Read path so the payment page can display allergies if it ever needs to.
CREATE OR REPLACE FUNCTION get_pending_order(p_pending_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row pending_orders;
BEGIN
    SELECT * INTO v_row FROM pending_orders
    WHERE id = p_pending_id
      AND status IN ('awaiting_payment', 'payment_failed')
      AND expires_at > now();

    IF v_row IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_row.id,
        'order_number', v_row.order_number,
        'status', v_row.status,
        'error_message', v_row.error_message,
        'customer_name', v_row.customer_name,
        'customer_email', v_row.customer_email,
        'customer_phone', v_row.customer_phone,
        'customer_language', v_row.customer_language,
        'cake_size', v_row.cake_size,
        'filling', v_row.filling,
        'theme', v_row.theme,
        'dedication', v_row.dedication,
        'reference_image_path', v_row.reference_image_path,
        'allergies', v_row.allergies,
        'date_needed', v_row.date_needed,
        'time_needed', v_row.time_needed,
        'delivery_option', v_row.delivery_option,
        'delivery_address', v_row.delivery_address,
        'delivery_apartment', v_row.delivery_apartment,
        'delivery_fee', v_row.delivery_fee,
        'subtotal', v_row.subtotal,
        'total_amount', v_row.total_amount,
        'expires_at', v_row.expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION get_pending_order(uuid) TO anon, authenticated;

COMMIT;
