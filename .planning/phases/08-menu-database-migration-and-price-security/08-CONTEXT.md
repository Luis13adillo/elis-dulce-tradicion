# Phase 8: Menu Database Migration & Price Security - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Move all hardcoded cake order form options (cake sizes, bread types, fillings, premium upcharges, time slots) from Order.tsx into the database. Add server-side price recalculation to prevent client-side price manipulation. Remove Square dead code. Strengthen signup password validation.

This phase does NOT include a UI for the owner to edit prices — that is a future phase. Owner uses Supabase Table Editor directly for now.

</domain>

<decisions>
## Implementation Decisions

### Pricing Data Migration
- Auto-seed the database with all current hardcoded values from Order.tsx (lines 22-65: CAKE_SIZES, BREAD_TYPES, FILLINGS, PREMIUM_FILLING_OPTIONS, TIME_OPTIONS)
- Review `backend/db/pricing-schema.sql` (7 pricing tables defined) — use the schema if it fits, simplify if overly complex for current needs
- Order.tsx reads these options from the database via API after migration
- No Owner Dashboard UI for editing these options in Phase 8 — owner uses Supabase Table Editor directly

### Price Mismatch Behavior (SEC-02)
- Include server-side price recalculation on order creation
- Behavior: hard reject — order creation fails if client total doesn't match server-recalculated total
- Customer-facing error: generic message ("Something went wrong, please try again") — do not reveal that price manipulation was detected
- Log mismatch details server-side for investigation

### Square Code Removal (SEC-03)
- Remove exactly these files/sections:
  - `src/lib/square.ts` (entire file)
  - `src/components/payment/SquarePaymentForm.tsx` (entire file)
  - Square routes in `backend/routes/payments.js` (Square-specific sections only)
- No replacement Stripe management endpoints needed — Stripe payments already handled via Supabase Edge Functions
- Do not search for or remove any other Square references beyond these three

### Password Complexity (SEC-04)
- Add complexity requirements to `src/pages/Signup.tsx` validation
- Requirements: uppercase, lowercase, number, special character (beyond current length >= 6 only check)
- Claude's Discretion: exact error message wording and UX for showing requirements

### Claude's Discretion
- Exact API shape for fetching order form options (REST vs. existing Supabase direct calls)
- Whether to use a single endpoint for all options or separate endpoints per option type
- Loading/error states in Order.tsx while fetching options from DB
- Password strength indicator UI if applicable

</decisions>

<specifics>
## Specific Ideas

- Implementation notes from ROADMAP.md: hardcoded data is at Order.tsx lines 22-65
- Products table already exists — may need schema adjustments for sizes/fillings
- Price validation: add to `backend/routes/orders.js` on order creation
- DB-VERIFY step required first: confirm which backend/db/ schemas are actually applied in production Supabase before proceeding

</specifics>

<deferred>
## Deferred Ideas

- Owner Dashboard UI for editing cake sizes, fillings, bread types, and prices — future phase
- Stripe management endpoints (refunds, payment history) — future phase

</deferred>

---

*Phase: 08-menu-database-migration-and-price-security*
*Context gathered: 2026-04-02*
