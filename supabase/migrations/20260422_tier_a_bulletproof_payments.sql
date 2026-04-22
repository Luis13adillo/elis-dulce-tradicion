-- Tier A — Bulletproof Payments
--
-- Root fix for the stranded-payment bug (Apr 2026): orders were created AFTER
-- Stripe succeeded via a browser callback. Any redirect flow (3DS, Cash App),
-- tab close, or network drop between "paid" and "onSuccess fired" lost the
-- order permanently because cake details lived only in sessionStorage.
--
-- New model: customer details persist to `pending_orders` BEFORE the Stripe
-- call. The webhook is now authoritative — on payment_intent.succeeded it
-- atomically promotes the pending row into `orders`. No browser involvement
-- required. Every bug class that caused Mahesh, Ana, Erik, Varun to be
-- stranded becomes impossible by construction.
--
-- Scope: only affects the customer-website payment path. Walk-in orders
-- (cash, staff-entered) continue using create_new_order and are untouched.

BEGIN;

-- =========================================================================
-- 1. pending_orders — the save-before-pay table
-- =========================================================================
CREATE TABLE IF NOT EXISTS pending_orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'awaiting_payment'
        CHECK (status IN ('awaiting_payment', 'payment_failed', 'promoted', 'expired')),

    -- Stripe linkage (null until PaymentIntent is created)
    payment_intent_id text UNIQUE,
    error_message text,
    error_code text,

    -- Customer identity
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    customer_name text NOT NULL,
    customer_email text NOT NULL,
    customer_phone text NOT NULL,
    customer_language text DEFAULT 'en',

    -- Cake
    cake_size text NOT NULL,
    cake_size_value text,
    filling text NOT NULL,
    filling_values jsonb,
    theme text NOT NULL,
    dedication text,
    reference_image_path text,
    premium_filling_upcharge numeric DEFAULT 0,

    -- Timing
    date_needed date NOT NULL,
    time_needed time NOT NULL,

    -- Delivery
    delivery_option text NOT NULL DEFAULT 'pickup'
        CHECK (delivery_option IN ('pickup', 'delivery')),
    delivery_address text,
    delivery_apartment text,
    delivery_zone text,
    delivery_fee numeric DEFAULT 0,
    delivery_instructions text,

    -- Money
    subtotal numeric,
    tax_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    total_amount numeric NOT NULL,

    -- Consent
    consent_given boolean DEFAULT true,
    consent_timestamp timestamptz DEFAULT now(),

    -- Full raw snapshot for recovery if this table schema ever drifts
    raw_payload jsonb,

    -- Lifecycle
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '24 hours'),
    promoted_at timestamptz,
    promoted_order_id integer REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_orders_status_expires
    ON pending_orders (status, expires_at)
    WHERE status = 'awaiting_payment';
CREATE INDEX IF NOT EXISTS idx_pending_orders_payment_intent
    ON pending_orders (payment_intent_id)
    WHERE payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_orders_user
    ON pending_orders (user_id)
    WHERE user_id IS NOT NULL;

-- updated_at trigger (reuses existing helper from the codebase)
CREATE TRIGGER pending_orders_updated_at
    BEFORE UPDATE ON pending_orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =========================================================================
-- 2. stripe_webhook_events — event-ID dedup for at-least-once delivery
-- =========================================================================
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    event_id text PRIMARY KEY,
    event_type text NOT NULL,
    received_at timestamptz DEFAULT now(),
    payload jsonb
);

-- =========================================================================
-- 3. orders — add idempotency_key + pending_order_id linkage
-- =========================================================================
ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS idempotency_key text UNIQUE;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS pending_order_id uuid REFERENCES pending_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_pending_order
    ON orders (pending_order_id)
    WHERE pending_order_id IS NOT NULL;

-- =========================================================================
-- 4. create_pending_order — replaces the old "save-after-pay" flow
-- =========================================================================
-- SECURITY DEFINER so guest checkouts (no auth.uid()) can create pending
-- orders. Fields are validated here, not by RLS.
CREATE OR REPLACE FUNCTION create_pending_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_number text;
    v_pending pending_orders;
    v_user_id uuid := auth.uid();
    v_attempts int := 0;
BEGIN
    -- Generate a non-sequential order number, retry on the rare collision.
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

    -- Required field validation — fail loudly, don't write a half row
    IF payload->>'customer_name' IS NULL OR payload->>'customer_email' IS NULL
       OR payload->>'customer_phone' IS NULL OR payload->>'cake_size' IS NULL
       OR payload->>'filling' IS NULL OR payload->>'theme' IS NULL
       OR payload->>'date_needed' IS NULL OR payload->>'time_needed' IS NULL
       OR payload->>'total_amount' IS NULL THEN
        RAISE EXCEPTION 'Missing required order fields';
    END IF;

    -- Amount sanity: > 0, < 10000 (matches Edge Function cap)
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
$$;

GRANT EXECUTE ON FUNCTION create_pending_order(jsonb) TO anon, authenticated;

-- =========================================================================
-- 5. get_pending_order — frontend-safe read by UUID
-- =========================================================================
-- The UUID itself is the access token (unguessable). SECURITY DEFINER lets
-- guest users read their own pending order without RLS contortions.
-- Only returns awaiting_payment / payment_failed rows — once promoted, the
-- real order lives in `orders` and is fetched via get_public_order.
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

-- =========================================================================
-- 6. promote_pending_order — webhook-side atomic INSERT into orders
-- =========================================================================
-- Called from stripe-webhook on payment_intent.succeeded. Idempotent:
-- repeated calls with the same pending_id return the existing order row.
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
    v_pending pending_orders;
    v_new_order orders;
    v_idem text;
BEGIN
    -- Lock the pending row to serialize concurrent webhook retries
    SELECT * INTO v_pending FROM pending_orders
    WHERE id = p_pending_id
    FOR UPDATE;

    IF v_pending IS NULL THEN
        RAISE EXCEPTION 'pending_order not found: %', p_pending_id;
    END IF;

    -- Already promoted (webhook retry) — return existing order
    IF v_pending.status = 'promoted' AND v_pending.promoted_order_id IS NOT NULL THEN
        SELECT * INTO v_new_order FROM orders WHERE id = v_pending.promoted_order_id;
        RETURN jsonb_build_object('order', to_jsonb(v_new_order), 'already_promoted', true);
    END IF;

    v_idem := COALESCE(p_idempotency_key, p_pending_id::text);

    -- INSERT into orders with full field copy. ON CONFLICT on idempotency_key
    -- prevents a parallel duplicate from creating two rows.
    INSERT INTO orders (
        order_number, status, payment_status, payment_method,
        customer_name, customer_email, customer_phone, customer_language,
        cake_size, filling, theme, dedication, reference_image_path,
        premium_filling_upcharge,
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
        v_pending.premium_filling_upcharge,
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
        SET updated_at = now()   -- no-op update to return the row
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

-- Only the service role (Edge Function) can promote.
REVOKE ALL ON FUNCTION promote_pending_order(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION promote_pending_order(uuid, text, text) TO service_role;

-- =========================================================================
-- 7. mark_pending_order_failed — webhook-side on payment_intent.payment_failed
-- =========================================================================
CREATE OR REPLACE FUNCTION mark_pending_order_failed(
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
    UPDATE pending_orders
    SET status = 'payment_failed',
        payment_intent_id = p_payment_intent_id,
        error_message = p_error_message,
        error_code = p_error_code,
        -- Extend expiry so the customer has 24h from the failure to retry
        expires_at = now() + interval '24 hours'
    WHERE id = p_pending_id
    RETURNING * INTO v_row;

    IF v_row IS NULL THEN
        RAISE EXCEPTION 'pending_order not found: %', p_pending_id;
    END IF;

    RETURN to_jsonb(v_row);
END;
$$;

REVOKE ALL ON FUNCTION mark_pending_order_failed(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mark_pending_order_failed(uuid, text, text, text) TO service_role;

-- =========================================================================
-- 8. RLS — pending_orders
-- =========================================================================
ALTER TABLE pending_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers view own pending orders"
    ON pending_orders FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Staff view all pending orders"
    ON pending_orders FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM user_profiles
        WHERE user_profiles.user_id = auth.uid()
          AND user_profiles.role IN ('owner', 'baker')
    ));

-- No INSERT/UPDATE policies — writes go through SECURITY DEFINER RPCs only.

-- stripe_webhook_events: service-role only (no policies = no access for
-- anon/authenticated with RLS enabled).

-- =========================================================================
-- 9. Prune expired pending_orders (hourly)
-- =========================================================================
-- Unpromoted rows past expires_at get marked 'expired' then deleted after 7d
-- for audit trail. Promoted rows stay — they're the paper trail for every
-- successful order's lifecycle.
CREATE OR REPLACE FUNCTION prune_expired_pending_orders()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_marked int;
BEGIN
    UPDATE pending_orders
    SET status = 'expired'
    WHERE status IN ('awaiting_payment', 'payment_failed')
      AND expires_at < now();
    GET DIAGNOSTICS v_marked = ROW_COUNT;

    DELETE FROM pending_orders
    WHERE status = 'expired'
      AND updated_at < now() - interval '7 days';

    -- Also prune old webhook dedup records after 30d — they're only useful
    -- as long as Stripe might retry the event.
    DELETE FROM stripe_webhook_events
    WHERE received_at < now() - interval '30 days';

    RETURN v_marked;
END;
$$;

-- Hourly job. Safe to run more often — it's idempotent.
-- Unschedule first so re-applying this migration is safe.
DO $cron$
BEGIN
    PERFORM cron.unschedule('prune-expired-pending-orders');
EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist yet
END
$cron$;

SELECT cron.schedule(
    'prune-expired-pending-orders',
    '5 * * * *',
    $$SELECT prune_expired_pending_orders();$$
);

COMMIT;
