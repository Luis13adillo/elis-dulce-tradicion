-- =========================================================================
-- Delivery flow — Norristown origin, flat $5 within 5 driving miles,
-- "Delivery Quote Required" beyond 5 miles or when unverifiable.
-- =========================================================================
-- Business rules (final, 2026-07-29):
--   * <= 5.0 driving miles from 324 W Marshall St, Norristown PA 19401
--     -> flat $5.00 delivery fee, charged with the order.
--   * > 5.0 miles, or the address/distance cannot be verified
--     -> order is accepted as "Delivery Quote Required": no payment is
--        possible until staff enters the final delivery fee, which bumps
--        price_revision (invalidating any stale PaymentIntent) and sends
--        a fresh payment link. Never silently converted to pickup, never
--        free delivery.
--   * ZIP-based delivery_zones are NOT used for pricing. The stale
--     find_delivery_zone() helper is de-exposed below.
--
-- Distance itself is computed in the Edge Functions (Postgres cannot call
-- the routing APIs); this migration makes the DATABASE refuse to store or
-- charge any delivery fee the server did not derive:
--   * public create_pending_order() can no longer set a delivery fee at
--     all — delivery orders created through it are always quote_required.
--   * create_pending_order_secure() (service_role only, called by the
--     create-pending-order Edge Function) is the only path that can mark
--     an order flat-$5, and only with a verified <=5mi verdict attached.
--
-- Based on the ACTIVE PRODUCTION definitions captured 2026-07-29 (audit
-- session): create_pending_order (kill switch + idempotency + lead
-- time/holiday/capacity gates + server-side price validation),
-- resolve_image_review, get_pending_order. Every existing protection is
-- preserved; diffs are marked with "DELIVERY:" comments.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. Columns
-- -------------------------------------------------------------------------
ALTER TABLE pending_orders
    ADD COLUMN IF NOT EXISTS delivery_quote_status text NOT NULL DEFAULT 'not_required',
    ADD COLUMN IF NOT EXISTS delivery_distance_miles numeric,
    ADD COLUMN IF NOT EXISTS delivery_verify_method text,
    ADD COLUMN IF NOT EXISTS delivery_quote_log jsonb;

DO $$ BEGIN
    ALTER TABLE pending_orders
        ADD CONSTRAINT pending_orders_delivery_quote_status_check
        CHECK (delivery_quote_status IN ('not_required', 'flat', 'quote_required', 'quoted'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Existing rows keep 'not_required' (their totals were validated under the
-- rules in force when they were created; retro-blocking open payment links
-- would strand customers who already received one).

-- -------------------------------------------------------------------------
-- 2. create_pending_order_secure — full logic, service_role only
-- -------------------------------------------------------------------------
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
    v_client_prem    numeric := COALESCE((payload->>'premium_filling_upcharge')::numeric, 0);
    v_servings       int := NULLIF(payload->>'servings', '')::int;

    v_max_cap        int;
    v_min_lead_hrs   int;
    v_max_adv_days   int;
    v_hold_days      int;

    v_base_price     numeric;
    v_num_premium    int;
    v_max_upcharge   numeric;
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

    -- DELIVERY: expected total uses the SERVER-derived fee. The old
    -- client-supplied delivery_fee (bounded 0..50) is gone entirely.
    v_expected_total := v_base_price + v_client_prem + v_delivery_fee;

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
        v_client_prem,
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

-- -------------------------------------------------------------------------
-- 3. Public create_pending_order — thin wrapper, can never set a fee
-- -------------------------------------------------------------------------
-- Kept callable by anon/authenticated so any cached PWA bundle still
-- creates orders. Delivery orders through this path are always
-- quote_required (NULL verdict) — degraded but correct: no free delivery,
-- no silent pickup conversion, payment blocked until staff quotes.
CREATE OR REPLACE FUNCTION public.create_pending_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    -- Strip the EF-only trusted field so a direct caller cannot claim an
    -- arbitrary user's id; auth.uid() still applies inside for this path.
    RETURN create_pending_order_secure(payload - 'verified_user_id', NULL);
END;
$function$;

-- -------------------------------------------------------------------------
-- 4. resolve_delivery_quote — staff enters the final fee (service_role only,
--    called by the resolve-delivery-quote Edge Function which authenticates
--    the staff JWT, cancels any stale PaymentIntent and emails the link)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_delivery_quote(
    p_pending_id uuid,
    p_staff_id   uuid,
    p_fee        numeric,
    p_notes      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row           pending_orders;
    v_max_cap       int;
    v_link_hours    int;
    v_booked        int;
    v_new_total     numeric;
    v_old_pi        text;
    v_price_changed boolean := false;
    v_consumes_capacity boolean;
BEGIN
    IF p_staff_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'staff_id_required');
    END IF;
    IF p_fee IS NULL OR p_fee < 0 OR p_fee > 500 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_fee');
    END IF;

    SELECT * INTO v_row FROM pending_orders WHERE id = p_pending_id FOR UPDATE;
    IF v_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF v_row.status = 'promoted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_paid');
    END IF;
    IF v_row.delivery_option <> 'delivery'
       OR v_row.delivery_quote_status NOT IN ('quote_required', 'quoted') THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_quote_required');
    END IF;

    v_new_total := v_row.total_amount - COALESCE(v_row.delivery_fee, 0) + p_fee;
    IF v_new_total <= 0 OR v_new_total > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_total');
    END IF;
    IF v_row.date_needed < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'date_past');
    END IF;

    SELECT max_daily_capacity, review_payment_link_hours
      INTO v_max_cap, v_link_hours
    FROM business_settings LIMIT 1;
    v_link_hours := COALESCE(v_link_hours, 48);

    -- Quoting moves the row from quote-held (capacity-exempt) to an open
    -- payment window (capacity-consuming) — unless it is ALSO still held
    -- for photo review, in which case resolve_image_review will run this
    -- same gate when it approves.
    v_consumes_capacity :=
        v_row.image_review_status NOT IN ('needs_review', 'declined', 'review_expired');

    IF v_max_cap IS NOT NULL AND v_consumes_capacity
       AND v_row.delivery_quote_status = 'quote_required' THEN
        SELECT (
            (SELECT COUNT(*) FROM orders
                WHERE date_needed = v_row.date_needed AND status != 'cancelled')
            +
            (SELECT COUNT(*) FROM pending_orders
                WHERE date_needed = v_row.date_needed
                  AND status = 'awaiting_payment'
                  AND expires_at > now()
                  AND image_review_status NOT IN ('needs_review', 'declined', 'review_expired')
                  AND delivery_quote_status <> 'quote_required'
                  AND id <> p_pending_id)
        ) INTO v_booked;

        IF v_booked >= v_max_cap THEN
            RETURN jsonb_build_object('success', false, 'error', 'capacity_full',
                'booked', v_booked, 'capacity', v_max_cap, 'date', v_row.date_needed);
        END IF;
    END IF;

    v_price_changed := (v_new_total IS DISTINCT FROM v_row.total_amount);
    v_old_pi := v_row.payment_intent_id;

    UPDATE pending_orders SET
        status                = 'awaiting_payment',
        delivery_quote_status = 'quoted',
        delivery_fee          = p_fee,
        original_total_amount = CASE WHEN v_price_changed
                                     THEN COALESCE(original_total_amount, total_amount)
                                     ELSE original_total_amount END,
        total_amount          = v_new_total,
        -- A revised price invalidates any stale PaymentIntent. The Edge
        -- Function cancels it at Stripe with the id returned below;
        -- create-payment-intent additionally refuses amount-mismatched
        -- reuse and versions its idempotency key by price_revision.
        price_revision        = CASE WHEN v_price_changed
                                     THEN price_revision + 1 ELSE price_revision END,
        payment_intent_id     = CASE WHEN v_price_changed THEN NULL ELSE payment_intent_id END,
        expires_at            = now() + make_interval(hours => v_link_hours),
        payment_link_sent_at  = now(),
        payment_reminder_sent_at = NULL,
        delivery_quote_log    = COALESCE(delivery_quote_log, '[]'::jsonb)
            || jsonb_build_array(jsonb_build_object(
                   'fee', p_fee, 'staff_id', p_staff_id, 'notes', p_notes,
                   'at', now(), 'previous_total', v_row.total_amount,
                   'new_total', v_new_total, 'price_changed', v_price_changed))
    WHERE id = p_pending_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'success', true,
        'pending_order_id', v_row.id,
        'order_number', v_row.order_number,
        'customer_email', v_row.customer_email,
        'customer_name', v_row.customer_name,
        'customer_language', v_row.customer_language,
        'date_needed', v_row.date_needed,
        'time_needed', v_row.time_needed,
        'delivery_address', v_row.delivery_address,
        'delivery_fee', v_row.delivery_fee,
        'total_amount', v_row.total_amount,
        'price_changed', v_price_changed,
        'original_total_amount', v_row.original_total_amount,
        'expires_at', v_row.expires_at,
        'payment_link_hours', v_link_hours,
        'old_payment_intent_id', CASE WHEN v_price_changed THEN v_old_pi ELSE NULL END
    );
END;
$function$;

-- -------------------------------------------------------------------------
-- 5. resolve_image_review — unchanged except both capacity predicates now
--    also exempt quote-held rows (mirrors create_pending_order_secure)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_image_review(p_pending_id uuid, p_action text, p_staff_id uuid, p_updates jsonb DEFAULT NULL::jsonb, p_final_total numeric DEFAULT NULL::numeric, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_row           pending_orders;
    v_max_cap       int;
    v_link_hours    int;
    v_hold_days     int;
    v_booked        int;
    v_new_date      date;
    v_new_fee       numeric;
    v_new_total     numeric;
    v_old_pi        text;
    v_price_changed boolean := false;
    v_resolution    jsonb;
BEGIN
    IF p_action NOT IN ('approve', 'decline', 'reopen', 'expire') THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_action');
    END IF;
    IF p_staff_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'staff_id_required');
    END IF;

    SELECT * INTO v_row FROM pending_orders WHERE id = p_pending_id FOR UPDATE;
    IF v_row.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF v_row.status = 'promoted' THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_paid');
    END IF;

    SELECT max_daily_capacity, review_payment_link_hours, review_hold_days
      INTO v_max_cap, v_link_hours, v_hold_days
    FROM business_settings LIMIT 1;
    v_link_hours := COALESCE(v_link_hours, 48);
    v_hold_days  := COALESCE(v_hold_days, 7);

    v_resolution := jsonb_build_object(
        'action', p_action, 'staff_id', p_staff_id,
        'notes', p_notes, 'at', now()
    );

    -- ---------------- reopen (expired/declined back to the queue) ----------
    IF p_action = 'reopen' THEN
        IF NOT (v_row.image_review_status IN ('review_expired', 'declined')
                OR v_row.status = 'expired') THEN
            RETURN jsonb_build_object('success', false, 'error', 'not_reopenable');
        END IF;
        UPDATE pending_orders SET
            status              = 'awaiting_payment',
            image_review_status = 'needs_review',
            expires_at          = now() + make_interval(days => v_hold_days),
            review_resolved_by  = p_staff_id,
            review_resolved_at  = now(),
            image_review_result = COALESCE(image_review_result, '{}'::jsonb)
                || jsonb_build_object('resolutions',
                     COALESCE(image_review_result->'resolutions', '[]'::jsonb)
                     || jsonb_build_array(v_resolution))
        WHERE id = p_pending_id;
        RETURN jsonb_build_object('success', true, 'action', 'reopen',
            'order_number', v_row.order_number);
    END IF;

    -- ---------------- decline / expire (terminal, capacity released now) ---
    IF p_action IN ('decline', 'expire') THEN
        IF v_row.image_review_status NOT IN ('needs_review', 'approved', 'review_expired') THEN
            RETURN jsonb_build_object('success', false, 'error', 'not_in_review');
        END IF;
        UPDATE pending_orders SET
            status              = 'expired',
            image_review_status = CASE WHEN p_action = 'decline'
                                       THEN 'declined' ELSE 'review_expired' END,
            expires_at          = now(),   -- releases capacity + blocks payment immediately
            review_resolved_by  = p_staff_id,
            review_resolved_at  = now(),
            image_review_result = COALESCE(image_review_result, '{}'::jsonb)
                || jsonb_build_object('resolutions',
                     COALESCE(image_review_result->'resolutions', '[]'::jsonb)
                     || jsonb_build_array(v_resolution))
        WHERE id = p_pending_id;
        RETURN jsonb_build_object('success', true, 'action', p_action,
            'order_number', v_row.order_number,
            'customer_email', v_row.customer_email,
            'customer_name', v_row.customer_name,
            'customer_language', v_row.customer_language);
    END IF;

    -- ---------------- approve (as-is or with revisions) ---------------------
    IF v_row.image_review_status NOT IN ('needs_review', 'review_expired', 'approved') THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_in_review');
    END IF;

    v_new_date  := COALESCE(NULLIF(p_updates->>'date_needed', '')::date, v_row.date_needed);
    v_new_fee   := COALESCE(NULLIF(p_updates->>'delivery_fee', '')::numeric, v_row.delivery_fee, 0);
    v_new_total := COALESCE(p_final_total, v_row.total_amount);

    IF v_new_total <= 0 OR v_new_total > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'invalid_total');
    END IF;
    IF v_new_date < CURRENT_DATE THEN
        RETURN jsonb_build_object('success', false, 'error', 'date_past');
    END IF;

    -- Capacity re-check on the effective date (locked rule). Same predicate
    -- as create_pending_order_secure's gate, excluding this row itself.
    IF v_max_cap IS NOT NULL THEN
        SELECT (
            (SELECT COUNT(*) FROM orders
                WHERE date_needed = v_new_date AND status != 'cancelled')
            +
            (SELECT COUNT(*) FROM pending_orders
                WHERE date_needed = v_new_date
                  AND status = 'awaiting_payment'
                  AND expires_at > now()
                  AND image_review_status NOT IN ('needs_review', 'declined', 'review_expired')
                  -- DELIVERY: quote-held rows do not consume capacity
                  AND delivery_quote_status <> 'quote_required'
                  AND id <> p_pending_id)
        ) INTO v_booked;

        IF v_booked >= v_max_cap THEN
            RETURN jsonb_build_object('success', false, 'error', 'capacity_full',
                'booked', v_booked, 'capacity', v_max_cap, 'date', v_new_date);
        END IF;
    END IF;

    v_price_changed := (v_new_total IS DISTINCT FROM v_row.total_amount);
    v_old_pi := v_row.payment_intent_id;

    UPDATE pending_orders SET
        status              = 'awaiting_payment',
        image_review_status = 'approved',
        date_needed         = v_new_date,
        time_needed         = COALESCE(NULLIF(p_updates->>'time_needed', '')::time, time_needed),
        cake_size           = COALESCE(NULLIF(p_updates->>'cake_size', ''), cake_size),
        filling             = COALESCE(NULLIF(p_updates->>'filling', ''), filling),
        theme               = COALESCE(NULLIF(p_updates->>'theme', ''), theme),
        dedication          = COALESCE(p_updates->>'dedication', dedication),
        recipient_name      = COALESCE(NULLIF(p_updates->>'recipient_name', ''), recipient_name),
        servings            = COALESCE(NULLIF(p_updates->>'servings', '')::int, servings),
        delivery_option     = COALESCE(NULLIF(p_updates->>'delivery_option', ''), delivery_option),
        delivery_address    = COALESCE(p_updates->>'delivery_address', delivery_address),
        delivery_fee        = v_new_fee,
        original_total_amount = CASE WHEN v_price_changed
                                     THEN COALESCE(original_total_amount, total_amount)
                                     ELSE original_total_amount END,
        total_amount        = v_new_total,
        subtotal            = CASE WHEN v_price_changed
                                   THEN v_new_total - v_new_fee
                                   ELSE subtotal END,
        price_revision      = CASE WHEN v_price_changed
                                   THEN price_revision + 1 ELSE price_revision END,
        -- A revised price invalidates any stale PaymentIntent. The Edge
        -- Function cancels it at Stripe with the id returned below;
        -- create-payment-intent additionally refuses amount-mismatched reuse
        -- and versions its idempotency key by price_revision.
        payment_intent_id   = CASE WHEN v_price_changed THEN NULL ELSE payment_intent_id END,
        expires_at          = now() + make_interval(hours => v_link_hours),
        payment_link_sent_at = now(),
        payment_reminder_sent_at = NULL,
        review_resolved_by  = p_staff_id,
        review_resolved_at  = now(),
        image_review_result = COALESCE(image_review_result, '{}'::jsonb)
            || jsonb_build_object('resolutions',
                 COALESCE(image_review_result->'resolutions', '[]'::jsonb)
                 || jsonb_build_array(v_resolution || jsonb_build_object(
                        'price_changed', v_price_changed,
                        'previous_total', v_row.total_amount,
                        'final_total', v_new_total,
                        'updates', p_updates)))
    WHERE id = p_pending_id
    RETURNING * INTO v_row;

    RETURN jsonb_build_object(
        'success', true, 'action', 'approve',
        'pending_order_id', v_row.id,
        'order_number', v_row.order_number,
        'customer_email', v_row.customer_email,
        'customer_name', v_row.customer_name,
        'customer_language', v_row.customer_language,
        'date_needed', v_row.date_needed,
        'time_needed', v_row.time_needed,
        'total_amount', v_row.total_amount,
        'price_changed', v_price_changed,
        'original_total_amount', v_row.original_total_amount,
        'expires_at', v_row.expires_at,
        'payment_link_hours', v_link_hours,
        'old_payment_intent_id', CASE WHEN v_price_changed THEN v_old_pi ELSE NULL END
    );
END;
$function$;

-- -------------------------------------------------------------------------
-- 6. get_pending_order — expose the quote status so the checkout and the
--    holding page can branch (adds two keys; nothing removed)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_order(p_pending_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
        'delivery_quote_status', v_row.delivery_quote_status,
        'delivery_distance_miles', v_row.delivery_distance_miles,
        'subtotal', v_row.subtotal,
        'total_amount', v_row.total_amount,
        'expires_at', v_row.expires_at
    );
END;
$function$;

-- -------------------------------------------------------------------------
-- 7. Production data corrections (idempotent)
-- -------------------------------------------------------------------------
-- The bakery moved to Norristown; business_settings still carried the old
-- Bensalem address (never displayed to customers, but it is the admin-
-- editable "source of truth" and must not contradict the site).
UPDATE business_settings
SET address_street = '324 W Marshall St',
    address_city   = 'Norristown',
    address_state  = 'PA',
    address_zip    = '19401',
    updated_at     = now()
WHERE address_street = '846 Street Rd.' OR address_city = 'Bensalem';

-- -------------------------------------------------------------------------
-- 8. De-expose stale ZIP-zone machinery (delivery_zones is empty and MUST
--    NOT influence pricing; keep the table for now, close the RPC surface)
-- -------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.find_delivery_zone(text) FROM PUBLIC, anon, authenticated;

-- -------------------------------------------------------------------------
-- 9. Grants — explicit, and LAST so a partial apply can never leave the
--    functions exposed-but-unguarded (locked rule from the 2026-07 grant
--    migration incident).
-- -------------------------------------------------------------------------
-- Secure creator + quote resolver: machine-only (Edge Functions hold the
-- service_role key). Function default EXECUTE for PUBLIC must be stripped.
REVOKE EXECUTE ON FUNCTION public.create_pending_order_secure(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_pending_order_secure(jsonb, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_delivery_quote(uuid, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_delivery_quote(uuid, uuid, numeric, text) TO service_role;

-- Public wrapper + reader keep their existing exposure.
GRANT EXECUTE ON FUNCTION public.create_pending_order(jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_order(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_image_review(uuid, text, uuid, jsonb, numeric, text) TO service_role;

-- pending_orders: no new table grants needed — staff read the queue through
-- the existing "Staff view all pending orders" RLS policy + authenticated
-- SELECT grant; all writes go through the SECURITY DEFINER functions above.
