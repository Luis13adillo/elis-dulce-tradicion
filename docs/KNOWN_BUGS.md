# KNOWN_BUGS.md

Open issues, unfinished work, and dead code — backed by evidence from the code,
`CLAUDE.md`, the `.planning/` artifacts, and the repo's QA docs. Verified on
2026-06-15. Items without evidence are marked UNKNOWN rather than guessed.

## Online ordering — RE-ENABLED (2026-06-16)

Online ordering is live again after the Stripe webhook reliability fix.

- **Code:** [src/App.tsx](../src/App.tsx) imports `./pages/Order` for `/order`
  (the 5-step wizard), not `OrderMaintenance`.
- **Webhook fix deployed to prod** (Edge Function `stripe-webhook` v5 + migration
  `20260615T120000_webhook_event_processing_status.sql`).
- **Pre-deploy production audit was clean** (0 orphan paid events, 0 stranded
  pendings) — `supabase/audits/20260615_webhook_orphan_paid_audit.sql`.
- **Stripe LIVE endpoint verified:** correct URL, the 4 subscribed events,
  endpoint enabled.
- **Staging end-to-end test passed** (Stripe TEST mode, project
  `elis-dulce-tradicion-staging`): pending → PaymentIntent → webhook → promote →
  `orders` row → event `processed`; duplicate delivery skipped; and the
  retry/dedup regression proven fixed (an event forced to `failed` was
  reprocessed on retry, not dropped, with no duplicate order/email).
- **Production was untouched** during the staging test.
- **Emergency control retained:** the DB kill switch
  `business_settings.online_orders_paused` still exists. Setting it `true` makes
  `create_pending_order` raise and halts new online orders server-side without a
  redeploy. (Migration `20260428T160000_pause_online_orders_kill_switch.sql`.)
- **Note:** re-enabling required both the frontend import swap AND
  `online_orders_paused = false` in prod. The frontend swap ships in the
  re-enable PR; the kill-switch flip is a separate prod DB action.

### Historical bug — webhook dedup could permanently drop a paid order (FIXED + deployed + tested)
- **The bug:** `supabase/functions/stripe-webhook/index.ts` inserted the Stripe
  `event_id` into `stripe_webhook_events` **before** processing. That insert is its
  own committed transaction. If processing then threw (transient DB error, lock
  timeout, `promote_pending_order` raising), the handler returned 500 so Stripe
  retried — but the dedup row was already committed, so the retry hit the
  unique-key violation and short-circuited as a "duplicate." The event was
  **never reprocessed**: customer charged, no order, no confirmation email. Likely
  root cause of the "orders not falling into the system" reports.
- **The fix (deployed):** the dedup row carries a processing status
  (`received|processing|processed|failed`). A duplicate is only a no-op once a
  prior attempt reached `processed`; a row left `processing`/`failed` is
  reprocessed on Stripe's retry. `promote_pending_order` is idempotent (row lock,
  `already_promoted`, `ON CONFLICT (idempotency_key)`), so reprocessing never
  double-creates an order or double-sends email. Decision logic in `dedup.ts`
  with `dedup.test.ts`. Merged (PR #2), migrated + function-deployed to prod, and
  proven end-to-end in staging (incl. the failure-then-retry regression).
- **Related, still open (lower severity):** confirmation-email sends are
  best-effort — `invokeFunction()` swallows errors, so if Resend is down the order
  still lands but the email is silently lost with no retry. A durable per-order
  `confirmation_email_sent` flag would be the right fix; left for a separate
  change.

## Open hardening items (from CLAUDE.md)

Non-blocking; the site is live.
1. **Recipe management UI** — DB tables (`product_recipes`,
   `order_component_recipes`) exist; no CRUD component built. Deferred
   (inventory tracking not actively used).
2. **Backend Sentry / structured logging** — frontend Sentry is wired; the
   Express backend has none. (Lower impact since the backend is largely
   undeployed.)
3. **`.env.example` files** — addressed by
   [.env.local.example](../.env.local.example) added with this docs pass.

## Code hygiene / incomplete features (from IMPROVEMENTS_NEEDED.md, QA_AUDIT_REPORT.md)

These are documented in the repo's own audit notes. Re-verify against current
code before acting — some may have been partially addressed since the audits.

- **Newsletter signup is a mock.** `src/components/newsletter/NewsletterSignup.tsx`
  uses `setTimeout` to fake an API call; signups are not persisted. (The backend
  `newsletter.js` route exists but is **not mounted**, so even the backend path
  is unreachable.)
- **CMS integration partial (~40%).** FAQ page reads from CMS; Gallery, About,
  Homepage, and Footer still use **hardcoded** content despite CMS tables
  existing. Owner cannot fully manage site content.
- **Console statements in production code** — the audit counted 140+ `console.*`
  across many files. Some cleanup has happened (OwnerDashboard, FrontDesk,
  useOrdersFeed per `.planning/STATE.md`); a full sweep is not confirmed.
- **Type safety** — many `any` types / `eslint-disable` (e.g. `Order.tsx` has a
  file-level `no-explicit-any` disable).
- **Legal pages missing real contact info** — TODO comments remain in
  `TermsOfService.tsx`, `PrivacyPolicy.tsx`, `CookiePolicy.tsx`,
  `RefundPolicy.tsx`.
- **NotFound uses `<a href>` instead of `<Link>`** — full reload on 404 nav.
  Reported as "fixing" in the audit; verify current state.

## Active code TODO/FIXME markers

A grep for TODO/FIXME/HACK/XXX in `src/`, `backend/`, `supabase/` found very few
meaningful hits — the code is clean of active markers. The only ones are in
utility/seed scripts (not production code):
- `backend/migrations/006_secure_production.sql` — "remove temporary debug
  access" (archival).
- `backend/scripts/seed-admin-users.js` — "temporary passwords for initial
  setup" (expected for a seed script).
- `backend/scripts/check-recent-activity.js` — "hardcoded for temporary
  verification script."

## Dead / duplicate code

- **Square payments — DEAD.** `CLAUDE.md`: "Square code exists but is dead code
  — do not use it." Files: `src/components/payment/SquarePaymentForm.tsx`,
  `src/test/mocks/square.ts`, plus `SQUARE_*` env references in
  `backend/sqlite-server.js` / `backend/routes/webhooks.js`. Stripe is the live
  provider; Square code does not execute. Scheduled for removal but not yet done.
- **SQLite backend variants — not prod.** `backend/sqlite-server.js`,
  `backend/mock-server.js`, `backend/orders-sqlite.js`,
  `backend/payments-sqlite.js`. `backend/server.js` is the (largely undeployed)
  Supabase-backed server.
- **Unmounted route:** `backend/routes/newsletter.js` is never `app.use()`-d.
- **Express backend itself** is largely undeployed (frontend uses Supabase +
  Edge Functions). Not "dead" but not the live path — see
  [docs/ARCHITECTURE.md](ARCHITECTURE.md).

## Phase 10 (post-launch polish) — needs human verification

`.planning/phases/10-post-launch-polish/10-VERIFICATION.md` marks the code
complete but flags steps that cannot be auto-verified:
- Run `npm run test` locally and confirm 0 failures.
- Validate SEO structured data via Google Rich Results.
- Configure GitHub Actions CI secrets (`VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`,
  `VITE_GOOGLE_MAPS_API_KEY`, test owner creds).
- Manually test MFA enrollment (real authenticator app) and the dashboard
  session-timeout modal.

## Testing reality

- Unit tests exist (`src/__tests__/pricing.test.ts`,
  `src/__tests__/orderStateMachine.test.ts`) plus Playwright e2e specs with
  mocked APIs.
- Per project memory, the older e2e specs were stale scaffolds (wrong
  routes/credentials). Always `npm run build` before pushing to catch TS errors.

## Items flagged UNKNOWN

- Whether the Express backend is deployed anywhere in production (evidence: no).
- Exact schema of `delivery_zones`, `delivery_assignments`, `delivery_tracking`,
  `holiday_closures`, `error_logs`, `contact_submissions`, `failed_payments`,
  and the `products` table (no readable `CREATE TABLE`).
- Whether `VITE_DASHBOARD_PIN` (referenced in `ENV_EXAMPLE_PRODUCTION`) is still
  used — no usage found in current `src/`.
- The exact business rule inside `scheduled-order-transitions`.
