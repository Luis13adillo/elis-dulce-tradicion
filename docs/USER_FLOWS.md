# USER_FLOWS.md

Step-by-step journeys through the system, with the concrete RPC / Edge Function
/ table each step hits. Verified against the repo on 2026-06-15. See
[docs/ARCHITECTURE.md](ARCHITECTURE.md) for the wiring and
[docs/AI_CONTEXT.md](AI_CONTEXT.md) for the current paused-ordering caveat.

> **Current state:** online ordering is OFF. Code-verified: `/order` renders
> `OrderMaintenance` (the wizard `Order.tsx` is not imported into the route —
> [src/App.tsx](../src/App.tsx) line 30), and the `online_orders_paused` kill
> switch (`DEFAULT true`) makes `create_pending_order` raise an exception. The
> *live* DB value of that flag is UNKNOWN from code (toggleable). The flow below
> describes the real `Order.tsx` wizard, which is still in the repo and will be
> the live path again once the Stripe webhook issue is resolved. See
> [docs/AI_CONTEXT.md](AI_CONTEXT.md) for the full code-verified-vs-UNKNOWN
> breakdown.

## 1. Customer places a cake order {#order}

Pages: [src/pages/Order.tsx](../src/pages/Order.tsx) (5-step wizard).

1. **Step 1 — Date & time.** Validated against business hours
   (`business_hours`) and `business_settings.minimum_lead_time_hours` (default
   48h) / `maximum_advance_days` (default 90d). Availability via RPC
   `get_available_dates` / `is_date_available`.
2. **Step 2 — Size.** Choose `cakeSize` from `cake_sizes`. Price via the
   `useOptimizedPricing` hook.
3. **Step 3 — Bread & fillings.** Choose `breadType` (`bread_types`) and up to
   2 fillings (`cake_fillings`). Premium fillings add an upcharge
   (`premium_filling_upcharges`).
4. **Step 4 — Customization.** `theme`, `dedication`, `recipientName`,
   `allergies`, optional reference image → `api.uploadFile()` → Supabase Storage
   (`reference-images` bucket).
5. **Step 5 — Contact + delivery.** Name/phone/email, pickup vs delivery. For
   delivery, `api.calculateDeliveryFee(address, zip)` → **Express backend**
   `POST {VITE_API_URL}/api/v1/delivery/calculate-fee` (returns fee +
   serviceability). Consent checkboxes captured.
6. **Submit.** `api.createPendingOrder(payload)` → RPC `create_pending_order`,
   which validates everything **server-side** (required fields, price recompute,
   lead time, advance window, holidays, business hours, daily capacity, the
   `online_orders_paused` kill switch, idempotency key) and inserts a
   `pending_orders` row (`status='awaiting_payment'`, 24h `expires_at`).
   Returns `{ pending_order_id, order_number, total_amount, expires_at }`.
7. Navigate to `/payment-checkout?pendingId=<uuid>`.

## 2. Payment {#payment}

Pages: [src/pages/PaymentCheckout.tsx](../src/pages/PaymentCheckout.tsx),
[src/components/payment/StripeCheckoutForm.tsx](../src/components/payment/StripeCheckoutForm.tsx).
Edge Functions: `create-payment-intent`, `stripe-webhook`, `verify-payment`.

This is the **Tier A** design: the real `orders` row is created only after
Stripe confirms payment, by the webhook — not by the browser.

1. PaymentCheckout reads `pendingId`, calls `api.getPendingOrder(pendingId)`
   (RPC `get_pending_order`) to validate it is not expired/already paid. If
   `status='promoted'`, it jumps straight to confirmation.
2. `api.createPaymentIntent({ pending_order_id })` → Edge Function
   `create-payment-intent`, which **recomputes the amount from the DB** (ignores
   any client amount), creates a Stripe PaymentIntent with the
   `pending_order_id` in metadata, and returns `{ clientSecret, id }`.
   Idempotency keyed by `pending_order_id`.
3. Stripe Elements collects the card; `stripe.confirmPayment(...)` handles 3DS /
   Cash App Pay; `return_url` carries `pendingId`. On success → redirect to
   `/order-confirmation?pendingId=<uuid>`.
4. **Webhook** (`stripe-webhook`, async): on `payment_intent.succeeded`, dedupe
   by event id (`stripe_webhook_events`), read `pending_order_id` from metadata,
   call RPC `promote_pending_order` to atomically copy the pending row into
   `orders` (`status='pending'`, `payment_status='paid'`), then send the
   confirmation email (`send-order-confirmation`) and owner alert. On
   `payment_intent.payment_failed`, mark the pending row failed
   (`mark_pending_order_failed`) and send failure emails.
5. **Confirmation** ([src/pages/OrderConfirmation.tsx](../src/pages/OrderConfirmation.tsx)):
   polls `api.verifyPaymentByPending(pendingId)` (Edge Function `verify-payment`)
   until the `orders` row exists (≈15s window). Verified → show details +
   confetti. Failed → retry message (pending row persists 24h). Timeout →
   "check your email" (webhook may land later).

**This webhook step is the part currently under repair.**

## 3. Front Desk / Kitchen receives & works an order {#frontdesk}

Page: [src/pages/FrontDesk.tsx](../src/pages/FrontDesk.tsx). Roles: `baker`,
`owner`. Components under `src/components/kitchen/*`.

- **Realtime feed:** `useOrdersFeed` → `useRealtimeOrders` subscribes to the
  `orders` table. New/changed orders patch the React Query cache in place and
  play an audio alert.
- **UI:** status tabs, order cards with time-remaining countdown, today's
  schedule + capacity, calendar (`OrderScheduler`), ticket print
  (`PrintPreviewModal`), inventory panel, delivery panel, urgent-orders banner.
- **Walk-in orders:** `WalkInOrderModal` creates counter/phone orders via RPC
  `create_new_order` (does not go through the pending-order/payment flow;
  supports cash).
- **Status transitions:** tapping an action calls `api.updateOrderStatus(...)`
  → RPC `transition_order_status` (validates against the DB state machine, sets
  timestamps, writes `order_status_history`). Side effects (emails) fire via
  DB trigger / Edge Functions.
- **Auto-confirm:** `business_settings.auto_confirm_enabled` +
  `auto_confirm_prep_minutes` can auto-advance new orders.

## 4. Owner dashboard {#owner}

Page: [src/pages/OwnerDashboard.tsx](../src/pages/OwnerDashboard.tsx). Role:
`owner`. Components under `src/components/dashboard/*` and `src/components/admin/*`.

- **Overview:** revenue chart, orders-by-status pie, quick stats (today's
  orders/revenue, capacity %, low-stock). Backed by analytics aggregate
  queries + RPCs `get_orders_by_status`, `get_low_stock_ingredients`.
- **Orders:** searchable list (realtime), calendar by `date_needed`, inline
  view/print/cancel (cancel → `order-cancel` Edge Function).
- **Customers:** list with repeat count + lifetime spend (aggregated).
- **Menu Manager:** CRUD on `cake_sizes`, `bread_types`, `cake_fillings`,
  `premium_filling_upcharges`.
- **Inventory Manager:** CRUD on `ingredients`.
- **Reports:** CSV export + date-range analytics.
- **Admin Settings:** `business_settings`, `business_hours`, delivery zones, FAQ,
  gallery, announcements, contact submissions, order issues.

Owner accounts are protected with MFA (Phase 10 components: `EnrollMFA.tsx`,
`MFAChallengeScreen.tsx`, `AuthenticatorAssuranceCheck.tsx`) and an inactivity
session timeout.

## 5. Customer order tracking (public) {#tracking}

Page: [src/pages/OrderTracking.tsx](../src/pages/OrderTracking.tsx).

1. Customer enters an order number (no login).
2. `api.getOrderByNumber(orderNumber)` → RPC `get_public_order`, which returns
   a **sanitized** subset (masked email, no dedication/address detail) and is
   **rate-limited** to 10 lookups/min/IP via `check_order_lookup_rate_limit`
   (`order_lookup_rate_limits` table). A miss and a rate-limit both return null
   (no IP enumeration).
3. Subscribes to realtime updates; shows a status timeline.
4. If `pending`/`confirmed`, the customer can cancel → `order-cancel` Edge
   Function (refund per `cancellation_policies`).

## 6. Cancellation & refund {#cancel}

- Policy lookup: RPC `get_cancellation_policy(hours_before)` → refund % from
  `cancellation_policies` (seeded: 48h=100%, 24h=50%, 0h=0%).
- Refund amount: RPC `calculate_refund_amount(total, hours_before)`.
- Execution: `order-cancel` Edge Function calls `stripe.refunds.create()` with
  an idempotency key, writes the `refunds` row and order refund fields, sends
  email. Admins can override the refund amount (`adminCancelOrder`).

## 7. Other forms

- **Contact** (`/contact`): submits → `send-contact-notification`.
- **Order issue** (`/order-issue`): submits → `send-order-issue-notification`.
- **Newsletter signup:** ⚠️ currently a **mock** (`setTimeout`, not persisted) —
  see [docs/KNOWN_BUGS.md](KNOWN_BUGS.md).

## Scheduled (no user) flows

- **Daily sales report:** pg_cron (`0 13 * * *` UTC) → `send-daily-report`.
- **Pending-order pruning:** pg_cron (`5 * * * *`) → `prune_expired_pending_orders`.
- **Scheduled order transitions:** `scheduled-order-transitions` Edge Function
  (time-based status updates). Exact business rule UNKNOWN — read the function.
