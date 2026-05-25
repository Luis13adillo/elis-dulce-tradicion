-- Two changes to transition_order_status(integer, varchar, uuid, text, jsonb):
--
-- 1. Enforce the order state machine. Mirrors src/lib/orderStateMachine.ts.
--    Invalid transitions now return {success: false, error: "invalid
--    transition from X to Y"} without touching the order row or history.
--
-- 2. Populate order_status_history.new_status and order_status_history.reason
--    in the INSERT. Both columns existed but were always NULL because the
--    function only wrote status / notes.
--
-- Rollback reference — previous function body (post-20260428 fix):
--
--   CREATE OR REPLACE FUNCTION public.transition_order_status(
--     p_order_id integer,
--     p_new_status character varying,
--     p_user_id uuid DEFAULT NULL::uuid,
--     p_reason text DEFAULT NULL::text,
--     p_metadata jsonb DEFAULT '{}'::jsonb
--   )
--   RETURNS jsonb
--   LANGUAGE plpgsql
--   SECURITY DEFINER
--   SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_order RECORD;
--     v_previous_status VARCHAR(50);
--     v_time_diff INTEGER;
--     v_confirmed_at TIMESTAMP WITH TIME ZONE;
--   BEGIN
--     SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
--     IF v_order IS NULL THEN
--       RETURN jsonb_build_object('success', false, 'error', 'Order not found');
--     END IF;
--     v_previous_status := v_order.status;
--     IF v_previous_status = p_new_status THEN
--       RETURN jsonb_build_object('success', true, 'message', 'Status unchanged');
--     END IF;
--     IF p_new_status = 'confirmed' AND v_order.created_at IS NOT NULL THEN
--       v_time_diff := EXTRACT(EPOCH FROM (NOW() - v_order.created_at)) / 60;
--       UPDATE orders SET time_to_confirm = v_time_diff WHERE id = p_order_id;
--     END IF;
--     IF p_new_status = 'ready' THEN
--       SELECT created_at INTO v_confirmed_at FROM order_status_history
--         WHERE order_id = p_order_id AND status = 'confirmed'
--         ORDER BY created_at DESC LIMIT 1;
--       IF v_confirmed_at IS NOT NULL THEN
--         v_time_diff := EXTRACT(EPOCH FROM (NOW() - v_confirmed_at)) / 60;
--         UPDATE orders SET time_to_ready = v_time_diff WHERE id = p_order_id;
--       END IF;
--     END IF;
--     IF p_new_status = 'completed' AND v_order.ready_at IS NOT NULL THEN
--       v_time_diff := EXTRACT(EPOCH FROM (NOW() - v_order.ready_at)) / 60;
--       UPDATE orders SET time_to_complete = v_time_diff WHERE id = p_order_id;
--     END IF;
--     UPDATE orders SET status = p_new_status, updated_at = NOW(),
--       ready_at      = CASE WHEN p_new_status = 'ready'            THEN NOW() ELSE ready_at      END,
--       dispatched_at = CASE WHEN p_new_status = 'out_for_delivery' THEN NOW() ELSE dispatched_at END,
--       delivered_at  = CASE WHEN p_new_status = 'delivered'        THEN NOW() ELSE delivered_at  END,
--       completed_at  = CASE WHEN p_new_status = 'completed'        THEN NOW() ELSE completed_at  END,
--       cancelled_at  = CASE WHEN p_new_status = 'cancelled'        THEN NOW() ELSE cancelled_at  END,
--       cancellation_reason = CASE WHEN p_new_status = 'cancelled' THEN p_reason ELSE cancellation_reason END
--     WHERE id = p_order_id;
--     INSERT INTO order_status_history (order_id, status, previous_status, changed_by, notes, metadata, created_at)
--     VALUES (p_order_id, p_new_status, v_previous_status, p_user_id, p_reason, p_metadata, NOW());
--     RETURN jsonb_build_object('success', true, 'previous_status', v_previous_status,
--                               'new_status', p_new_status, 'order_id', p_order_id);
--   EXCEPTION WHEN OTHERS THEN
--     RETURN jsonb_build_object('success', false, 'error', SQLERRM);
--   END;
--   $function$;

CREATE OR REPLACE FUNCTION public.transition_order_status(
  p_order_id integer,
  p_new_status character varying,
  p_user_id uuid DEFAULT NULL::uuid,
  p_reason text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_previous_status VARCHAR(50);
  v_time_diff INTEGER;
  v_confirmed_at TIMESTAMP WITH TIME ZONE;
  v_valid BOOLEAN;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_order IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Order not found');
  END IF;

  v_previous_status := v_order.status;

  IF v_previous_status = p_new_status THEN
    RETURN jsonb_build_object('success', true, 'message', 'Status unchanged');
  END IF;

  v_valid := CASE v_previous_status
    WHEN 'pending'          THEN p_new_status IN ('confirmed', 'cancelled')
    WHEN 'confirmed'        THEN p_new_status IN ('in_progress', 'cancelled')
    WHEN 'in_progress'      THEN p_new_status IN ('ready', 'cancelled')
    WHEN 'ready'            THEN p_new_status IN ('out_for_delivery', 'delivered', 'completed', 'cancelled')
    WHEN 'out_for_delivery' THEN p_new_status IN ('delivered', 'cancelled')
    WHEN 'delivered'        THEN p_new_status IN ('completed')
    WHEN 'completed'        THEN FALSE
    WHEN 'cancelled'        THEN FALSE
    ELSE FALSE
  END;

  IF NOT v_valid THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid transition from ' || v_previous_status || ' to ' || p_new_status
    );
  END IF;

  IF p_new_status = 'confirmed' AND v_order.created_at IS NOT NULL THEN
    v_time_diff := EXTRACT(EPOCH FROM (NOW() - v_order.created_at)) / 60;
    UPDATE orders SET time_to_confirm = v_time_diff WHERE id = p_order_id;
  END IF;

  IF p_new_status = 'ready' THEN
    SELECT created_at INTO v_confirmed_at
    FROM order_status_history
    WHERE order_id = p_order_id AND status = 'confirmed'
    ORDER BY created_at DESC LIMIT 1;

    IF v_confirmed_at IS NOT NULL THEN
      v_time_diff := EXTRACT(EPOCH FROM (NOW() - v_confirmed_at)) / 60;
      UPDATE orders SET time_to_ready = v_time_diff WHERE id = p_order_id;
    END IF;
  END IF;

  IF p_new_status = 'completed' AND v_order.ready_at IS NOT NULL THEN
    v_time_diff := EXTRACT(EPOCH FROM (NOW() - v_order.ready_at)) / 60;
    UPDATE orders SET time_to_complete = v_time_diff WHERE id = p_order_id;
  END IF;

  UPDATE orders SET
    status = p_new_status,
    updated_at = NOW(),
    ready_at       = CASE WHEN p_new_status = 'ready'            THEN NOW() ELSE ready_at       END,
    dispatched_at  = CASE WHEN p_new_status = 'out_for_delivery' THEN NOW() ELSE dispatched_at  END,
    delivered_at   = CASE WHEN p_new_status = 'delivered'        THEN NOW() ELSE delivered_at   END,
    completed_at   = CASE WHEN p_new_status = 'completed'        THEN NOW() ELSE completed_at   END,
    cancelled_at   = CASE WHEN p_new_status = 'cancelled'        THEN NOW() ELSE cancelled_at   END,
    cancellation_reason = CASE WHEN p_new_status = 'cancelled' THEN p_reason ELSE cancellation_reason END
  WHERE id = p_order_id;

  INSERT INTO order_status_history (
    order_id,
    status,
    new_status,
    previous_status,
    changed_by,
    notes,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_order_id,
    p_new_status,
    p_new_status,
    v_previous_status,
    p_user_id,
    p_reason,
    p_reason,
    p_metadata,
    NOW()
  );

  RETURN jsonb_build_object(
    'success', true,
    'previous_status', v_previous_status,
    'new_status', p_new_status,
    'order_id', p_order_id
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
