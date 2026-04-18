-- =====================================================
-- Dashboard Performance Migration
-- =====================================================
-- Root-cause fixes for slow Owner Dashboard + Front Desk:
--   1. Wrap auth.uid() in a subquery inside every RLS policy so Postgres
--      caches it once per query instead of re-evaluating per row.
--   2. Add indexes to support the admin RLS EXISTS() subquery and the
--      hot columns the dashboard sorts/filters on.
--   3. Add the missing get_orders_by_status RPC + v_popular_items view +
--      get_low_stock_ingredients RPC that the frontend expects.
--
-- Safe to run multiple times: every policy is DROP IF EXISTS / CREATE,
-- and every function/index uses IF NOT EXISTS or OR REPLACE.
-- =====================================================


-- =====================================================
-- 1. RLS policy rewrites — auth.uid() → (SELECT auth.uid())
-- =====================================================
-- Same names, same semantics. Only change: auth.uid() is wrapped in a
-- subquery so Postgres evaluates it once per query instead of per row.
-- This is a documented Supabase pattern worth 10-100x speedup on large
-- result sets (see supabase.com/docs/guides/database/postgres/row-level-security#call-auth-uid-once).

-- 1a. Orders (from 20260211_rls_hardening.sql)
DROP POLICY IF EXISTS "Admins manage everything" ON public.orders;
CREATE POLICY "Admins manage everything" ON public.orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = (SELECT auth.uid())
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

-- 1b. Recipe tables (from 20260211_rls_hardening.sql)
DROP POLICY IF EXISTS "Only admins view recipes" ON public.product_recipes;
CREATE POLICY "Only admins view recipes" ON public.product_recipes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = (SELECT auth.uid())
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

DROP POLICY IF EXISTS "Only admins view component recipes" ON public.order_component_recipes;
CREATE POLICY "Only admins view component recipes" ON public.order_component_recipes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = (SELECT auth.uid())
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

-- 1c. Ingredient usage (from 20260211_rls_hardening.sql)
DROP POLICY IF EXISTS "Staff can log usage" ON public.ingredient_usage;
CREATE POLICY "Staff can log usage" ON public.ingredient_usage
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = (SELECT auth.uid())
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

-- 1d. Audit logs (from 20260211_audit_logs_system.sql)
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = (SELECT auth.uid())
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

-- 1e. Analytics events (from 20260206_analytics_events.sql)
-- NOTE: original policy includes 'admin' role alongside 'owner'/'baker'.
DROP POLICY IF EXISTS "Staff can read analytics" ON public.analytics_events;
CREATE POLICY "Staff can read analytics" ON public.analytics_events
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_id = (SELECT auth.uid())
            AND role IN ('owner', 'baker', 'admin')
        )
    );

-- 1f. CMS tables (from 20260402_cms_rls_policies.sql)
-- Public read policies don't call auth.uid() — skip them.
DROP POLICY IF EXISTS "Owner can manage business settings" ON public.business_settings;
CREATE POLICY "Owner can manage business settings" ON public.business_settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = (SELECT auth.uid()) AND role = 'owner')
    );

DROP POLICY IF EXISTS "Owner can manage gallery items" ON public.gallery_items;
CREATE POLICY "Owner can manage gallery items" ON public.gallery_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = (SELECT auth.uid()) AND role = 'owner')
    );

DROP POLICY IF EXISTS "Owner can manage faqs" ON public.faqs;
CREATE POLICY "Owner can manage faqs" ON public.faqs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = (SELECT auth.uid()) AND role = 'owner')
    );

DROP POLICY IF EXISTS "Admins can manage business hours" ON public.business_hours;
CREATE POLICY "Admins can manage business hours" ON public.business_hours
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = (SELECT auth.uid()) AND role IN ('owner', 'baker'))
    );

DROP POLICY IF EXISTS "Owner can manage announcements" ON public.announcements;
CREATE POLICY "Owner can manage announcements" ON public.announcements
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = (SELECT auth.uid()) AND role = 'owner')
    );


-- =====================================================
-- 2. Indexes for dashboard hot paths
-- =====================================================

-- Composite index so the admin RLS EXISTS() subquery can filter on
-- (user_id, role) instead of scanning every row in user_profiles.
CREATE INDEX IF NOT EXISTS idx_user_profiles_user_id_role
    ON public.user_profiles (user_id, role);

-- Hot columns on orders used by every dashboard query
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc
    ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON public.orders (status);

CREATE INDEX IF NOT EXISTS idx_orders_date_needed
    ON public.orders (date_needed);


-- =====================================================
-- 3. RPCs and views expected by the frontend
-- =====================================================

-- 3a. Single-round-trip replacement for getOrdersByStatus()'s JS grouping.
CREATE OR REPLACE FUNCTION public.get_orders_by_status()
RETURNS TABLE (status text, count bigint, revenue numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        COALESCE(status, 'unknown')::text AS status,
        COUNT(*)::bigint                  AS count,
        COALESCE(SUM(total_amount), 0)    AS revenue
    FROM orders
    GROUP BY status
$$;

GRANT EXECUTE ON FUNCTION public.get_orders_by_status() TO authenticated;

-- 3b. Popular-items view — sizes only for now. Frontend already handles the
-- 'size' | 'filling' | 'theme' shape, so this can be unioned later without
-- client changes.
CREATE OR REPLACE VIEW public.v_popular_items AS
SELECT
    'size'::text                     AS item_type,
    cake_size                        AS item_name,
    COUNT(*)::bigint                 AS order_count,
    COALESCE(SUM(total_amount), 0)   AS total_revenue
FROM orders
WHERE cake_size IS NOT NULL
GROUP BY cake_size
ORDER BY order_count DESC
LIMIT 10;

GRANT SELECT ON public.v_popular_items TO authenticated;

-- 3c. DB-side low-stock filter so getLowStockItems() stops pulling the full
-- ingredients table into JS and filtering there.
CREATE OR REPLACE FUNCTION public.get_low_stock_ingredients()
RETURNS SETOF public.ingredients
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT *
    FROM ingredients
    WHERE quantity <= low_stock_threshold
    ORDER BY name
$$;

GRANT EXECUTE ON FUNCTION public.get_low_stock_ingredients() TO authenticated;
