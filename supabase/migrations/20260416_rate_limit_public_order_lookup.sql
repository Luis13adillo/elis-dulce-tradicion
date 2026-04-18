-- Enforce rate limiting on public order lookup to block order-number scanning.
-- Existing get_public_order() exposed a brute-forceable endpoint. The existing
-- check_order_lookup_rate_limit() helper was never actually invoked.
--
-- This migration wraps get_public_order() so that every call extracts the real
-- client IP from PostgREST's forwarded request headers (x-forwarded-for), then
-- calls the rate limiter before executing the lookup. Returns NULL when
-- exceeded (same shape as "not found") so callers treat it uniformly.

-- Self-sufficient: ensure rate-limit table + helper exist (the 2025-02-06
-- migration that originally created them was never applied in production).
CREATE TABLE IF NOT EXISTS order_lookup_rate_limits (
  ip_address text NOT NULL,
  lookup_count integer DEFAULT 1,
  window_start timestamp with time zone DEFAULT now(),
  PRIMARY KEY (ip_address)
);

CREATE INDEX IF NOT EXISTS idx_order_lookup_rate_limits_window
  ON order_lookup_rate_limits(window_start);

CREATE OR REPLACE FUNCTION check_order_lookup_rate_limit(p_ip text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_window_start timestamp with time zone;
BEGIN
  SELECT lookup_count, window_start INTO v_count, v_window_start
  FROM order_lookup_rate_limits
  WHERE ip_address = p_ip;

  -- Fresh window: reset to 1
  IF v_window_start IS NULL OR (now() - v_window_start) > interval '1 minute' THEN
    INSERT INTO order_lookup_rate_limits (ip_address, lookup_count, window_start)
    VALUES (p_ip, 1, now())
    ON CONFLICT (ip_address)
    DO UPDATE SET lookup_count = 1, window_start = now();
    RETURN true;
  END IF;

  -- Over limit (10/min/ip)
  IF v_count >= 10 THEN
    RETURN false;
  END IF;

  UPDATE order_lookup_rate_limits
  SET lookup_count = lookup_count + 1
  WHERE ip_address = p_ip;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION check_order_lookup_rate_limit(text) TO authenticated;
GRANT EXECUTE ON FUNCTION check_order_lookup_rate_limit(text) TO anon;

CREATE OR REPLACE FUNCTION cleanup_order_lookup_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM order_lookup_rate_limits
  WHERE window_start < now() - interval '5 minutes';
END;
$$;

-- Drop first: CREATE OR REPLACE cannot change return type, and the live
-- function's signature may have drifted from the original migration.
DROP FUNCTION IF EXISTS get_public_order(text);

CREATE FUNCTION get_public_order(p_order_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order record;
  v_result jsonb;
  v_client_ip text;
  v_rate_ok boolean;
BEGIN
  -- Validate input
  IF p_order_number IS NULL OR trim(p_order_number) = '' THEN
    RETURN NULL;
  END IF;

  -- Extract real client IP from PostgREST-forwarded headers.
  -- Supabase sits behind a proxy, so inet_client_addr() is useless; we use the
  -- x-forwarded-for header set by the load balancer. Fall back to a constant
  -- key so missing headers still share a rate bucket (never bypass).
  BEGIN
    v_client_ip := split_part(
      trim(coalesce(
        current_setting('request.headers', true)::json->>'x-forwarded-for',
        'unknown'
      )),
      ',',
      1
    );
  EXCEPTION WHEN OTHERS THEN
    v_client_ip := 'unknown';
  END;

  IF v_client_ip IS NULL OR v_client_ip = '' THEN
    v_client_ip := 'unknown';
  END IF;

  -- Enforce rate limit (10 lookups / minute / IP, defined in 20250206 migration)
  v_rate_ok := check_order_lookup_rate_limit(v_client_ip);
  IF NOT v_rate_ok THEN
    -- Log but don't leak signal to the caller
    RAISE LOG 'Order lookup rate limit exceeded for ip=%', v_client_ip;
    RETURN NULL;
  END IF;

  -- Fetch order with limited fields (no sensitive customer data)
  SELECT
    id,
    order_number,
    customer_name,
    CASE
      WHEN customer_email IS NOT NULL THEN
        substring(customer_email from 1 for 3) || '***@' ||
        split_part(customer_email, '@', 2)
      ELSE NULL
    END as customer_email,
    status,
    date_needed,
    time_needed,
    cake_size,
    filling,
    theme,
    delivery_option,
    delivery_zone,
    delivery_status,
    estimated_delivery_time,
    total_amount,
    payment_status,
    created_at,
    ready_at,
    completed_at,
    cancelled_at,
    cancellation_reason,
    refund_amount,
    refund_status
  INTO v_order
  FROM orders
  WHERE order_number = trim(p_order_number);

  IF v_order IS NULL THEN
    RETURN NULL;
  END IF;

  v_result := jsonb_build_object(
    'id', v_order.id,
    'order_number', v_order.order_number,
    'customer_name', v_order.customer_name,
    'customer_email', v_order.customer_email,
    'status', v_order.status,
    'date_needed', v_order.date_needed,
    'time_needed', v_order.time_needed,
    'cake_size', v_order.cake_size,
    'filling', v_order.filling,
    'theme', v_order.theme,
    'delivery_option', v_order.delivery_option,
    'delivery_zone', v_order.delivery_zone,
    'delivery_status', v_order.delivery_status,
    'estimated_delivery_time', v_order.estimated_delivery_time,
    'total_amount', v_order.total_amount,
    'payment_status', v_order.payment_status,
    'created_at', v_order.created_at,
    'ready_at', v_order.ready_at,
    'completed_at', v_order.completed_at,
    'cancelled_at', v_order.cancelled_at,
    'cancellation_reason', v_order.cancellation_reason,
    'refund_amount', v_order.refund_amount,
    'refund_status', v_order.refund_status
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_public_order(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_public_order(text) TO anon;

COMMENT ON FUNCTION get_public_order(text) IS
'Public order lookup. Rate-limited via check_order_lookup_rate_limit() using the
real client IP extracted from x-forwarded-for header (PostgREST request.headers).
Returns NULL when not found OR when rate-limited — callers cannot distinguish.';
