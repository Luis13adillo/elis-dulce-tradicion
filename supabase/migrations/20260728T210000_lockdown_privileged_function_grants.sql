-- =====================================================================
-- SECURITY LOCKDOWN: privileged function execution grants
-- =====================================================================
-- Audit 2026-07-28 proved, against live production, that an anonymous
-- caller holding only the public anon key (which ships inside the site's
-- JavaScript bundle) could EXECUTE nearly every SECURITY DEFINER function
-- in the public schema. Live evidence: an unauthenticated POST to
-- /rest/v1/rpc/get_orders_by_status returned real revenue-by-status, and
-- get_dashboard_summary returned the day's takings.
--
-- ROOT CAUSE: PostgreSQL grants EXECUTE to PUBLIC by default on CREATE
-- FUNCTION. Only three functions in this repo's history ever issued
-- REVOKE ALL ... FROM PUBLIC. Every migration since only ever GRANTed, so
-- the default PUBLIC grant silently persisted. CREATE OR REPLACE also
-- preserves prior grants, so each hardening rewrite inherited the hole.
--
-- STRATEGY
--   1. REVOKE EXECUTE from PUBLIC, anon and authenticated on every
--      function in the public schema (blanket, so nothing is missed).
--   2. Re-GRANT narrowly, by intent:
--        - customer/public flow  -> anon + authenticated
--        - staff-only operations -> authenticated, PLUS an in-function
--          role guard, because `authenticated` includes every customer who
--          ever signed up.
--        - internal/machine only -> service_role (+ postgres) only.
--   3. Staff operations are exposed through NEW guarded wrapper functions
--      rather than by rewriting the existing function bodies. The wrappers
--      check the caller's role and derive the acting user from auth.uid()
--      instead of trusting a client-supplied parameter. The original
--      functions keep their exact current behaviour and become
--      service_role-only, so this migration cannot regress order logic
--      that may have drifted from the repo.
--
-- IDEMPOTENT AND ENVIRONMENT-AGNOSTIC: every targeted GRANT/REVOKE is
-- guarded by to_regprocedure(), so this applies cleanly to production,
-- staging, and any future environment regardless of which subset of
-- functions exists there. Re-running it is a no-op.
--
-- SAFETY: privilege changes only. No table data is read or written.
-- Rollback is documented at the bottom of this file.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. Role predicate used by every staff wrapper
-- ---------------------------------------------------------------------
-- Returns true when the caller is either an internal/machine caller
-- (service_role via PostgREST, or a direct DB connection such as pg_cron)
-- or a signed-in user whose user_profiles.role is owner/baker.
--
-- SECURITY DEFINER so it can read user_profiles regardless of RLS, and
-- pinned search_path so it cannot be hijacked by a shadowing schema.
CREATE OR REPLACE FUNCTION public.is_staff_or_service()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_claims text;
    v_jwt_role text;
    v_uid      uuid;
BEGIN
    -- DO NOT use current_user here. This function is SECURITY DEFINER, so
    -- current_user is always the function OWNER (postgres) regardless of who
    -- called it. An earlier draft of this migration did exactly that and a
    -- hostile test on staging proved it authorised ANONYMOUS callers.
    -- The caller's real identity is only available from the PostgREST
    -- request context.
    v_claims := current_setting('request.jwt.claims', true);

    -- No request context at all => a direct database connection (pg_cron,
    -- psql, a migration). Reaching this code already requires database
    -- credentials, so treat it as internal.
    IF v_claims IS NULL OR v_claims = '' THEN
        RETURN true;
    END IF;

    BEGIN
        v_jwt_role := v_claims::jsonb ->> 'role';
    EXCEPTION WHEN OTHERS THEN
        v_jwt_role := NULL;
    END;

    -- Internal machine caller (Edge Functions, Stripe webhook).
    IF v_jwt_role = 'service_role' THEN
        RETURN true;
    END IF;

    -- Anonymous, or a token with no usable role claim: never staff.
    IF v_jwt_role IS DISTINCT FROM 'authenticated' THEN
        RETURN false;
    END IF;

    BEGIN
        v_uid := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_uid := NULL;
    END;

    IF v_uid IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.user_profiles up
        WHERE up.user_id = v_uid
          AND up.role IN ('owner', 'baker')
    );
END;
$fn$;

COMMENT ON FUNCTION public.is_staff_or_service() IS
    'Authorization predicate for staff-only RPCs. True for service_role/pg_cron '
    'callers, or signed-in users with user_profiles.role in (owner, baker). '
    'Added 2026-07-28 by the privileged-function lockdown.';

-- ---------------------------------------------------------------------
-- 1. Blanket revoke across the public schema
-- ---------------------------------------------------------------------
-- Belt-and-braces: strips the implicit PUBLIC grant from every existing
-- function, including any not enumerated below.
--
-- Verified safe before writing: all installed extensions live in the
-- `extensions` / `pg_catalog` / `vault` schemas, not `public`, and no
-- column DEFAULT in the public schema calls a public-schema function — so
-- this cannot break an INSERT performed by anon.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;

-- Stop future functions from silently re-opening the same hole.
--
-- This matters more than it looks. A Supabase project ships with default
-- privileges that GRANT EXECUTE on every newly created public-schema
-- function to PUBLIC, anon and authenticated. That is the root cause of this
-- entire class of bug: a migration author writes CREATE FUNCTION, grants it
-- to nobody, and it is silently world-executable. A hostile test on staging
-- caught exactly this — the staff_* wrappers created below picked up an
-- automatic `anon` grant despite never being granted to anon.
--
-- After this, any new customer-facing RPC must GRANT to anon EXPLICITLY.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- service_role keeps everything (it is the trusted internal identity used
-- by Edge Functions, the Stripe webhook, and pg_cron).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- ---------------------------------------------------------------------
-- 2. Staff-only wrappers (authenticated + in-function role guard)
-- ---------------------------------------------------------------------
-- The underlying functions stay exactly as they are and become reachable
-- only by service_role. The frontend calls these wrappers instead.

-- 2a. Order status transitions -----------------------------------------
-- Also fixes audit-trail forgery: the original takes a client-supplied
-- p_user_id and writes it to order_status_history.changed_by. The wrapper
-- passes auth.uid() instead, so a caller cannot stamp someone else's UUID
-- on their own action.
CREATE OR REPLACE FUNCTION public.staff_transition_order_status(
    p_order_id   integer,
    p_new_status character varying,
    p_reason     text  DEFAULT NULL,
    p_metadata   jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT public.is_staff_or_service() THEN
        RAISE EXCEPTION 'forbidden: staff role required'
            USING ERRCODE = '42501';
    END IF;

    SELECT public.transition_order_status(
               p_order_id,
               p_new_status,
               auth.uid(),   -- actor is derived, never client-supplied
               p_reason,
               p_metadata
           )
      INTO v_result;

    RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.staff_transition_order_status(integer, character varying, text, jsonb) IS
    'Staff-guarded entry point for transition_order_status. Enforces owner/baker '
    'role and derives order_status_history.changed_by from auth.uid().';

-- 2b. Walk-in order creation -------------------------------------------
-- The underlying create_new_order trusts the payload completely (it can
-- set status, payment_status and total_amount). That is acceptable for a
-- staff member taking a counter order; it was NOT acceptable being open
-- to the internet, which is what the audit found.
CREATE OR REPLACE FUNCTION public.staff_create_new_order(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT public.is_staff_or_service() THEN
        RAISE EXCEPTION 'forbidden: staff role required'
            USING ERRCODE = '42501';
    END IF;

    SELECT public.create_new_order(payload) INTO v_result;
    RETURN v_result;
END;
$fn$;

COMMENT ON FUNCTION public.staff_create_new_order(jsonb) IS
    'Staff-guarded entry point for walk-in order creation (create_new_order).';

-- 2c. Dashboard reporting ----------------------------------------------
-- NOTE: get_dashboard_summary returns `json` (not jsonb) in production —
-- verified against pg_get_function_result before writing this wrapper.
CREATE OR REPLACE FUNCTION public.staff_get_dashboard_summary(p_start_date date)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
    v_result json;
BEGIN
    IF NOT public.is_staff_or_service() THEN
        RAISE EXCEPTION 'forbidden: staff role required'
            USING ERRCODE = '42501';
    END IF;

    SELECT public.get_dashboard_summary(p_start_date) INTO v_result;
    RETURN v_result;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.staff_get_orders_by_status()
RETURNS TABLE (status text, count bigint, revenue numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
    IF NOT public.is_staff_or_service() THEN
        RAISE EXCEPTION 'forbidden: staff role required'
            USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT * FROM public.get_orders_by_status();
END;
$fn$;

COMMENT ON FUNCTION public.staff_get_orders_by_status() IS
    'Staff-guarded revenue-by-status. The unguarded get_orders_by_status was '
    'proven anon-readable in production on 2026-07-28.';

-- ---------------------------------------------------------------------
-- 3. Apply the intended grants, skipping anything absent
-- ---------------------------------------------------------------------
-- FIRST strip whatever the newly created wrappers inherited from Supabase's
-- default privileges. They are created above, i.e. AFTER the blanket revoke
-- in section 1, so they arrive world-executable unless explicitly stripped.
-- Verified necessary: without this, an anonymous caller could invoke
-- staff_transition_order_status on staging.
DO $do$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('public.is_staff_or_service()'),
            ('public.staff_transition_order_status(integer, character varying, text, jsonb)'),
            ('public.staff_create_new_order(jsonb)'),
            ('public.staff_get_dashboard_summary(date)'),
            ('public.staff_get_orders_by_status()')
        ) AS t(sig)
    LOOP
        IF to_regprocedure(r.sig) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
        END IF;
    END LOOP;
END
$do$;

DO $do$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            -- ---- Genuine public/customer surface (anon + authenticated) ----
            -- Reached by customers who are NOT logged in. Each is either
            -- internally validated (create_pending_order enforces the kill
            -- switch, capacity, lead time, holidays and server-side pricing)
            -- or returns only non-sensitive/masked data.
            ('public.create_pending_order(jsonb)',               'anon, authenticated'),
            ('public.get_public_order(text)',                    'anon, authenticated'),
            ('public.get_pending_order(uuid)',                   'anon, authenticated'),
            ('public.track_analytics_event(text, jsonb)',        'anon, authenticated'),
            ('public.get_cancellation_policy(integer)',          'anon, authenticated'),
            ('public.calculate_refund_amount(numeric, integer)', 'anon, authenticated'),
            ('public.find_delivery_zone(text)',                  'anon, authenticated'),
            ('public.get_available_dates(integer)',              'anon, authenticated'),

            -- ---- Staff surface (guard is inside the function) ----
            ('public.is_staff_or_service()',                                                  'authenticated'),
            ('public.staff_transition_order_status(integer, character varying, text, jsonb)', 'authenticated'),
            ('public.staff_create_new_order(jsonb)',                                          'authenticated'),
            ('public.staff_get_dashboard_summary(date)',                                      'authenticated'),
            ('public.staff_get_orders_by_status()',                                           'authenticated'),
            -- SECURITY INVOKER, so the ingredients RLS policy (staff-only)
            -- already constrains it.
            ('public.get_low_stock_ingredients()',                                            'authenticated')
        ) AS t(sig, roles)
    LOOP
        IF to_regprocedure(r.sig) IS NOT NULL THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', r.sig, r.roles);
            RAISE NOTICE 'granted % to %', r.sig, r.roles;
        ELSE
            RAISE NOTICE 'skipped (absent in this environment): %', r.sig;
        END IF;
    END LOOP;
END
$do$;

-- ---------------------------------------------------------------------
-- 4. Explicitly re-revoke the money-path and maintenance functions
-- ---------------------------------------------------------------------
-- Already covered by the blanket revoke in section 1; restated here for
-- documentation value and to survive any future blanket GRANT.
--   promote_pending_order, mark_pending_order_failed  -> Stripe webhook only
--   prune_expired_pending_orders, cleanup_*           -> pg_cron only
--   check_order_lookup_rate_limit                     -> called inside get_public_order
--   _random_order_number_token                        -> internal helper
--   transition_order_status, create_new_order,
--   get_dashboard_summary, get_orders_by_status       -> now via staff_* wrappers
DO $do$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('public.promote_pending_order(uuid, text, text)'),
            ('public.mark_pending_order_failed(uuid, text, text, text)'),
            ('public.prune_expired_pending_orders()'),
            ('public.cleanup_order_lookup_rate_limits()'),
            ('public.cleanup_old_lookup_attempts()'),
            ('public.check_order_lookup_rate_limit(text)'),
            ('public._random_order_number_token(integer)'),
            ('public.transition_order_status(integer, character varying, uuid, text, jsonb)'),
            ('public.create_new_order(jsonb)'),
            ('public.get_dashboard_summary(date)'),
            ('public.get_orders_by_status()')
        ) AS t(sig)
    LOOP
        IF to_regprocedure(r.sig) IS NOT NULL THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
        END IF;
    END LOOP;
END
$do$;

COMMIT;

-- =====================================================================
-- VERIFY (expect anon_exec = false for every row)
-- =====================================================================
-- SELECT p.proname,
--        has_function_privilege('anon', p.oid, 'EXECUTE')          AS anon_exec,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec
--   FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('transition_order_status','create_new_order',
--                      'get_orders_by_status','get_dashboard_summary',
--                      'promote_pending_order','mark_pending_order_failed')
--  ORDER BY 1;
--
-- =====================================================================
-- ROLLBACK (restores the previous, INSECURE state)
-- =====================================================================
-- BEGIN;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
--   DROP FUNCTION IF EXISTS public.staff_transition_order_status(integer, character varying, text, jsonb);
--   DROP FUNCTION IF EXISTS public.staff_create_new_order(jsonb);
--   DROP FUNCTION IF EXISTS public.staff_get_dashboard_summary(date);
--   DROP FUNCTION IF EXISTS public.staff_get_orders_by_status();
--   DROP FUNCTION IF EXISTS public.is_staff_or_service();
-- COMMIT;
-- NOTE: the frontend must be reverted in the same step, because it calls
-- the staff_* wrappers. Rolling back only the database will break the
-- Front Desk and Owner Dashboard.
-- =====================================================================
