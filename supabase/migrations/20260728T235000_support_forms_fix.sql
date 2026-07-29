-- =====================================================================
-- Support forms fix — contact form + report-a-problem (2026-07-28)
-- =====================================================================
-- Investigation findings this migration answers:
--
--   * contact_submissions and order_issues carry RLS policies from the
--     original design ("Anyone can submit ...") but the anon/authenticated
--     table GRANTs never made it onto the NEW production project during the
--     April cutover. Every customer submission has failed with 42501 since
--     launch (both tables held 0 rows on prod on 2026-07-28), and staff
--     could not read contact_submissions or update order_issues.
--
--   * Submissions now go through the submit-contact / submit-order-issue
--     Edge Functions, which validate, rate-limit, authorize and insert with
--     the service role. The browser never writes these tables directly
--     again, so the public INSERT policies are dropped rather than
--     "fixed" — granting anon INSERT+SELECT would have let anyone read
--     every submission (PostgREST INSERT ... RETURNING needs SELECT).
--
--   * Idempotency: both tables get a client-generated token with a unique
--     index so a retried submission (double click, flaky network, browser
--     retry) lands exactly one row.
--
--   * Rate limiting used to run client-side against contact_rate_limits
--     with a hardcoded ip of 'unknown' — trivially bypassed and, had the
--     grants existed, one shared bucket would have throttled every
--     legitimate customer at once. Replaced by bump_submission_rate(),
--     called by the Edge Functions with the real client IP.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Staff dashboard access. RLS policies already restrict rows to
--    owner/baker; these grants were simply missing on prod.
-- ---------------------------------------------------------------------
GRANT SELECT, UPDATE ON public.contact_submissions TO authenticated;
GRANT SELECT, UPDATE ON public.order_issues TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Idempotency tokens for retry-safe submissions
-- ---------------------------------------------------------------------
ALTER TABLE public.contact_submissions
  ADD COLUMN IF NOT EXISTS client_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS contact_submissions_client_token_key
  ON public.contact_submissions (client_token)
  WHERE client_token IS NOT NULL;

ALTER TABLE public.order_issues
  ADD COLUMN IF NOT EXISTS client_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS order_issues_client_token_key
  ON public.order_issues (client_token)
  WHERE client_token IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3) Retire the direct-from-browser write path
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can submit contact form" ON public.contact_submissions;
DROP POLICY IF EXISTS "Anyone can submit order issues" ON public.order_issues;
DROP POLICY IF EXISTS "Allow rate limit operations" ON public.contact_rate_limits;

-- ---------------------------------------------------------------------
-- 4) Server-side rate limiting for public submission endpoints.
--    Only the service role (Edge Functions) touches this table — RLS on
--    with zero policies locks out everything else.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.submission_rate_limits (
  scope text NOT NULL,
  key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  submission_count integer NOT NULL DEFAULT 1,
  PRIMARY KEY (scope, key)
);
ALTER TABLE public.submission_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.submission_rate_limits FROM PUBLIC, anon, authenticated;

-- Atomic sliding-window counter: one upsert either starts a fresh window
-- or increments the current one, and reports whether the caller is still
-- under the limit. Safe under concurrent calls (single-statement upsert).
CREATE OR REPLACE FUNCTION public.bump_submission_rate(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_allowed boolean;
BEGIN
  INSERT INTO public.submission_rate_limits AS r (scope, key, window_start, submission_count)
  VALUES (p_scope, p_key, now(), 1)
  ON CONFLICT (scope, key) DO UPDATE SET
    submission_count = CASE
      WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN 1
      ELSE r.submission_count + 1
    END,
    window_start = CASE
      WHEN r.window_start < now() - make_interval(secs => p_window_seconds) THEN now()
      ELSE r.window_start
    END
  RETURNING r.submission_count <= p_limit INTO v_allowed;

  RETURN v_allowed;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC on new functions by default; this
-- counter is service-role-only (see prod-rpc-public-execute audit).
REVOKE EXECUTE ON FUNCTION public.bump_submission_rate(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
