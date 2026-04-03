---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: milestone
status: unknown
last_updated: "2026-04-03T14:41:22.854Z"
progress:
  total_phases: 10
  completed_phases: 5
  total_plans: 25
  completed_plans: 20
---

# Project State

**Project:** Eli's Bakery - Notification Fixes
**Milestone:** v1.1
**Updated:** 2026-04-03

## Current Status

| Metric | Value |
|--------|-------|
| Current Phase | Phase 5 - Dashboard & Front Desk Fixes (Complete - all 4 plans done) |
| Phases Complete | 4/10 |
| Requirements Complete | 19/53 |
| Overall Progress | 36% by req count (but ~68% feature-complete) |

Progress: [===------------------] 15% (requirements)

## Project Reference

See: .planning/PROJECT.md (updated 2025-02-01)

**Core value:** Customers receive email confirmations at each stage; staff are alerted instantly when orders come in.
**Current focus:** Phase 2 - Stripe Backend Integration (CRITICAL: Stripe webhook handler missing — orders not created on payment)

## Phase Status

| Phase | Name | Status | Plans | Progress |
|-------|------|--------|-------|----------|
| 1 | Contact Form Emails | Complete | 1/1 | 100% |
| 2 | Stripe Backend Integration & Order Emails | Complete ⚠️ (3 gaps in Phase 3) | 1/1 | 100% |
| 3 | Dashboard Verification | In Progress | 2/3 | 50% |
| 4 | UI/UX Verification | In Progress | 1/2 | 50% |
| 5 | Dashboard & Front Desk Fixes | Complete | 4/4 | 100% |
| 6 | Walk-In Order Creation | Deferred ⏸️ | 0/0 | — |
| 7 | Recipe Management | Deferred ⏸️ | 0/0 | — |
| 8 | Menu DB Migration & Price Security | Complete | 4/4 | 100% |
| 9 | Security Hardening & Code Quality | In Progress | 1/0 | — |
| 10 | Post-Launch Polish | Pending | 0/0 | 0% |

## Accumulated Decisions

| Decision | Phase | Rationale |
|----------|-------|-----------|
| Applied migration via psql direct connection (DATABASE_URL) — Supabase CLI requires config.toml not present in this project | 08-03 | Direct psql works reliably; no config.toml in this project |
| Seed data uses ASCII-safe values for Spanish labels in SQL (Pina vs Piña) to avoid psql encoding issues | 08-03 | SQL encoding safety; display labels in Order.tsx retain accents |
| validatePassword error strings pre-bilingual ("Spanish / English") — t() unavailable at call site | 08-02 | validatePassword is a pure function outside component scope; no hook context available |
| No replacement Stripe management endpoints added — payments handled via Supabase Edge Functions | 08-01 | Stripe payment flow lives entirely in Edge Functions; Express backend only needs payment lookup |
| payments-sqlite.js Square imports are pre-existing dead code (sqlite-server.js not active server) | 08-01 | Only used by sqlite-server.js which is dead code; deferred to Phase 9 |
| Pricing migration: static seed data only, no owner-editable UI | 08 | Keep Phase 8 simple — owner requests price changes as needed. Self-service pricing UI deferred to future. |
| Daily capacity warning is non-blocking — save proceeds after toast.warning | 05-04 | Owner intent to lower capacity should not be blocked by system state |
| Capacity toast targeted: "Daily capacity updated" only when capacity changed | 05-04 | Specific feedback for specific changes; generic otherwise |
| FrontDeskInventory uses lightweight Supabase channel as connectivity health monitor | 05-04 | No table subscription needed; CHANNEL_ERROR indicates WebSocket failure |
| Email failures do not block form submission | 01-01 | Database is source of truth; emails are notifications |
| All templates use phone (610) 279-6200 | 01-01 | Consistency across all customer communications |
| Remove BakerStation page | 03-01 | Front Desk already handles baker needs |
| Delete unused layout files | 03-01 | Clean dead code not imported anywhere |
| Remove dev components for production | 03-01 | Clean production code without test utilities |
| Products and Inventory accessible as tabs in Owner Dashboard | 03-02 | Single unified interface for owner management |
| Menu items ordered: Overview, Orders, Calendar, Products, Inventory, Reports | 03-02 | Management functions grouped together logically |
| Use Package icon for Products, Boxes icon for Inventory | 03-02 | Visual consistency in sidebar navigation |
| FIX-01 (revenue trend) removed from Phase 5 | audit | Revenue trend calculation is ALREADY DYNAMIC in OwnerDashboard.tsx lines 109-131 |
| FIX-09 (navigate import) removed from Phase 5 | audit | useNavigate IS already imported in OrderTracking.tsx line 3 |
| Default capacity is 10 (not 20 as previously noted) | audit | Verified in capacity-inventory-schema.sql line 10 and capacity.js line 102 |
| Stripe webhook is Supabase Edge Function (not Express) | Phase 2 | stripe-webhook edge function handles payment events; Express does not need a duplicate handler |
| backend/db/ files are reference library only | audit | 24 files in backend/db/ are NOT applied migrations — verify production DB state in Phase 8 |
| Use toast.error instead of console.error for dashboard errors | 04-01 | User-visible feedback preferred over browser console noise in production |
| Audio autoplay browser policy failures silenced with comment | 04-01 | Not a code bug — browser policy constraint, not worth alerting user |
| business_hours allows baker+owner write (not owner-only) | 05-01 | Front desk staff need write access to business hours for kitchen display |
| analytics-views.sql iu.used_at → iu.created_at is reference fix only | 05-01 | backend/db/ files are reference library; apply fix via Supabase SQL editor separately |
| FIX-05 required no code changes | 05-02 | OwnerDashboard.tsx already had all 4 Settings sub-tabs and 3 manager renders at lines 619-645 |
| FALLBACK_TIME_OPTIONS defined inside component | 05-02 | Co-located with timeOptions useMemo for clarity and maintainability |
| Month view click expands inline order panel (not navigate to day view) | 05-03 | Day view still accessible via view mode switcher; inline panel is faster for staff |
| FrontDesk maxDailyCapacity defaults to 10 (not 20) | 05-03 | Consistent with audit decision: capacity-inventory-schema.sql default is 10 |
- [Phase 08-01]: No replacement Stripe management endpoints added — Stripe payments handled entirely via Supabase Edge Functions
- [Phase 08-03]: Applied migration via psql direct connection (DATABASE_URL) — Supabase CLI requires config.toml not present in this project
- [Phase 08-03]: Seed data uses ASCII-safe values for Spanish labels in SQL (Pina vs Piña) to avoid psql encoding issues — display labels in Order.tsx retain accents
- [Phase 08-04]: activeCakeSizes/activeFillings/etc. derived in render (not useMemo) — arrays are small (8 sizes, 14 fillings); no measurable performance benefit from memoization
- [Phase 08-04]: Price validation errors are non-blocking in backend — log and proceed to avoid disrupting legitimate orders if validation DB query fails
- [Phase 08-04]: Generic error message on price mismatch ("Something went wrong") — does not reveal manipulation was detected (per SEC-02 spec)
- [Phase 09-01]: CSRF is defense-in-depth only — auth uses Bearer JWT, not cookies — graceful degradation on fetch failure (returns empty string, not error)
- [Phase 09-01]: sameSite=lax in dev, sameSite=none+secure in production — cross-origin Vercel/Express requires none for cookies to be sent
- [Phase 09-01]: Webhook routes excluded from CSRF by path prefix check in inline wrapper middleware
- [Phase 09-02a]: exportRevenueSummary and exportOrderVolume accept filteredOrders + dateRange as parameters (not closures) so parent QuickExport can call them directly
- [Phase 09-02a]: dateRange prop added to OrderVolumeReport beyond plan spec — enables consistent CSV filename generation, no behavior change
- [Phase 09-02a]: exportRevenueSummary and exportOrderVolume accept filteredOrders + dateRange as parameters (not closures) so parent QuickExport can call them directly
- [Phase 09-02a]: dateRange prop added to OrderVolumeReport beyond plan spec — enables consistent CSV filename generation, no behavior change
- [Phase 09-02b]: Orchestrator summary card stats computed inline in ReportsManager (small derivations) — child components own detailed data transforms
- [Phase 09-02b]: ReportsManager at ~273 lines vs 150-200 target — lightweight parent-level card stats add lines but all detailed report panels and export functions are extracted to child modules
- [Phase 09]: deliveryFee kept as separate state (not in formData) — it is a computed value from API response, not user-editable form field
- [Phase 09-03]: AddressAutocomplete handles calculateDeliveryFee internally — Order.tsx receives delivery results only via handleAddressChange callback
- [Phase 09-03]: Delivery address validation placed before consent check in validateStep: name, phone, email, delivery address (conditional), consent
- [Phase 09-04]: FloatingInput co-located in DetailsStep.tsx and imported by ContactStep — avoids creating a separate file for a small helper used in exactly 2 steps
- [Phase 09-04]: handlePhoneChange refactored from event-based to string-based signature — ContactStep passes e.target.value explicitly for clarity
- [Phase 10-01]: Mock @/lib/api in pricing tests to prevent Supabase WebSocket connections during module import
- [Phase 10-01]: orderStateMachine backwards check moved before permission check; cancelled excluded from backwards check (toIndex >= 0 guard)
- [Phase 10-01]: calculateTax: try county-specific rate first, then fall back to state-wide rate — previous logic returned state rate even when county-specific existed
- [Phase 10-03]: Supabase does not support backup codes — second TOTP factor on another device is the documented recovery mechanism; EnrollMFA includes second-device enrollment section
- [Phase 10-03]: AuthenticatorAssuranceCheck fails open on AAL API error — transient errors should not lock out admins
- [Phase 10-03]: Owner MFA enforcement requires Supabase project setting (Require MFA for user) — AAL check alone is insufficient without that config; noted in comment in OwnerDashboard.tsx

## Recent Activity

- 2025-02-01: Project initialized
- 2025-02-01: Requirements defined (11 total)
- 2025-02-01: Roadmap created (2 phases)
- 2026-02-01: Added Phase 3 (Dashboard Verification) and Phase 4 (UI/UX Verification)
- 2026-02-01: Requirements expanded to 21 total
- 2026-02-01: Completed 01-01-PLAN.md (Wire edge function + fix content)
- 2026-02-02: Completed 03-01-PLAN.md (Code cleanup - removed 7 unused files)
- 2026-02-02: Completed 03-02-PLAN.md (Dashboard Integration - MenuManager and InventoryManager tabs)
- 2026-02-13: Gap analysis completed — cross-referenced system analysis docs against codebase
- 2026-02-13: Found 10/21 fixes already resolved, 11 still needed
- 2026-02-13: Added Phase 5 (Dashboard & Front Desk Fixes), Phase 6 (Walk-In Orders), Phase 7 (Recipe Management)
- 2026-02-13: Added Phase 8 (Menu DB Migration & Price Security), Phase 9 (Security Hardening & Code Quality)
- 2026-02-13: Full roadmap now covers path to 100% production-ready (10 phases, 45 requirements)
- 2026-02-13: Documented live site status — elisbakery.com is live, not yet accepting orders (Stripe test keys)
- 2026-02-13: Updated PROJECT.md — corrected Square→Stripe, updated requirements, added deployment status
- 2026-04-02: Deep codebase audit (3 parallel agents) — found CRITICAL missing Stripe webhook handler
- 2026-04-02: Corrected GSD inaccuracies: FIX-01 (revenue trend already dynamic), FIX-09 (navigate already imported)
- 2026-04-02: Added STRIPE-01 through STRIPE-04 to Phase 2 (Stripe Backend Integration)
- 2026-04-02: Added MISS-04 (capacity.js profiles bug), MISS-05 (analytics-views used_at bug), MISS-08 (CMS RLS) to Phase 5
- 2026-04-02: Added DB-VERIFY to Phase 8 (backend/db/ files are reference library, not applied migrations)
- 2026-04-02: Total requirements updated from 45 to 50. Current focus is Phase 2.
- 2026-04-02: Phase 2 complete — STRIPE-01 through STRIPE-04 + EMAIL-03 + EMAIL-04 all resolved
- 2026-04-02: Added verifyPayment() to API client; wired confirmation email in PaymentCheckout; fixed stripe-webhook column bugs; replaced Square refund with Stripe in cancellation.js; installed stripe SDK in backend
- 2026-04-02: Readiness audit against actual code found 3 Phase 2 gaps. Added STRIPE-05 (verifyPayment race condition — queries DB only, not Stripe API), STRIPE-06 (webhook missing order status pending→confirmed transition), DB-MIGRATE-01 (payment_disputes table missing from Supabase migrations) into Phase 3 as verification gate. Total requirements: 50 → 53.
- 2026-04-02: Completed 04-01-PLAN.md — deleted 7 dead code files from disk; removed all debug console statements from OwnerDashboard, FrontDesk, useOrdersFeed; build verified green
- 2026-04-03: Completed 05-01-PLAN.md — fixed capacity.js profiles→user_profiles bug (MISS-04), fixed analytics-views.sql used_at→created_at (MISS-05), added CMS RLS migration (MISS-08), added max_daily_capacity column migration (FIX-06 prerequisite)
- 2026-04-03: Completed 05-02-PLAN.md — fixed analytics getPopularItems to use v_popular_items view (FIX-02), removed stub New Order button from OrderScheduler (FIX-04), made Order.tsx time slots dynamic from business hours (FIX-07), confirmed FIX-05 already implemented
- 2026-04-03: Completed 05-03-PLAN.md — added maxDailyCapacity prop + traffic light fill bars + past-day dimming + expandable day panel to OwnerCalendar month view; wired FrontDesk calendar case to OwnerCalendar (FIX-03)
- 2026-04-03: Completed 05-04-PLAN.md — added max daily capacity number input to BusinessSettings Orders tab (FIX-06), added skeleton loading + isError state + CHANNEL_ERROR health monitor to FrontDeskInventory, added staffError state + toast.error retry to DeliveryManagementPanel (FIX-08). Phase 5 fully complete.
- 2026-04-03: Deferred Phase 6 (Walk-In Order Creation) — owner already has a POS system that handles walk-in and phone orders. Building a duplicate form would create redundancy.
- 2026-04-03: Deferred Phase 7 (Recipe Management) — inventory tracking is not in use. Recipe-cost calculations require active inventory to have value. Potential future upsell once core system is live. Next phase is 8 (Menu DB Migration & Price Security).
- 2026-04-03: Completed 08-02-PLAN.md — added validatePassword() to Signup.tsx with 5-rule complexity validation (min 8 chars, uppercase, lowercase, number, special char); removed weak length<6 check; build verified green (SEC-04)
- 2026-04-03: Completed 08-01-PLAN.md — deleted Square source files (square.ts, SquarePaymentForm.tsx) and stripped 540 lines of Square code from backend/routes/payments.js; build verified green (SEC-03)
- 2026-04-03: Completed 08-03-PLAN.md — applied 4 pricing tables migration to production Supabase via psql (cake_sizes 8 rows, bread_types 3 rows, cake_fillings 14 rows, premium_filling_upcharges 2 rows); wired OrderOptionsApi into api singleton; build verified green (DB-VERIFY + SEC-01)
- 2026-04-03: Completed 08-04-PLAN.md — wired Order.tsx to fetch pricing options from DB with FALLBACK_ arrays; added server-side price validation (PRICE_MISMATCH_DETECTED) to backend/routes/orders.js; build verified green (SEC-01 + SEC-02). Phase 8 fully complete.
- 2026-04-03: Completed 09-01-PLAN.md — CSRF defense-in-depth using csrf-csrf double-submit cookie pattern; removed squarecdn.com/squareup.com from CSP (replaced with maps.googleapis.com); created backend/middleware/csrf.js and src/lib/csrf.ts; wired X-CSRF-Token injection + credentials:include into api-client.ts; build verified green (SEC-05 complete).
- 2026-04-03: Completed 09-02a-PLAN.md — created src/components/dashboard/reports/ with reportUtils.ts (generateCSV, downloadCSV, getDateRange, DatePreset), RevenueReport.tsx (revenueSummary useMemo + exportRevenueSummary), and OrderVolumeReport.tsx (orderVolume useMemo + exportOrderVolume); first half of ReportsManager refactor; build verified green (REFACTOR-02 partial).
- 2026-04-03: Completed 09-02b-PLAN.md — created CustomerReport.tsx (customerReport useMemo + exportCustomerReport) and InventoryReport.tsx (inventoryReport useMemo + exportInventoryReport); rewrote ReportsManager.tsx as slim orchestrator (~273 lines from 855); all 5 files in reports/ module; build verified green (REFACTOR-02 complete).
- 2026-04-03: Completed 09-03-PLAN.md — added calculateDeliveryFee to ApiClient; enabled delivery button, wired AddressAutocomplete with out-of-zone auto-revert, delivery fee in getTotal() and order payload; SEC-06 complete.
- 2026-04-03: Completed 09-04-PLAN.md — extracted 5 step components (DateTimeStep, SizeStep, FlavorStep, DetailsStep, ContactStep) from Order.tsx monolith into src/components/order/steps/; replaced decorative progress bars with clickable step indicator; delivery UI migrated to ContactStep; build verified green (REFACTOR-01 complete).
- 2026-04-03: Completed 10-01-PLAN.md — installed vitest + testing-library ecosystem (missing from package.json); created pricing.ts unit test suite (23 cases covering calculateCakePrice, calculateFillingCost, calculateThemeCost, calculateTax, formatPrice); fixed 2 pre-existing bugs in orderStateMachine.ts and pricing.ts; all 39 tests pass (TEST-01 complete).
- 2026-04-03: Completed 10-03-PLAN.md — created EnrollMFA.tsx (QR code, OTP input, challenge+verify, second-device recovery), MFAChallengeScreen.tsx (listFactors on mount, auto-submit challenge), AuthenticatorAssuranceCheck.tsx (AAL gate); wired OwnerDashboard (owner, required MFA) and FrontDesk (baker, optional MFA); build verified green (AUTH-01 complete).

## Roadmap Evolution

- Phase 3 added: Dashboard Verification - analyze Owner and Front Desk dashboards, verify components, graphs, order handling
- Phase 4 added: UI/UX Verification - ensure all UI/UX is polished, responsive, bilingual, and working properly
- Phase 5 added: Dashboard & Front Desk Fixes - fix 9 remaining bugs (hardcoded trend %, empty popular items, month calendar, stub buttons, orphaned CMS tools, hardcoded capacity/hours, error states, navigate import)
- Phase 6 added: Walk-In Order Creation - build walk-in order form for Front Desk staff
- Phase 7 added: Recipe Management - build recipe management UI with ingredient linking and cost calculation
- Phase 8 added: Menu DB Migration & Price Security - move hardcoded pricing to database, add server-side price validation, remove Square dead code, password complexity
- Phase 9 added: Security Hardening & Code Quality - CSRF protection, enable delivery option, split Order.tsx (1004 LOC) and ReportsManager.tsx (854 LOC)
- Phase 10 added: Post-Launch Polish - unit/integration tests, 2FA/MFA for admin, session timeout, JSON-LD structured data

## Blockers

None currently.

## Notes

**Live Site Status:**
- Site is live at [elisbakery.com](https://elisbakery.com) (Vercel, auto-deploys from `main`)
- **NOT yet accepting orders** — Stripe uses test keys (`pk_test_...`)
- Orders will go live after Phases 2-5 complete (emails + dashboards + UI verified)
- No customer orders have been placed yet

**Codebase context available:**
- `.planning/codebase/` contains 7 documents mapping the existing system
- Key file for contact form fix: `src/lib/support.ts`
- Email templates: `supabase/functions/send-*/index.ts`

**Phase 1 Complete:**
- Contact form email wiring complete
- All phone numbers fixed to (610) 279-6200
- Placeholder addresses replaced with 324 W Marshall St, Norristown, PA 19401
- See: `.planning/phases/01-contact-form-emails/01-01-SUMMARY.md`

**Phase 3 Complete (pending Phase 3 plan 3 for STRIPE-05/06/DB-MIGRATE-01):**
- Code cleanup complete (03-01): Removed 7 unused files including BakerStation page, dev utilities, test data generation
- Dashboard integration complete (03-02): MenuManager and InventoryManager now accessible as Products and Inventory tabs
- Owner Dashboard now has 6 tabs: Overview, Orders, Calendar, Products, Inventory, Reports
- See: `.planning/phases/03-dashboard-verification/03-01-SUMMARY.md` and `.planning/phases/03-dashboard-verification/03-02-SUMMARY.md`
- ⚠️ Phase 3 also covers 3 payment gaps from Phase 2: STRIPE-05, STRIPE-06, DB-MIGRATE-01 (see ROADMAP.md Phase 3)

**Phase 4 Complete:**
- Code cleanup complete (04-01): Deleted 7 dead code files from disk; removed all console statements from OwnerDashboard, FrontDesk, and useOrdersFeed
- Build verified green after cleanup
- See: `.planning/phases/04-ui-ux-verification/04-01-SUMMARY.md`

**Phase 5 In Progress:**
- Backend bug fixes and DB prerequisites complete (05-01): fixed capacity.js bug, fixed analytics view, added 2 migration files
- Frontend analytics + order form fixes complete (05-02): getPopularItems uses v_popular_items, stub button removed, Order.tsx time slots dynamic
- See: `.planning/phases/05-dashboard-and-front-desk-fixes/05-01-SUMMARY.md`
- See: `.planning/phases/05-dashboard-and-front-desk-fixes/05-02-SUMMARY.md`
- Calendar view implemented (05-03): OwnerCalendar has traffic light fill bars + past-day dimming + expandable panels; FrontDesk wired to show it at activeView==='calendar'
- See: `.planning/phases/05-dashboard-and-front-desk-fixes/05-03-SUMMARY.md`
- Capacity input + error states complete (05-04): BusinessSettings Orders tab has max capacity number input; FrontDeskInventory has skeleton loading + isError + CHANNEL_ERROR health monitor; DeliveryManagementPanel has staffError + toast.error retry
- See: `.planning/phases/05-dashboard-and-front-desk-fixes/05-04-SUMMARY.md`

## Session Continuity

Last session: 2026-04-03
Stopped at: Completed 10-03-PLAN.md — TOTP MFA for admin accounts (AUTH-01 complete).
Resume file: None
Next action: Continue Phase 10 — next plan (session timeout or JSON-LD structured data).

**Manual steps still required (Stripe dashboard):**
- Register the Supabase edge function URL as the Stripe webhook endpoint
  URL format: `https://<project-ref>.supabase.co/functions/v1/stripe-webhook`
  Events to subscribe: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded, charge.dispute.created
- Set STRIPE_WEBHOOK_SECRET in Supabase secrets (after registering the endpoint)
- Set RESEND_API_KEY in Supabase secrets (for emails to work)

---
*State tracking initialized: 2025-02-01*
