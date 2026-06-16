# AI_CONTEXT.md — Read this first

Orientation for any AI/code agent working in this repo. It tells you what the
system is, how it really runs, and where the load-bearing facts live so you do
not have to guess. Everything here is verified against the code in the repo as
of 2026-06-15. When in doubt, prefer the actual code over any doc.

## What this app is

A custom-cake ordering website for **Eli's Dulce Tradicion**, a bakery. Three
audiences:

1. **Customers** place cake orders through a 5-step wizard, pay with Stripe,
   and track order status by order number.
2. **Front Desk / Kitchen** (role `baker`) receives orders on a tablet, works
   them through a status pipeline, prints tickets, creates walk-in orders.
3. **Owner** monitors orders, revenue, customers, menu, inventory, and business
   settings from a dashboard.

Bilingual (English / Spanish) throughout. Live at **elisbakery.com**, deployed
on Vercel, accepting real Stripe payments.

It is **not** a POS, employee-management, or multi-store system.

## The single most important current-state fact: online ordering status

Online ordering is **turned off at two layers.** There is one clear truth:
**the public `/order` page does not serve the ordering wizard.**

**Code-verified (true in this repo, regardless of deployment):**
- `/order` renders [`OrderMaintenance`](../src/pages/OrderMaintenance.tsx) — a
  phone/email/address fallback page — NOT the 5-step wizard. The route import is
  swapped at [src/App.tsx](../src/App.tsx) line 30:
  `const Order = lazyWithRetry(() => import("./pages/OrderMaintenance"));`
  The wizard [src/pages/Order.tsx](../src/pages/Order.tsx) (≈37 KB) still exists
  and works, but **nothing imports it into the route** — it is hidden behind the
  maintenance page. Restoring ordering means swapping that import back to
  `./pages/Order`.
- A server-side kill switch column `business_settings.online_orders_paused` was
  added with **`DEFAULT true`** (migration
  `20260428T160000_pause_online_orders_kill_switch.sql`). The
  `create_pending_order` RPC raises an exception when it is true, so no order
  can be created regardless of which (cached or fresh) frontend bundle calls it.
  The migration comment explains why both layers exist: a real customer once
  placed an order because the PWA service worker kept serving a cached `/order`
  bundle past the maintenance page — the UI swap alone wasn't enough, so the DB
  switch was added as the backstop.

**UNKNOWN (production-only — cannot be verified from the repo):**
- The *current runtime value* of `business_settings.online_orders_paused` in the
  production database. The column default is `true` and the documented intent is
  "paused," but it can be toggled from the dashboard / via SQL, so the live value
  is not knowable from code. Check the production DB to confirm.
- Whether Stripe live keys are active in Vercel right now. `CLAUDE.md` and
  project memory say production uses `pk_live_…`; that is a deployment-config
  fact, not something this repo proves.

**Net:** treat online ordering as paused. Do not assume customers can place
orders through the wizard right now, and do not re-enable it by flipping one
layer — restore the `Order.tsx` import AND set `online_orders_paused = false`,
only after the Stripe webhook path is verified end-to-end.

## How it actually runs (this surprises people)

The repo contains a full Express backend under [backend/](../backend), but the
**production frontend talks to Supabase directly** (PostgREST + RPC + Realtime +
Storage) and to **Supabase Edge Functions** for payments/email — NOT to Express.

- Confirmed by the most recent commit: *"order-cancel Edge Function replaces
  undeployed backend route."*
- The frontend API client ([src/lib/api/index.ts](../src/lib/api/index.ts))
  uses `supabase.functions.invoke(...)` and Supabase RPC for the order/payment
  path. `VITE_API_URL` (the Express backend) is referenced only for delivery-fee
  calculation, some analytics calls, and a generic `api-client.ts`.
- Treat the Express backend as **secondary / mostly undeployed**. It is real,
  documented code (see [docs/API_ROUTES.md](API_ROUTES.md)), but do not assume
  it is the live runtime. Verify before relying on it.

So the real production stack is: **React (Vite) on Vercel → Supabase (DB,
Auth, Realtime, Storage, Edge Functions) → Stripe + Resend.**

## Where the truth lives

| Question | Authoritative source |
|---|---|
| Project overview, conventions, accounts | [CLAUDE.md](../CLAUDE.md) |
| How the system is wired | [docs/ARCHITECTURE.md](ARCHITECTURE.md) |
| Step-by-step user journeys | [docs/USER_FLOWS.md](USER_FLOWS.md) |
| Express route inventory | [docs/API_ROUTES.md](API_ROUTES.md) |
| Tables, columns, RPCs, triggers, cron | [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) |
| Env vars (names + purpose, no secrets) | [docs/ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| How to debug a problem | [docs/DEBUGGING_WORKFLOW.md](DEBUGGING_WORKFLOW.md) |
| Open bugs / dead code / unfinished work | [docs/KNOWN_BUGS.md](KNOWN_BUGS.md) |
| How to add a feature safely | [docs/FEATURE_BUILD_WORKFLOW.md](FEATURE_BUILD_WORKFLOW.md) |
| Order status state machine (frontend) | [src/lib/orderStateMachine.ts](../src/lib/orderStateMachine.ts) |
| Order status state machine (DB, authoritative) | migration `20260525120100_enforce_state_machine_and_audit.sql` |

There are also ~50 historical `*.md` design/implementation notes in the repo
root (e.g. `PAYMENT_INTEGRATION_COMPLETE.md`). They are point-in-time records,
not maintained references. Trust the `docs/` files and the code first.

## Hard rules for agents

These come from the project owner's standing instructions. Honor them.

- **Do not write to the production database.** Read-only SQL only unless the
  user explicitly approves a write. Customer order and payment data is
  revenue-critical.
- **Stripe is live (real payments).** Never deploy Stripe-related changes
  without a test-mode dry run first.
- **Every push to `main` auto-deploys to Vercel.** Branch first; commit/push
  only when asked. There is a dedicated ship skill (`elis-bulletproof-ship`).
- **Migrations and Edge Functions deploy separately** from the frontend — a
  `git push` does not deploy them. Migrations are applied via the Supabase
  dashboard or `supabase db push`; functions via `supabase functions deploy <name>`.
- **Square is dead code.** Do not use or extend it.
- Keep both dashboards simple and focused — this is a single small bakery.

## Dev vs prod Supabase (important gotcha)

Per project memory, there are two Supabase projects:
- **NEW** `bebmkekmzcrgeraeakmp` = production / live orders (Vercel + `.env`,
  real Stripe).
- **OLD** `rnszrscxwkdwvvlsihqc` = testing only.

The Supabase MCP tools and the `elis-bulletproof-*` skills are wired to the
**OLD** project, not production. Confirm which project you are pointed at before
trusting query results.

## Auth and roles

Three roles: `customer`, `baker` (labeled "Front Desk"), `owner`. Roles live in
the `user_profiles` table (column `user_id`). `ProtectedRoute` in
[src/App.tsx](../src/App.tsx) enforces access — dashboards must not duplicate
auth checks. See [docs/ARCHITECTURE.md](ARCHITECTURE.md#auth) for the auth race
lessons; they are easy to reintroduce and have caused redirect loops before.
