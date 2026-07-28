-- ============================================================================
-- Image review workflow — review-sweeps cron (Phase 2)
-- ============================================================================
-- Schedules the hourly review-sweeps Edge Function call (payment-link
-- reminders + stuck-review safety net) via pg_cron + pg_net.
--
-- ⚠️  APPLY WITH SUBSTITUTION — this file is committed with placeholders and
--     must NOT be applied verbatim:
--       __PROJECT_URL__   → the target project URL, e.g.
--                           https://<project-ref>.supabase.co
--       __CRON_SECRET__   → the value of the CRON_SECRET function secret
--     (Same precedent as backend/scripts/setup-cron.js, which interpolates
--     env values into the job command. Secrets never live in git.)
--
-- The function itself rejects requests whose x-cron-secret doesn't match its
-- CRON_SECRET env — the Authorization header is not used for auth.
-- ============================================================================

DO $$
BEGIN
    PERFORM cron.unschedule('review-sweeps');
EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist yet
END $$;

SELECT cron.schedule(
    'review-sweeps',
    '20 * * * *',
    $$
    SELECT net.http_post(
        url := '__PROJECT_URL__/functions/v1/review-sweeps',
        headers := '{"Content-Type": "application/json", "x-cron-secret": "__CRON_SECRET__"}'::jsonb,
        body := '{}'::jsonb
    ) AS request_id;
    $$
);
