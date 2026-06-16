# ARCHITECTURE.md

How Eli's Dulce Tradicion is wired. Verified against the repo on 2026-06-15.
Read [docs/AI_CONTEXT.md](AI_CONTEXT.md) first for the big picture and the hard
rules.

## High-level shape

```
  Browser (React + Vite, hosted on Vercel)
      |
      |  (1) direct Supabase calls: PostgREST tables, RPC, Realtime, Storage
      |  (2) supabase.functions.invoke(...) for payments + email
      v
  Supabase project (PostgreSQL + Auth + Realtime + Storage + Edge Functions)
      |                                   |
      | Edge Functions call out to:       | pg_cron triggers Edge Functions
      v                                   v
  Stripe (payments)              Resend (transactional email)

  [Express backend in /backend exists but is largely UNDEPLOYED — see below]
```

The production runtime is **frontend → Supabase → (Stripe, Resend)**. The
Express server is secondary; the frontend hits it only for delivery-fee
calculation and a couple of analytics calls, and the most recent commit notes
that an Edge Function replaced an "undeployed backend route." Do not assume the
Express server is running in production.

## Tech stack

See [CLAUDE.md](../CLAUDE.md) for the full version table. Summary:

- **Frontend:** React 18 + TypeScript, Vite 5 (SWC), Tailwind + shadcn/ui.
- **Routing:** React Router 6.
- **Server state:** TanStack React Query 5 (5-min stale, 30-min GC, retry once).
- **Global state:** React Context — `AuthContext`, `LanguageContext`.
- **State machine:** XState 5 + a hand-rolled state machine in
  [src/lib/orderStateMachine.ts](../src/lib/orderStateMachine.ts).
- **Backend-as-a-service:** Supabase (Postgres, Auth/JWT, Realtime, Storage).
- **Serverless:** Supabase Edge Functions (Deno).
- **Payments:** Stripe. **Email:** Resend. **Monitoring:** Sentry (frontend only).
- **Express backend (Node):** present in `/backend`, mostly not the prod path.

## Frontend structure

See [CLAUDE.md](../CLAUDE.md#project-structure) for the directory tree. Key
locations:

- `src/pages/` — route-level pages.
- `src/lib/api/` — modular API client. `base.ts` (Supabase connection),
  `index.ts` (composed singleton exported as `api`), `modules/*` (orders,
  products, inventory, analytics, notifications, orderOptions).
- `src/lib/queries/` + `src/lib/queryClient.ts` — React Query hooks + key factory.
- `src/contexts/` — `AuthContext.tsx`, `LanguageContext.tsx`.
- `src/hooks/` — realtime hooks (below) and others.
- `src/components/{kitchen,dashboard,admin,order,payment,...}/` — feature folders.

### Provider stack (from [src/App.tsx](../src/App.tsx))

Outermost → innermost:

```
HelmetProvider → ErrorBoundary → QueryClientProvider → LanguageProvider
  → AuthProvider → TooltipProvider → (Sonner toaster, offline indicator,
  announcement banner) → BrowserRouter → Tracker → ScrollToTop
  → LazyBoundary → Routes
```

### Routing

| Path | Component | Access |
|---|---|---|
| `/` | Index | public |
| `/order` | **OrderMaintenance** (real `Order.tsx` is swapped out — ordering paused) | public |
| `/payment-checkout` | PaymentCheckout | public |
| `/order-confirmation` | OrderConfirmation | public |
| `/order-tracking` | OrderTracking | public |
| `/order-issue` | OrderIssue | public |
| `/menu`, `/gallery`, `/faq`, `/about`, `/contact` | content pages | public |
| `/privacy`, `/terms`, `/legal/*` | Legal pages | public |
| `/login`, `/signup` | auth pages | public |
| `/front-desk` | FrontDesk | ProtectedRoute, roles `['baker','owner']` |
| `/owner-dashboard` | OwnerDashboard | ProtectedRoute, role `'owner'` |
| `*` | NotFound | public |

Pages are lazy-loaded via `lazyWithRetry` for code splitting.

## Auth {#auth}

[src/contexts/AuthContext.tsx](../src/contexts/AuthContext.tsx):

- Session restore: `supabase.auth.getSession()` then an async profile fetch.
- Role source: `user_profiles` table (`role` ∈ `customer | baker | owner`),
  created by a Supabase auth trigger (`handle_new_user`) on signup with default
  `customer`.
- Methods: `signIn`, `signUp`, `signOut`, `hasRole`.
- `isAuthenticated = !!user` (true even while the profile is still loading).
- [`ProtectedRoute`](../src/components/auth/ProtectedRoute.tsx) handles loading,
  redirects unauthenticated users to `/login`, and enforces `requiredRole`.

**Auth race lessons (do not reintroduce — these caused redirect loops):**

- Never add a safety timeout that fires *before* the profile fetch completes;
  it sets `isLoading=false` early and triggers redirect loops.
- Never duplicate `ProtectedRoute`'s auth checks inside a dashboard component —
  they race.
- When role is undefined, redirect to `/login`, not `/`.
- `useInactivityTimeout` was removed from OwnerDashboard once for causing
  session instability; a session-timeout feature was later re-added in Phase 10
  (`useInactivityTimeout.ts` + `SessionTimeoutModal.tsx`). If sessions get flaky,
  suspect this area.

## API layer

`src/lib/api/index.ts` exports a singleton `api`. Import it:
`import { api } from '@/lib/api'`.

Most methods call Supabase directly. The order/payment-critical ones:

- `getAllOrders`, `getOrder` — `orders` table SELECT.
- `getOrderByNumber` — RPC `get_public_order` (public, rate-limited).
- `createPendingOrder` — RPC `create_pending_order`.
- `getPendingOrder` — RPC `get_pending_order`.
- `createPaymentIntent` — Edge Function `create-payment-intent`.
- `verifyPaymentByPending` — Edge Function `verify-payment`.
- `updateOrderStatus` — RPC `transition_order_status` (DB-enforced state machine).
- `cancelOrder` / `adminCancelOrder` — Edge Function `order-cancel`.
- `calculateDeliveryFee` — HTTP `POST {VITE_API_URL}/api/v1/delivery/calculate-fee`
  (the one notable Express dependency).
- `uploadFile` — Supabase Storage upload (cake reference images).

## Realtime

Three layered hooks (`src/hooks/`):

- `useOptimizedRealtime` — subscribes to `postgres_changes` only when visible
  (IntersectionObserver), throttles updates.
- `useRealtimeOrders` — subscribes to the `orders` table (INSERT/UPDATE/DELETE),
  optional filter by `user_id`, debounced, reconnect with exponential backoff.
- `useOrdersFeed` — wraps `useRealtimeOrders` + React Query, patches the query
  cache in place (no full refetch), plays an audio alert, logs an activity feed.

FrontDesk, OwnerDashboard, and OrderTracking all subscribe through these so a
status change anywhere propagates live to every connected screen.

## Order status state machine

Two implementations — the **database is authoritative**.

- Frontend: [src/lib/orderStateMachine.ts](../src/lib/orderStateMachine.ts)
  (`canTransition`, `getAvailableTransitions`, etc.) — used for UI gating.
- Database: RPC `transition_order_status` enforces the transitions, sets the
  appropriate timestamps (`ready_at`, `dispatched_at`, etc.), computes time
  metrics, and writes `order_status_history`. Defined/hardened in migration
  `20260525120100_enforce_state_machine_and_audit.sql`.

Allowed transitions (from the SQL):

```
pending          → confirmed | cancelled
confirmed        → in_progress | cancelled
in_progress      → ready | cancelled
ready            → out_for_delivery | delivered | completed | cancelled
out_for_delivery → delivered | cancelled
delivered        → completed
completed        → (terminal)
cancelled        → (terminal)
```

`pending_orders` has its own lifecycle: `awaiting_payment → payment_failed`
(retryable) → `promoted` (becomes a real `orders` row) or `expired`.

## Payments (Tier A design)

The order is only created **after** Stripe confirms payment, via webhook. This
prevents lost orders and double-charges. Full step-by-step in
[docs/USER_FLOWS.md](USER_FLOWS.md#payment). Summary:

1. Frontend creates a `pending_orders` row (all order data + `total_amount` +
   24h `expires_at`).
2. Frontend requests a payment intent keyed by `pending_order_id`
   (`create-payment-intent` recomputes the amount server-side from the DB).
3. Stripe Elements collects the card; on success Stripe fires
   `payment_intent.succeeded`.
4. The `stripe-webhook` Edge Function (idempotent via `stripe_webhook_events`)
   **promotes** the pending row into the `orders` table and sends the
   confirmation email via Resend.
5. The frontend polls `verify-payment` until the `orders` row appears.

This webhook step is exactly what is currently under repair (ordering paused).

## Edge Functions (`supabase/functions/`)

| Function | Purpose | Invoked by |
|---|---|---|
| `create-payment-intent` | Create Stripe PaymentIntent from a pending order | Frontend |
| `stripe-webhook` | Promote pending→order, send confirmation, handle failures/refunds | Stripe |
| `verify-payment` | Poll Stripe + confirm the order row exists | Frontend |
| `order-cancel` | Customer/admin cancellation + Stripe refund | Frontend |
| `send-order-confirmation` | Order confirmation email | stripe-webhook |
| `send-ready-notification` | "Order ready" email | status change / trigger |
| `send-status-update` | Generic status-change email | status change / trigger |
| `send-order-issue-notification` | Issue report email | OrderIssue form |
| `send-contact-notification` | Contact form email | Contact form |
| `send-failed-payment-notification` | Owner alert on failed payment | stripe-webhook |
| `send-payment-failed-customer` | Customer email on failed payment | stripe-webhook |
| `send-daily-report` | Daily sales summary email | pg_cron (daily) |
| `scheduled-order-transitions` | Time-based status updates | pg_cron |
| `_shared/` | Email templates + shared helpers | — |

Email is bilingual via templates in `supabase/functions/_shared/`.

## Build / deploy

- `npm run dev` — Vite dev server on **port 5178** (set in `vite.config.ts`).
- `npm run build` — production build. Run before pushing; it catches TS errors.
- Manual code splitting via Vite config (vendor chunks + dashboard/order chunks).
- PWA via Workbox (`vite-plugin-pwa`): caches Supabase 24h, API 5min, images 30d.
- **Vercel auto-deploys `main`.** Migrations and Edge Functions deploy
  separately (see [docs/AI_CONTEXT.md](AI_CONTEXT.md)).

## Express backend (reference only)

Lives in [backend/](../backend), Express on port 3001, `npm run server`. It has
a full route set (orders, payments, products, inventory, delivery, analytics,
reports, webhooks, etc.), Supabase + an alternate SQLite mode, CSRF, rate
limiting, Helmet, and Swagger at `/api-docs`. See
[docs/API_ROUTES.md](API_ROUTES.md). Again: it is **not** the production runtime
path for the order/payment flow. `sqlite-server.js`, `mock-server.js`,
`orders-sqlite.js`, `payments-sqlite.js` are dev/alternate/dead variants.

## Known unknowns

- Exact schema of a few tables (`delivery_zones`, `delivery_assignments`,
  `holiday_closures`, `error_logs`, `contact_submissions`, `failed_payments`)
  is not fully captured in the readable migrations — see
  [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). Marked UNKNOWN there.
- Whether the Express backend is deployed anywhere in production: **UNKNOWN**;
  evidence points to "no."
