# Roadmap: Eli's Bakery - Notification Fixes

**Created:** 2025-02-01
**Milestone:** v1.1 - Email Notification Fixes
**Phases:** 10

## Overview

| Phase | Name | Goal | Requirements | Status |
|-------|------|------|--------------|--------|
| 1 | Contact Form Emails | Contact form submissions trigger emails to owner and customer | EMAIL-01, EMAIL-02, CONFIG-01, CONFIG-02, CONFIG-03, CONFIG-04, CONTENT-01, CONTENT-02, CONTENT-03 | Complete |
| 2 | Stripe Backend Integration & Order Email Verification | Wire Stripe webhook handler, implement verifyPayment(), replace Square refund, verify all order emails | STRIPE-01, STRIPE-02, STRIPE-03, STRIPE-04, EMAIL-03, EMAIL-04 | Pending |
| 3 | Dashboard Verification | Verify both dashboards have correct components, working graphs, and proper order handling. Fix Phase 2 payment gaps. | DASH-01, DASH-02, DASH-03, DASH-04, DASH-05, STRIPE-05, STRIPE-06, DB-MIGRATE-01 | Pending |
| 4 | UI/UX Verification | Ensure all UI/UX is polished, consistent, and working properly across the site | UX-01, UX-02, UX-03, UX-04, UX-05 | Pending |
| 5 | 4/4 | Complete   | 2026-04-03 | Pending |
| 6 | Walk-In Order Creation | Build walk-in order form so Front Desk staff can create orders for phone/in-person customers | FEAT-01 | Pending |
| 7 | Recipe Management | Build recipe management UI connecting inventory to cake production | FEAT-02 | Pending |
| 8 | 3/4 | In Progress|  | Pending |
| 9 | Security Hardening & Code Quality | CSRF protection, delivery enablement, and large component refactoring | SEC-05, SEC-06, REFACTOR-01, REFACTOR-02 | Pending |
| 10 | Post-Launch Polish | Unit tests, 2FA for admin, session timeout, and JSON-LD SEO | TEST-01, AUTH-01, AUTH-02, SEO-01 | Pending |

---

## Phase 1: Contact Form Emails

**Goal:** Contact form submissions trigger email notifications to the owner and send auto-reply confirmation to customers.

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md — Wire edge function call + fix content (address/phone)

**Requirements:**
- EMAIL-01: Contact form → email to owner
- EMAIL-02: Contact form → auto-reply to customer
- CONFIG-01: Deploy Supabase Edge Functions
- CONFIG-02: Set RESEND_API_KEY
- CONFIG-03: Set OWNER_EMAIL
- CONFIG-04: Set FRONTEND_URL
- CONTENT-01: Fix placeholder address
- CONTENT-02: Standardize phone number
- CONTENT-03: Verify from email config

**Success Criteria:**
1. When a customer submits the contact form, owner receives email at info@elisbakery.com within 1 minute
2. Customer receives auto-reply confirmation email within 1 minute of submitting contact form
3. All Supabase Edge Functions are deployed and accessible
4. Ready notification email shows "324 W Marshall St, Norristown, PA 19401" (not placeholder)
5. All email templates show phone number (610) 279-6200

**Implementation Notes:**
- Add call to `send-contact-notification` edge function in `src/lib/support.ts` after database insert
- Update `supabase/functions/send-ready-notification/index.ts` to replace placeholder address
- Update all email templates to use correct phone number
- Deploy edge functions via Supabase CLI
- Set secrets in Supabase dashboard

---

## Phase 2: Stripe Backend Integration & Order Email Verification

**Goal:** Fix the broken payment backend so orders are actually created when customers pay, implement payment verification, replace Square refund logic with Stripe, then verify all order emails work end-to-end.

**⚠️ Critical:** Without this phase, customers can pay via Stripe but NO order is ever created in the database. The Express webhook handler for Stripe does not exist.

**Plans:** 1 plan

Plans:
- [ ] 02-01-PLAN.md — Stripe webhook + verifyPayment + email verification

**Requirements:**
- STRIPE-01: Add Stripe webhook handler to `backend/routes/webhooks.js` — handle `payment_intent.succeeded` (create order + send confirmation), `payment_intent.failed` (send failure notification), `charge.refunded` (update order status)
- STRIPE-02: Implement `api.verifyPayment(paymentId)` in `src/lib/api/modules/orders.ts` — query `payments` table by stripe_payment_intent_id, return `{ verified: boolean, orderNumber: string }`
- STRIPE-03: Review `supabase/functions/stripe-webhook/` edge function — verify it doesn't duplicate order creation with the Express handler
- STRIPE-04: Replace Square refund in `backend/routes/cancellation.js` line 429 with `stripe.refunds.create({ payment_intent: order.stripe_payment_id })`
- EMAIL-03: Order confirmation email auto-triggers after Stripe payment_intent.succeeded
- EMAIL-04: Ready notification email works when baker changes order status to `ready`

**Success Criteria:**
1. Pay with Stripe test card `4242 4242 4242 4242` → order appears in Owner Dashboard and Front Desk queue
2. Customer confirmation email received within 60 seconds of payment
3. `OrderConfirmation.tsx` loads without error (verifyPayment method exists)
4. Changing order status to "ready" → customer receives ready notification email
5. Cancel order requiring refund → Stripe refund created (not Square)
6. Failed payment → owner receives failure notification

**Implementation Notes:**
- Add Stripe webhook route: `router.post('/stripe', express.raw({type: 'application/json'}), async (req, res) => { ... })`
- Verify signature: `stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)`
- On succeeded: call `supabase.rpc('create_new_order', { ...metadata })` then `api.notifications.sendOrderConfirmation(order)`
- Register webhook endpoint in Stripe dashboard → get `STRIPE_WEBHOOK_SECRET` → add to Vercel env vars
- `send-order-confirmation` edge function is already complete — just needs to be called
- Depends on Phase 1 (edge functions must be deployed)

---

## Phase 3: Dashboard Verification

**Goal:** Verify that both Owner Dashboard and Front Desk Dashboard have all necessary components, working graphs/analytics, proper order handling, and remove any unnecessary code.

**Plans:** 3 plans

Plans:
- [ ] 03-01-PLAN.md — Dead code cleanup (remove BakerStation, unused layouts, dev components)
- [ ] 03-02-PLAN.md — Tab integration (add Products/Inventory tabs to Owner Dashboard)
- [ ] 03-03-PLAN.md — Dashboard verification checkpoint (verify all functionality works)

**Requirements:**
- DASH-01: Owner Dashboard analytics display correctly (revenue, orders, charts)
- DASH-02: Front Desk Dashboard order queue works properly (filters, status updates)
- DASH-03: Both dashboards receive orders in real-time
- DASH-04: Remove unnecessary/unused components from both dashboards
- DASH-05: Owner Dashboard has distinct interface from Front Desk (analytics-focused)
- STRIPE-05: Fix payment verification race condition — `api.verifyPayment()` must call Stripe API directly (`stripe.paymentIntents.retrieve()`) instead of only querying the DB. Add `POST /api/payments/verify` endpoint in `backend/routes/payments.js`. If payment confirmed by Stripe, update DB and return order — don't rely on webhook having fired yet.
- STRIPE-06: Add order status auto-transition in `supabase/functions/stripe-webhook/index.ts` — on `payment_intent.succeeded`, update `orders.status = 'confirmed'` (not just `payment_status = 'paid'`) so Front Desk sees paid orders immediately without manual confirmation.
- DB-MIGRATE-01: Create `payment_disputes` Supabase migration (`supabase/migrations/20260403_payment_disputes.sql`) — table is referenced in stripe-webhook edge function line 172 but does not exist in production. Schema: `id, charge_id, dispute_id, amount, reason, status, order_id, created_at`. Add RLS: service_role only.

**Success Criteria:**
1. Owner Dashboard shows accurate metrics: Revenue Today, Orders Today, Average Ticket
2. Owner Dashboard line chart (revenue trends) and pie chart (order status) render correctly with real data
3. Front Desk Dashboard displays order cards with proper filtering by status (new, preparing, pickup, delivery, done)
4. Real-time order updates work on both dashboards (new order appears within 5 seconds)
5. Order status changes from Front Desk update correctly and trigger proper workflows
6. No unused components, dead code, or placeholder functionality remains
7. Owner Dashboard has calendar view, reports section, and analytics not present in Front Desk
8. OrderConfirmation page shows order details immediately after redirect from Stripe (no "Order not found" race condition)
9. Paid orders appear in Front Desk as "confirmed" (not stuck in "pending")
10. `charge.dispute.created` webhook events are stored without error

**Implementation Notes:**
- Audit Owner Dashboard components: OwnerSidebar, DashboardHeader, OwnerCalendar, charts
- Audit Front Desk components: KitchenRedesignedLayout, KitchenNavTabs, ModernOrderCard, OrderScheduler
- Verify useRealtimeOrders and useOrdersFeed hooks work correctly
- Remove any dev/placeholder components from src/components/dev/
- Test order flow: create order → appears in both dashboards → update status → verify state

---

## Phase 4: UI/UX Verification

**Goal:** Ensure the entire application UI/UX is polished, consistent, responsive, and working properly across all pages and interactions.

**Requirements:**
- UX-01: All pages load correctly without visual glitches
- UX-02: Responsive design works on mobile, tablet, and desktop
- UX-03: Bilingual support (English/Spanish) works consistently
- UX-04: All interactive elements (buttons, forms, modals) function correctly
- UX-05: Visual consistency across all pages (colors, typography, spacing)

**Success Criteria:**
1. All customer-facing pages (Home, Order, Track, Contact) render correctly
2. All staff-facing pages (Owner Dashboard, Front Desk, Kitchen Display) render correctly
3. Forms submit properly with validation feedback
4. Modals open/close correctly (PrintPreview, CancelOrder, FullScreenAlert)
5. Language toggle switches all visible text between English and Spanish
6. No broken images, missing icons, or layout issues on any screen size
7. Loading states and error states display appropriately
8. Navigation between pages works without errors

**Implementation Notes:**
- Test all customer pages: /, /order, /track, /contact
- Test all staff pages: /owner-dashboard, /front-desk, /kitchen-display, /bakery-dashboard
- Test on different viewport sizes (mobile, tablet, desktop)
- Verify language toggle on each page
- Check console for any JavaScript errors during navigation
- Test form validations on Order and Contact pages

---

## Phase 5: Dashboard & Front Desk Fixes

**Goal:** Fix all remaining bugs and wire up orphaned components in both dashboards. This addresses 9 issues identified in the system analysis that were not covered by earlier phases.

**Plans:** 4/4 plans complete

Plans:
- [x] 05-01-PLAN.md — Backend bug fixes + DB migrations (MISS-04, MISS-05, MISS-08, FIX-06 migration)
- [x] 05-02-PLAN.md — Analytics + UI cleanup (FIX-02, FIX-04, FIX-07)
- [ ] 05-03-PLAN.md — Calendar month grid in both dashboards (FIX-03)
- [ ] 05-04-PLAN.md — Capacity UI + error states (FIX-06 UI, FIX-08)

**⚠️ Audit corrections:** FIX-01 (revenue trend) is already dynamic in code — removed. FIX-09 (navigate) is already imported — removed. FIX-05 (Settings tab CMS tools) is already implemented in OwnerDashboard.tsx lines 619-645 — verified. Added MISS-04, MISS-05, MISS-08 from codebase audit.

**Requirements:**
- FIX-02: Populate Most Ordered Items from `v_popular_items` analytics view (currently always empty despite api.getPopularItems() existing)
- FIX-03: Render month calendar view — add conditional `{activeView === 'calendar' && <OrderScheduler />}` in FrontDesk.tsx and implement month grid in OwnerCalendar.tsx
- FIX-04: Remove stub 'New Order' buttons from Owner calendar views (owner doesn't create orders)
- FIX-05: Expose hidden CMS tools (BusinessHoursManager, ContactSubmissionsManager, OrderIssuesManager) in Settings tab of Owner Dashboard — ALREADY DONE (lines 619-645)
- FIX-06: Move maxDailyCapacity to `business_settings` table (currently hardcoded to **10** in TodayScheduleSummary.tsx and capacity.js)
- FIX-07: Fetch calendar hours dynamically from `business_hours` table via `GET /api/capacity/business-hours` (currently hardcoded TIME_OPTIONS in Order.tsx and OrderScheduler.tsx)
- FIX-08: Add error states and retry buttons to order feed, inventory, and delivery panels
- MISS-04: Fix `backend/routes/capacity.js` line 142 — queries `profiles` table (doesn't exist), should be `user_profiles`
- MISS-05: Fix `backend/db/analytics-views.sql` line 189 — `iu.used_at` → `iu.created_at` (used_at column does not exist)
- MISS-08: Verify and enable RLS policies on all CMS tables in Supabase dashboard (currently may be commented out)

**Success Criteria:**
1. Most Ordered Items section displays top items from actual order data
2. Month calendar view renders a grid with order counts per day and capacity color coding in both dashboards
3. No stub/non-functional buttons exist in either dashboard
4. Business Hours, Contact Submissions, and Order Issues managers accessible from Owner Settings
5. Max daily capacity is configurable from Business Settings (not hardcoded)
6. Calendar time slots respect actual business hours from `business_hours` table
7. Error banners with retry buttons display when real-time subscriptions or data fetches fail
8. `POST /api/capacity/set` returns 200 (not 500 from wrong table query)
9. `v_inventory_usage` analytics view returns data without column error

**Implementation Notes:**
- Owner Dashboard files: `OwnerDashboard.tsx`, `OwnerCalendar.tsx`, `OrderScheduler.tsx`
- Front Desk files: `FrontDesk.tsx`, `TodayScheduleSummary.tsx`
- CMS components already exist: `src/components/admin/BusinessHoursManager.tsx`, `ContactSubmissionsManager.tsx`, `OrderIssuesManager.tsx`
- Business hours endpoint already exists: `GET /api/capacity/business-hours` in `backend/routes/capacity.js`
- Analytics view `v_popular_items` already defined — just needs to be queried correctly

---

## Phase 6: Walk-In Order Creation ⏸️ DEFERRED

> **Status: Deferred** — The owner has an existing POS system that already handles walk-in and phone orders. Building a duplicate form would create redundancy. Revisit if the owner wants orders created in the POS to also appear in the kitchen display (requires POS integration, not just a form).

**Goal:** Build a walk-in order form for Front Desk staff so they can create orders for phone and in-person customers directly from the kitchen display.

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 6 to break down)

**Requirements:**
- FEAT-01: Front Desk staff can create walk-in orders with customer name, phone, cake details, pickup date/time, and notes

**Success Criteria:**
1. A '+ New Walk-In Order' button is accessible from the Front Desk sidebar or header
2. Walk-in form opens as a full-screen modal (doesn't navigate away from order queue)
3. Menu options (sizes, fillings, bread types) are pulled from the database, not hardcoded arrays
4. Price calculates in real-time as selections change
5. Order saves to Supabase with `source: 'walk-in'` to distinguish from website orders
6. New walk-in order appears in the kitchen queue immediately via real-time subscription
7. Order confirmation notification triggers through standard email flow

**Implementation Notes:**
- New component: `WalkInOrderForm` in `src/components/kitchen/`
- Must be self-contained — does not reuse Order.tsx (which is 1,004 lines and website-specific)
- Pull product data from `products` table via API
- Use same pricing logic as website for consistency
- Bilingual support required (English/Spanish)

---

## Phase 7: Recipe Management ⏸️ DEFERRED

> **Status: Deferred** — Inventory tracking is not in use. Recipe-cost calculations require active inventory unit costs to have value. Revisit as a paid add-on if the owner wants ingredient cost tracking in the future.

**Goal:** Build a recipe management UI that connects the existing inventory system to cake production, so the owner can see ingredient costs per recipe and track usage.

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 7 to break down)

**Requirements:**
- FEAT-02: Owner can create, view, edit, and delete recipes with ingredient linking and cost calculations

**Success Criteria:**
1. RecipeManager component accessible as a new 'Recipes' tab in Owner Dashboard sidebar
2. Recipes support bilingual names (English/Spanish)
3. Each recipe lists ingredients linked to existing inventory items
4. Ingredient quantities per recipe are configurable
5. Cost per recipe auto-calculates from ingredient unit costs in inventory
6. Full CRUD: create, read, update, delete recipes
7. Search and filter recipes by name or category

**Implementation Notes:**
- Database tables already exist: `product_recipes`, `order_component_recipes` (from `20260211_recipe_engine.sql`)
- New component: `RecipeManager` in `src/components/dashboard/` or `src/components/admin/`
- Add to Owner Dashboard sidebar after Inventory tab
- Link ingredient rows to `inventory` table for cost lookups
- Follow same patterns as MenuManager (624 LOC) and InventoryManager (344 LOC)

---

## Phase 8: Menu Database Migration & Price Security

**Goal:** Move all hardcoded menu data and pricing from Order.tsx into the database, add server-side price recalculation to prevent client-side manipulation, and clean up dead payment code.

**Plans:** 3/4 plans executed

Plans:
- [ ] 08-01-PLAN.md — Square dead code removal (square.ts, SquarePaymentForm.tsx, Square routes in payments.js)
- [ ] 08-02-PLAN.md — Password complexity validation on signup form
- [ ] 08-03-PLAN.md — Pricing DB foundation (4 tables + seed data + OrderOptionsApi module)
- [ ] 08-04-PLAN.md — Frontend wiring + server-side price validation

**Requirements:**
- DB-VERIFY: Query production Supabase database (`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`) to confirm which `backend/db/` reference schemas are actually applied. The 24 files in `backend/db/` are a reference library — NOT guaranteed applied migrations. Apply any missing schemas before proceeding.
- SEC-01: Move hardcoded cake sizes, bread types, fillings, premium upcharges, and time slots from Order.tsx to the products/business_settings tables (use `backend/db/pricing-schema.sql` as reference — 7 pricing tables already defined)
- SEC-02: Add server-side price recalculation on order creation (backend validates total matches expected price based on selections)
- SEC-03: Remove Square dead code (~820 lines across `src/lib/square.ts`, `src/components/payment/SquarePaymentForm.tsx`, and Square routes in `backend/routes/payments.js` — replace with Stripe payment management endpoints)
- SEC-04: Add password complexity requirements on signup (uppercase, lowercase, number, special character — currently only checks length >= 6)

**Success Criteria:**
1. Order.tsx reads all menu options (sizes, fillings, bread types, pricing) from the database via API
2. Menu changes (adding a size, changing a price) work from the Owner Dashboard without code redeployment
3. Backend recalculates order total from item selections and rejects orders where client total doesn't match
4. No Square payment code remains in the codebase
5. Signup enforces password complexity beyond just length >= 6

**Implementation Notes:**
- Hardcoded data in Order.tsx: lines 22-65 (CAKE_SIZES, BREAD_TYPES, FILLINGS, PREMIUM_FILLING_OPTIONS, TIME_OPTIONS)
- Products table already exists — may need schema adjustments for sizes/fillings
- Price validation: add to `backend/routes/orders.js` on order creation
- Square files to remove: `src/lib/square.ts`, `src/components/payment/SquarePaymentForm.tsx`, Square routes in `backend/routes/payments.js`
- Password: update `src/pages/Signup.tsx` validation (currently only checks length >= 6)

---

## Phase 9: Security Hardening & Code Quality

**Goal:** Add CSRF protection, enable the delivery option for customers, and refactor the two largest components for maintainability.

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 9 to break down)

**Requirements:**
- SEC-05: Add CSRF protection on all form submissions
- SEC-06: Enable delivery option in order flow with Google Maps address verification
- REFACTOR-01: Split Order.tsx (1,004 lines) into step-specific components
- REFACTOR-02: Split ReportsManager.tsx (854 lines) into smaller analytics modules

**Success Criteria:**
1. All form submissions include and validate CSRF tokens
2. Customers can select delivery (not just pickup) during order placement
3. Delivery address validated via Google Maps with delivery zone and fee calculation
4. Order.tsx is broken into 5 step components (DateTimeStep, SizeStep, FlavorStep, DetailsStep, ContactStep) under ~200 lines each
5. ReportsManager.tsx is broken into separate report components (RevenueReport, OrderVolumeReport, CustomerReport, InventoryReport)

**Implementation Notes:**
- CSRF: add middleware to Express backend, generate tokens, validate on form POST routes
- Delivery: Order.tsx currently has delivery UI with `cursor-not-allowed` — remove disabled state, wire up Google Maps `AddressVerification.tsx` (551 LOC, already exists)
- Order.tsx refactor: each step becomes its own component, parent orchestrates with shared state
- ReportsManager refactor: extract each tab/report type into its own file, keep ReportsManager as tab container

---

## Phase 10: Post-Launch Polish

**Goal:** Add automated testing, admin security features, and SEO improvements for long-term maintainability and discoverability.

**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 10 to break down)

**Requirements:**
- TEST-01: Add unit and integration test suites (currently at ~0% coverage despite Vitest + Playwright being configured)
- AUTH-01: Add 2FA/MFA for owner and baker accounts
- AUTH-02: Implement session timeout for inactive users (auto-logout after configurable period)
- SEO-01: Add JSON-LD structured data (LocalBusiness, BakeryProduct schemas) for rich search results

**Success Criteria:**
1. Core business logic has unit test coverage (order creation, pricing, status transitions)
2. At least 1 E2E test covers the full order flow (place order → payment → confirmation)
3. Owner and baker accounts can enable 2FA via authenticator app
4. Inactive sessions auto-expire after 30 minutes (configurable)
5. Google Search Console validates structured data on homepage and product pages
6. Sitemap is current and includes all public pages

**Implementation Notes:**
- Vitest is already configured (`npm run test`) — just needs actual test files
- Playwright is configured (`npm run test:e2e`) — needs proper specs with correct routes/credentials
- Supabase Auth supports MFA natively — enable via dashboard + add UI flow
- Session timeout: add `useInactivityTimeout` hook (was removed previously due to bugs — rebuild correctly)
- JSON-LD: add `<script type="application/ld+json">` to index.html or via React Helmet
- Sitemap exists at `/public/sitemap.xml` but is dated 2025-11-19 — needs updating

---

## Dependency Graph

```
Phase 1 ─── Phase 2 ─── Phase 3 ─── Phase 4
   │           │           │           │
   │           │           │           └── UI/UX verification (final polish)
   │           │           │
   │           │           └── Dashboard verification (components + order flow)
   │           │
   │           └── Verify order emails work
   │
   └── Set up infrastructure + fix contact form

Phase 5 ──── Phase 6
   │             │
   │             └── Walk-in order form (uses DB-driven menu from Phase 5)
   │
   └── Dashboard & Front Desk bug fixes

Phase 7 (independent — can run after Phase 5)
   │
   └── Recipe management UI

Phase 8 ──── Phase 9 ──── Phase 10
   │             │             │
   │             │             └── Tests, 2FA, session timeout, SEO
   │             │
   │             └── CSRF, delivery enablement, component refactoring
   │
   └── Menu DB migration + price security + dead code removal
```

- Phase 2 depends on Phase 1 (edge functions must be deployed first)
- Phase 3 depends on Phase 2 (order emails verified → can test order flow in dashboards)
- Phase 4 depends on Phase 3 (dashboards verified → can do full UI/UX sweep)
- Phase 5 can start after Phase 3 (dashboards must be structurally verified first)
- Phase 6 depends on Phase 5 (business_hours in DB needed for walk-in form time slots)
- Phase 7 can start after Phase 5 (inventory integration must work first)
- Phase 8 can start after Phase 6 (walk-in form needs DB-driven menu first, Phase 8 migrates Order.tsx pricing too)
- Phase 9 depends on Phase 8 (Order.tsx refactor requires DB migration to be complete first)
- Phase 10 depends on Phase 9 (tests need final component structure, 2FA needs security hardening done)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Resend API issues | Test with small volume first; have SMTP fallback documented |
| Edge function deployment fails | Verify Supabase CLI access and permissions before starting |
| Email goes to spam | Check SPF/DKIM records for elisbakery.com domain |
| Breaking production | Test on development environment first if available |
| Walk-in form complexity | Keep it self-contained, don't reuse Order.tsx |
| Recipe DB schema mismatch | Verify existing tables match UI needs before building |
| Menu migration breaks Order.tsx | Keep hardcoded fallbacks during migration, remove after verification |
| Price validation too strict | Allow small rounding differences (< $0.01) in server-side check |
| Order.tsx refactor scope creep | Refactor structure only, don't change functionality |

---
*Roadmap created: 2025-02-01*
*Updated: 2026-02-13 — Added Phases 5-10 from system analysis gap review. Site live at elisbakery.com.*
*Updated: 2026-04-02 — Full codebase audit. Phase 2 renamed + expanded with STRIPE-01 through STRIPE-04 (critical: Stripe webhook handler missing). Phase 5 corrected: removed FIX-01 (revenue trend already dynamic) and FIX-09 (navigate already imported); added MISS-04/MISS-05/MISS-08. Phase 8 added DB-VERIFY. Total requirements: 50.*
*Updated: 2026-04-02 — Readiness audit against actual code. Phase 2 marked complete but had 3 functional gaps. Added STRIPE-05 (payment verification race condition), STRIPE-06 (order auto-transition on webhook), DB-MIGRATE-01 (payment_disputes migration) into Phase 3 as the verification gate. Total requirements: 53.*
*Updated: 2026-04-03 — Phase 5 planned: 4 plans in 2 waves. FIX-05 confirmed already implemented. Wave 1: 05-01 (backend/DB fixes) + 05-02 (analytics/UI cleanup) run in parallel. Wave 2: 05-03 (calendar grid) + 05-04 (capacity UI + error states) depend on 05-01.*
*Updated: 2026-04-03 — Phase 8 planned: 4 plans in 2 waves. Wave 1 (parallel): 08-01 (Square dead code removal), 08-02 (password complexity), 08-03 (pricing DB foundation). Wave 2: 08-04 (frontend wiring + price validation) depends on 08-03.*
