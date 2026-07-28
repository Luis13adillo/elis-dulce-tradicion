-- Grant SELECT on user_profiles to the `authenticated` role.
--
-- Production (bebmkekmzcrgeraeakmp) was missing the role-level SELECT grant on
-- public.user_profiles for `authenticated`. PostgREST checks the table GRANT
-- before RLS, so every logged-in user's own-profile read failed with
-- "42501: permission denied for table user_profiles" (HTTP 403) before the
-- (correct) RLS policy `Users can view own profile` (auth.uid() = user_id)
-- could run. AuthContext then showed "We couldn't load your profile. Please
-- try again." and signed the user out — blocking owner and baker login.
--
-- This restores only the missing SELECT grant. RLS still scopes each user to
-- their own row. No write privileges are granted; `anon` is intentionally NOT
-- granted (only authenticated users read their own profile, and RLS requires
-- auth.uid() = user_id, which anon never satisfies).
--
-- Scope: user_profiles only. Sibling tables in the same grant-gap are left
-- untouched per the approved fix scope.

BEGIN;

GRANT SELECT ON public.user_profiles TO authenticated;

COMMIT;
