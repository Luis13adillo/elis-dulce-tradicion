-- ============================================================================
-- Image review workflow — Phase 2 RPCs
-- ============================================================================
-- 1. create_pending_order: held review rows stop counting toward daily
--    capacity (locked rule: review requests must not consume confirmed
--    capacity or permanently block dates). Only change vs the 20260428
--    definition is the pending-side capacity predicate + this header.
-- 2. resolve_image_review: staff resolution (approve / decline / reopen /
--    expire) with capacity re-check at approval, whitelisted detail + full
--    final-price revision, PaymentIntent invalidation bookkeeping, payment
--    window management, and an append-only resolution history inside
--    image_review_result. service_role-only (called by the review-resolve
--    Edge Function, which authenticates staff and owns Stripe + email side
--    effects), mirroring the promote_pending_order grant pattern.
--
-- Capacity model (evidence-based, see 20260728T150000 header):
--   * counted:   orders (status != cancelled) + pending awaiting_payment,
--                unexpired, NOT review-held  → includes 'approved' rows,
--                which is exactly the "slot protected during the payment
--                window" rule; expiry releases the slot automatically.
--   * excluded:  needs_review / declined / review_expired rows.
-- ============================================================================

-- ----------------------------------------------------------------------
-- 1. create_pending_order — capacity predicate now excludes review-held rows
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
                  AND expires_at > now()
                  -- Review-held rows do not consume capacity. 'approved'
                  -- rows (open payment window) still count — that IS the
                  -- protected slot; expiry releases it automatically.
                  AND image_review_status NOT IN ('needs_review', 'declined', 'review_expired'))
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

GRANT EXECUTE ON FUNCTION public.create_pending_order(jsonb) TO anon, authenticated;

-- ----------------------------------------------------------------------
-- 2. resolve_image_review — staff resolution of held photo reviews
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_image_review(
    p_pending_id uuid,
    p_action     text,              -- 'approve' | 'decline' | 'reopen' | 'expire'
    p_staff_id   uuid,
    p_updates    jsonb   DEFAULT NULL,
    p_final_total numeric DEFAULT NULL,
    p_notes      text    DEFAULT NULL
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
    -- as create_pending_order's gate, excluding this row itself.
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

REVOKE ALL ON FUNCTION public.resolve_image_review(uuid, text, uuid, jsonb, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_image_review(uuid, text, uuid, jsonb, numeric, text) TO service_role;

COMMENT ON FUNCTION public.resolve_image_review(uuid, text, uuid, jsonb, numeric, text) IS
    'Staff resolution of pre-payment photo reviews. service_role only — invoked by the review-resolve Edge Function which authenticates the staff JWT, enforces the contacted-customer confirmation, cancels stale PaymentIntents at Stripe, and sends the customer emails.';
