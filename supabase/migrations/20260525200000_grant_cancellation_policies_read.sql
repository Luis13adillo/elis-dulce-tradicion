-- Make the two read-only cancellation-policy RPCs callable by anon /
-- authenticated callers (used by the customer-facing CancelOrderModal).
--
-- Why GRANT alone isn't enough: cancellation_policies has an "Admins can
-- manage" RLS policy (FOR ALL) that runs EXISTS(SELECT FROM user_profiles
-- ...) on every SELECT. Anon can't read user_profiles, so that subquery
-- aborts the whole SELECT even though the parallel "Anyone can view active"
-- policy would allow it. Marking the read-only RPCs as SECURITY DEFINER
-- lets them bypass RLS on cancellation_policies — safe because they only
-- return non-sensitive refund tier data customers should see anyway.

BEGIN;
GRANT SELECT ON public.cancellation_policies TO anon, authenticated;
ALTER FUNCTION public.get_cancellation_policy(integer) SECURITY DEFINER;
ALTER FUNCTION public.calculate_refund_amount(numeric, integer) SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.get_cancellation_policy(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_refund_amount(numeric, integer) TO anon, authenticated;
COMMIT;
