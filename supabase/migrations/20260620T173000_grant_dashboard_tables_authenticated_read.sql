-- Grant SELECT to `authenticated` on the staff-dashboard tables.
--
-- Production (bebmkekmzcrgeraeakmp) was set up missing role-level SELECT grants
-- for `anon`/`authenticated` on most tables. PostgREST checks the table GRANT
-- before RLS, so logged-in owner/baker reads of these tables failed with
-- "42501: permission denied" (HTTP 403) before RLS could run. This blocked the
-- owner/front-desk order list, order detail/history/notes, issue management,
-- inventory, recipes, response templates, and delivery management.
--
-- Each table below already has RLS ENABLED with policies that scope access by
-- role (owner/baker see staff data; customers see only their own orders or
-- public catalog rows). This grant only opens the door that RLS then filters.
-- No write privileges are granted. `anon` is intentionally NOT granted here;
-- the tables that are meant to be publicly readable already expose what they
-- need through their own (separately granted) public read paths.
--
-- Verified before applying (all RLS-enabled, policies confirmed appropriate):
--   orders                  staff: all rows; customer: user_id = auth.uid()
--   order_status_history    admins: all; customer: own orders' history
--   order_notes             staff-only read
--   order_issues            staff-only read
--   products                public catalog (qual=true)
--   ingredients             staff-only (admins manage inventory)
--   ingredient_usage        staff-only read
--   order_component_recipes staff-only read
--   response_templates      staff-only read
--   delivery_zones          public: active zones; staff: manage all
--
-- DELIBERATELY EXCLUDED: public.v_popular_items. It is a VIEW (no RLS) and runs
-- as a SECURITY DEFINER view (reloptions has no security_invoker), so granting
-- it to `authenticated` would expose aggregate order/revenue data to ANY
-- logged-in user, including customers. Held back for a separate decision
-- (make it security_invoker, or staff-gate it). The dashboard already tolerates
-- this view being absent.

BEGIN;

GRANT SELECT ON public.orders                  TO authenticated;
GRANT SELECT ON public.order_status_history    TO authenticated;
GRANT SELECT ON public.order_notes             TO authenticated;
GRANT SELECT ON public.order_issues            TO authenticated;
GRANT SELECT ON public.products                TO authenticated;
GRANT SELECT ON public.ingredients             TO authenticated;
GRANT SELECT ON public.ingredient_usage        TO authenticated;
GRANT SELECT ON public.order_component_recipes TO authenticated;
GRANT SELECT ON public.response_templates      TO authenticated;
GRANT SELECT ON public.delivery_zones          TO authenticated;

COMMIT;
