-- =====================================================================
-- Re-authenticate the daily-sales-report cron job
-- =====================================================================
-- The `send-daily-report` Edge Function previously accepted ANY header
-- beginning with "Bearer ", so the literal string "Bearer SERVICE_ROLE_KEY"
-- passed authentication. That is exactly what the daily-sales-report
-- pg_cron job sends — the placeholder was never substituted when the job
-- was created. Since the function's HTTP response body contains aggregate
-- revenue, order counts and average order value, that weak check let
-- anyone who could reach the URL read the bakery's financials and trigger
-- a report email to the owner.
--
-- The function now requires a valid `x-cron-secret`, a real service-role
-- key, or a signed-in owner/baker. This migration reschedules the job to
-- present the shared cron secret, matching the pattern already used by
-- the review-sweeps job (20260728T170000).
--
-- !! APPLY-TIME SUBSTITUTION REQUIRED !!
-- Replace __PROJECT_URL__ and __CRON_SECRET__ before running. Do NOT
-- commit the substituted version — CRON_SECRET is already set as a
-- Supabase Edge Function secret and must not enter git.
--   __PROJECT_URL__  e.g. https://<project-ref>.supabase.co
--   __CRON_SECRET__  the value of the CRON_SECRET function secret
--
-- MUST BE APPLIED TOGETHER WITH the send-daily-report function deploy.
-- Applying the function without this migration silently breaks the daily
-- report (the job will start receiving 401s); applying this without the
-- function deploy is harmless.
-- =====================================================================

BEGIN;

-- Remove the old job (name-based; ignores absence).
SELECT cron.unschedule('daily-sales-report')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-sales-report');

-- Recreate it with header-based authentication. Same 13:00 UTC schedule.
SELECT cron.schedule(
    'daily-sales-report',
    '0 13 * * *',
    $job$
    SELECT net.http_post(
        url     := '__PROJECT_URL__/functions/v1/send-daily-report',
        headers := '{"Content-Type": "application/json", "x-cron-secret": "__CRON_SECRET__"}'::jsonb,
        body    := '{"datePreset": "yesterday"}'::jsonb
    );
    $job$
);

COMMIT;

-- =====================================================================
-- VERIFY (should show uses_cron_secret = true, has_literal_placeholder = false)
-- =====================================================================
-- SELECT jobname,
--        (command LIKE '%x-cron-secret%')      AS uses_cron_secret,
--        (command LIKE '%SERVICE_ROLE_KEY%')   AS has_literal_placeholder,
--        (command LIKE '%__CRON_SECRET__%')    AS unsubstituted_placeholder
--   FROM cron.job WHERE jobname = 'daily-sales-report';
--
-- ROLLBACK: re-run the previous definition from
-- supabase/migrations/20240205_cron_schedule_reports.sql, and redeploy the
-- previous send-daily-report (which accepted any bearer token).
-- =====================================================================
