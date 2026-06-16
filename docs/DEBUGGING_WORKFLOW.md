# DEBUGGING_WORKFLOW.md

How to investigate a problem in this system without breaking production.
Verified on 2026-06-15. Read [docs/AI_CONTEXT.md](AI_CONTEXT.md) for the hard
rules first.

## Ground rules

- **Read-only against production.** Diagnose with read-only SQL and code reading.
  Never write to the production DB without explicit approval. Customer order and
  payment data is revenue-critical.
- **Confirm which Supabase project you are on.** NEW `bebmkekmzcrgeraeakmp` =
  production. OLD `rnszrscxwkdwvvlsihqc` = testing. The Supabase MCP tools and
  the `elis-bulletproof-*` skills point at OLD by default. Wrong project = wrong
  conclusions.
- **Stripe is live.** When debugging real orders, check the Stripe dashboard in
  **Live mode** (account `CBUpHY3Zt3`). Local `.env` uses `pk_test_` keys.
- There are dedicated `elis-bulletproof-*` skills (orders, payments, frontdesk,
  dashboard, emails, auth, inventory). Use the one matching the symptom — they
  encode the exact tables/files/RPCs and run read-only.

## First moves by symptom

### "Customers can't place an order"
Expected right now — **ordering is intentionally paused.** `/order` renders
`OrderMaintenance` ([src/App.tsx](../src/App.tsx) line 30) and
`business_settings.online_orders_paused = true`. This is the open Stripe-webhook
issue, not a regression. Don't "fix" it by flipping the switch without verifying
the webhook end-to-end. Skill: `elis-bulletproof-orders`.

### "Customer paid but no order appeared"
This is the Tier A webhook path. Trace in order:
1. `pending_orders` row exists with the `payment_intent_id`? (`get_pending_order`)
2. Stripe (Live mode): did `payment_intent.succeeded` fire? Did the webhook
   deliver (Stripe → Webhooks → delivery attempts)?
3. `stripe_webhook_events` has the event id, and what is its `status`?
   `processed` = handled; `processing`/`failed` = a prior attempt died mid-flight
   (check `last_error`) and the next Stripe retry will reprocess it. A row stuck
   at `processing`/`failed` with no `orders` row is the smoking gun for the dedup
   bug described in [docs/KNOWN_BUGS.md](KNOWN_BUGS.md) (fixed in branch
   `fix/stripe-webhook-promotion-reliability`).
4. Did `promote_pending_order` run / is there an `orders` row with that
   `pending_order_id`?
5. Edge Function logs for `stripe-webhook`.

**Dedup-poisoning failure mode (historical, pre-fix):** the webhook recorded the
event id *before* processing. If promotion then failed, Stripe's retry was
dropped as a "duplicate" and the paid order was never created. The fix tracks a
processing status on `stripe_webhook_events` so only fully-`processed` events
short-circuit. If you see a charge in Stripe (Live) with `succeeded` but no
`orders` row and a `stripe_webhook_events` row, confirm its `status` — and
whether the fix is deployed (`supabase functions deploy stripe-webhook` +
migration `20260615T120000_webhook_event_processing_status.sql`).
Skill: `elis-bulletproof-payments`.

### "Order stuck / wrong status"
- Status transitions go through RPC `transition_order_status`, which **rejects
  illegal transitions**. A "stuck" order may be hitting a state-machine
  rejection. Check the allowed transitions in
  [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) and `order_status_history` for the
  attempted/last change.
- Frontend mirror: [src/lib/orderStateMachine.ts](../src/lib/orderStateMachine.ts).
Skill: `elis-bulletproof-frontdesk`.

### "New orders don't show at the kitchen / live updates broken"
Realtime path: `useOrdersFeed` → `useRealtimeOrders` → Supabase
`postgres_changes` on `orders`. Check: realtime enabled on the `orders` table,
the channel subscription connecting, browser console for reconnect/backoff logs.
Skill: `elis-bulletproof-frontdesk`.

### "Confirmation/status email didn't send"
Emails are Edge Functions (`send-*`) using Resend, triggered by the
`stripe-webhook` function or the `on_order_status_change` DB trigger
(`handle_status_notification` → `net.http_post`). Check: Edge Function logs,
`RESEND_API_KEY` secret set, the DB trigger fired. The frontend no longer sends
confirmation emails (webhook is the sole sender — avoid reintroducing
duplicates). Skill: `elis-bulletproof-emails`.

### "Login redirect loop / dashboard kicks me out"
Almost always the auth race. Re-read the auth lessons in
[docs/ARCHITECTURE.md](ARCHITECTURE.md#auth): no premature safety timeouts, no
duplicated `ProtectedRoute` checks inside dashboards, redirect to `/login` (not
`/`) when role is undefined. Check `user_profiles` has a row with the right role
for the account. Skill: `elis-bulletproof-auth`.

### "Refund didn't process"
`order-cancel` Edge Function → `stripe.refunds.create()` (idempotent), writes
`refunds` + order refund fields. Refund % from `cancellation_policies` via
`get_cancellation_policy`. Check Edge Function logs + Stripe Live dashboard.

## Tools

- **Frontend errors:** Sentry (frontend DSN wired). **Backend Sentry is NOT
  wired** — backend errors are not centrally captured (see
  [docs/KNOWN_BUGS.md](KNOWN_BUGS.md)).
- **Edge Function logs:** Supabase dashboard → Edge Functions → logs, or the
  Supabase MCP `get_logs` tool (mind the OLD/NEW project caveat).
- **DB advisors:** Supabase MCP `get_advisors` for security/perf lints.
- **Local repro:** `npm run dev` (port 5178). Build first to catch TS errors:
  `npm run build`. Tests: `npm run test` (Vitest), `npm run test:e2e`
  (Playwright). Lint: `npm run lint`.

## Local repo gotcha (iCloud)

The repo lives in `~/Desktop` which is iCloud-synced. iCloud evicts
`.git/objects` to the cloud and `cp`/`git push`/`git gc` can fail with
`Operation timed out` / `mmap` errors. Use `ditto` instead of `cp`. See the
project memory note `icloud_desktop_pitfall.md`.

## Reproduce-before-fix checklist

1. Confirm the symptom and which environment (prod NEW vs test OLD, Live vs Test
   Stripe).
2. Identify the layer: frontend (React) / Supabase RPC / Edge Function / DB
   trigger / (rarely) Express backend.
3. Read the relevant code + logs; form one hypothesis.
4. Reproduce locally if possible (`npm run dev`, test keys).
5. Make the smallest change; `npm run build` + relevant tests.
6. Ship via the `elis-bulletproof-ship` skill (branch, scope audit, deploy the
   right surface — frontend vs Edge Function vs migration).
