-- Grant SELECT on menu + business-settings tables to anon / authenticated.
--
-- Production (bebmkekmzcrgeraeakmp) was missing role-level SELECT on these
-- tables, so the order form failed with "permission denied for table
-- cake_sizes" before any RLS evaluation could run. RLS policies already
-- exist on every table (active=true on menu tables, true on business_*
-- tables); SELECT for anon/authenticated only opens the door that RLS then
-- filters. No write privileges are granted.
--
-- Dev (rnszrscxwkdwvvlsihqc) already has these grants (and many more) — this
-- migration is a no-op there but kept in source for env reproducibility.

BEGIN;

GRANT SELECT ON public.cake_sizes                TO anon, authenticated;
GRANT SELECT ON public.cake_fillings             TO anon, authenticated;
GRANT SELECT ON public.bread_types               TO anon, authenticated;
GRANT SELECT ON public.premium_filling_upcharges TO anon, authenticated;
GRANT SELECT ON public.business_settings         TO anon, authenticated;
GRANT SELECT ON public.business_hours            TO anon, authenticated;
GRANT SELECT ON public.holiday_closures          TO anon, authenticated;

COMMIT;
