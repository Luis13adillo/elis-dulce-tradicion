# Eli's Dulce Tradicion - Custom Cake Ordering Platform

## What This Is

A bilingual (English/Spanish) custom cake ordering website for Eli's Dulce Tradicion bakery in Norristown, PA. Customers can design custom cakes, pay via Stripe, and track their orders. Staff manage orders through two dashboards: an Owner dashboard for analytics and a Front Desk dashboard with DoorDash-style real-time alerts when new orders arrive.

## Deployment Status

| Item | Status |
|------|--------|
| **Live URL** | [elisbakery.com](https://elisbakery.com) |
| **Hosting** | Vercel (auto-deploys from `main` branch) |
| **Accepting Orders** | **No** — Stripe is using test keys (`pk_test_...`). Production credentials required before going live with payments. |
| **Target** | Orders go live after Phases 2-5 complete (emails verified, dashboards fixed, UI polished) |

## Core Value

Customers can order custom cakes online and receive email confirmations at each stage — order placed, ready for pickup/delivery. Staff are alerted instantly when orders come in.

## Requirements

### Validated

<!-- Shipped and working -->

- ✓ **Custom cake ordering** — Size, filling, theme, dedication, reference image upload
- ✓ **Stripe payment processing** — Secure checkout with Stripe Payment Element
- ✓ **Order tracking** — Customers can track order status via order number
- ✓ **Owner dashboard** — Analytics, order management, business metrics, products, inventory
- ✓ **Front Desk dashboard** — Real-time order queue with DoorDash-style alerts
- ✓ **Real-time notifications** — Full-screen popup + sound + browser notification when orders arrive
- ✓ **Bilingual support** — English and Spanish throughout the site
- ✓ **Contact form** — Inquiry submission with attachment support
- ✓ **Email templates exist** — Order confirmation, ready notification, contact notification (Resend + Supabase Edge Functions)
- ✓ **Contact form emails** — Owner notification + customer auto-reply wired and working (Phase 1)
- ✓ **Auth flow** — Login, logout, role-based routing all working
- ✓ **RLS policies** — Customer-facing policies for orders, profiles, payments implemented
- ✓ **Product management** — Full CRUD for menu items via MenuManager in Owner Dashboard
- ✓ **Inventory management** — Real stock tracking, low-stock alerts, usage logging via InventoryManager
- ✓ **Revenue trend calculation** — Dynamic today vs. yesterday comparison in Owner Dashboard (not hardcoded)
- ✓ **OrderTracking navigation** — useNavigate imported and working correctly for "Get Help" / "Report Issue"
- ✓ **send-order-confirmation edge function** — Complete, bilingual, XSS-safe, ready to fire
- ✓ **create_new_order RPC** — Handles all fields including stripe_payment_id, auto-generates order numbers
- ✓ **Cancellation policy logic** — 48h/24h/<24h refund tiers, admin override, email notifications

### Active

<!-- Current scope - Phases 2-10 -->

**Phase 2 — Stripe Backend Integration & Order Email Verification:**
- [ ] STRIPE-01: Add Stripe webhook handler to Express (`payment_intent.succeeded`, `.failed`, `charge.refunded`) — **ORDERS NEVER CREATED WITHOUT THIS**
- [ ] STRIPE-02: Implement `api.verifyPayment(paymentId)` in `src/lib/api/modules/orders.ts` — OrderConfirmation page crashes without it
- [ ] STRIPE-03: Verify `supabase/functions/stripe-webhook/` edge function — complete or coordinate with Express handler
- [ ] STRIPE-04: Replace Square refund in `backend/routes/cancellation.js` with Stripe `stripe.refunds.create()`
- [ ] EMAIL-03: Order confirmation email auto-triggers after Stripe payment succeeds
- [ ] EMAIL-04: "Ready" notification email works when status changes to `ready`

**Phase 3 — Dashboard Verification Checkpoint:**
- [ ] DASH-01 through DASH-05: Verify all dashboard components, real-time flow, no console errors
- [ ] STRIPE-05: Fix `api.verifyPayment()` race condition — must call Stripe API directly, not just query DB
- [ ] STRIPE-06: Webhook must auto-transition order `status: pending → confirmed` on `payment_intent.succeeded`
- [ ] DB-MIGRATE-01: Create `payment_disputes` Supabase migration (table missing from production)

**Phase 4 — UI/UX Verification:**
- [ ] UX-01 through UX-05: All pages, responsive, bilingual, forms, modals working

**Phase 5 — Dashboard & Front Desk Fixes:**
- [ ] FIX-02: Populate Most Ordered Items from `v_popular_items` analytics view
- [ ] FIX-03: Render month calendar view in FrontDesk when activeView === 'calendar'
- [ ] FIX-04: Remove stub "New Order" button from Owner calendar
- [ ] FIX-05: Expose BusinessHoursManager, ContactSubmissionsManager, OrderIssuesManager in Settings
- [ ] FIX-06: Make maxDailyCapacity configurable from `business_settings` (currently hardcoded 10)
- [ ] FIX-07: Fetch calendar time slots dynamically from `business_hours` table
- [ ] FIX-08: Add error states + retry buttons to order feed, inventory, delivery panels
- [ ] MISS-04: Fix `capacity.js` line 142 — `profiles` → `user_profiles` table name
- [ ] MISS-05: Fix `analytics-views.sql` line 189 — `iu.used_at` → `iu.created_at`
- [ ] MISS-08: Verify/enable RLS on CMS tables in Supabase dashboard

**Phase 6 — Walk-In Order Creation:**
- [ ] FEAT-01: Build `WalkInOrderForm.tsx` — Front Desk modal for phone/counter orders

**Phase 7 — Recipe Management:**
- [ ] FEAT-02: Build `RecipeManager.tsx` — DB tables exist, UI missing

**Phase 8 — Menu DB Migration & Price Security:**
- [ ] DB-VERIFY: Query production DB to confirm which backend/db/ schemas are applied
- [ ] SEC-01: Move hardcoded CAKE_SIZES, BREAD_TYPES, FILLINGS from Order.tsx to database
- [ ] SEC-02: Add server-side price recalculation on order creation
- [ ] SEC-03: Remove Square dead code (square.ts, SquarePaymentForm.tsx, payments.js Square routes)
- [ ] SEC-04: Add password complexity requirements to Signup.tsx

**Phase 9 — Security Hardening & Code Quality:**
- [ ] SEC-05: CSRF protection on all form submissions
- [ ] SEC-06: Enable delivery option (wire AddressVerification.tsx)
- [ ] REFACTOR-01: Split Order.tsx (1,004 lines) into 5 step components
- [ ] REFACTOR-02: Split ReportsManager.tsx (854 lines) into analytics modules

**Phase 10 — Post-Launch Polish:**
- [x] TEST-01: Unit + integration tests (Vitest/Playwright, currently 0% coverage)
- [ ] AUTH-01: 2FA/MFA for owner + baker accounts
- [ ] AUTH-02: Session timeout (rebuild useInactivityTimeout correctly)
- [ ] SEO-01: JSON-LD structured data + update sitemap

### Out of Scope

<!-- Explicit boundaries -->

- POS/Cashier system — Not a point-of-sale terminal, no cash register or barcode scanning
- Employee management — No payroll, scheduling, or staff directory
- Multi-store support — Single bakery location only
- Delivery tracking (out_for_delivery/delivered states) — States exist but workflow deferred to Phase 9
- SMS notifications — Email only for now
- Refund processing — Automated via Stripe API (Phase 2 wires cancellation → Stripe refund)

## Context

**Business:**
- Eli's Dulce Tradicion, 324 W Marshall St, Norristown, PA 19401
- Phone: (610) 279-6200
- Hours: 5:00 AM - 10:00 PM, 365 days
- Owner email: info@elisbakery.com

**Technical Environment:**
- Frontend: React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui
- Backend: Node.js + Express
- Database: PostgreSQL via Supabase
- Auth: Supabase Auth with role-based access (customer, baker, owner)
- Payments: Stripe (Square dead code exists, scheduled for removal in Phase 8)
- Email: Resend via Supabase Edge Functions
- Real-time: Supabase Realtime subscriptions
- Hosting: Vercel (frontend)

**Codebase State:**
- Live at elisbakery.com — not yet accepting orders (test keys)
- Codebase mapped: `.planning/codebase/` (7 documents)
- Known tech debt documented in `.planning/codebase/CONCERNS.md`
- Full system analysis: `Elis-Dulce-Tradicion-Full-System-Analysis.docx`
- Fix plan: `Elis-GSD-Implementation-Fix-Plan.docx`

## Constraints

- **Live Site**: Changes must not break production — test thoroughly, run `npm run build` before pushing
- **Email Provider**: Using Resend (requires RESEND_API_KEY in Supabase secrets)
- **Payment Provider**: Stripe is active (Square code is dead code, removal scheduled in Phase 8)
- **No Orders Yet**: Stripe test keys in use — do not switch to production keys until Phases 2-5 verified
- **Stripe Webhook**: `STRIPE_WEBHOOK_SECRET` must be set in backend env vars once webhook endpoint is registered in Stripe dashboard

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Resend for email | Simple API, good deliverability, Supabase Edge Function compatible | ✓ Good |
| Stripe for payments | Modern Payment Element, production-ready SDK | ✓ Good |
| Supabase for backend | Real-time, auth, storage in one platform | ✓ Good |
| Bilingual from start | Serves Spanish-speaking community in Norristown | ✓ Good |
| 10-phase roadmap | Systematic path from current state to 100% production-ready | In Progress |

## Definition of Done — Production Go-Live Criteria

**All 5 steps must pass before switching to live Stripe keys:**

1. Place a full order on elisbakery.com using Stripe test card `4242 4242 4242 4242`
2. Order appears in Owner Dashboard **AND** Front Desk queue within 5 seconds of payment
3. Customer confirmation email arrives within 60 seconds (check inbox, not spam)
4. Front Desk marks order "Ready" → customer receives a second "your order is ready" email
5. Owner Dashboard shows the order amount reflected in revenue metrics

**Gate:** Phases 3, 4, and 5 must be complete before go-live. Phases 6–10 are post-launch improvements.

**Manual prerequisites** (cannot be done by code — require your Stripe account):
- `RESEND_API_KEY` set in Supabase secrets (for emails to send)
- Supabase edge function URL registered as Stripe webhook endpoint
  - URL: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
  - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`
- `STRIPE_WEBHOOK_SECRET` set in Supabase secrets (after registering the endpoint above)

**After all 5 steps pass:** swap `VITE_STRIPE_PUBLISHABLE_KEY` to `pk_live_*` in Vercel environment variables.

---
*Last updated: 2026-04-02 — Full codebase audit: corrected FIX-01/FIX-09 (already resolved), added STRIPE-01 through STRIPE-04 (critical Stripe webhook gap), added MISS-04/MISS-05/MISS-08/DB-VERIFY, total requirements now 50*
*Updated: 2026-04-02 — Readiness audit: added STRIPE-05, STRIPE-06, DB-MIGRATE-01 to Phase 3. Added Definition of Done section. Total requirements: 53.*
