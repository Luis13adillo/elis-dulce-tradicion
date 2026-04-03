---
phase: 08-menu-database-migration-and-price-security
plan: "04"
subsystem: ui, api, database
tags: [react, supabase, express, price-validation, security]

# Dependency graph
requires:
  - phase: 08-03
    provides: cake_sizes, bread_types, cake_fillings, premium_filling_upcharges tables + api.getOrderFormOptions()
provides:
  - Order.tsx reads pricing options from DB with fallback to hardcoded arrays
  - Server-side price validation on order creation (PRICE_MISMATCH_DETECTED audit log)
  - cake_size_value and filling_values sent in order payload for validation
affects: [09-security-hardening, payments, orders]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DB-driven form options with hardcoded fallback (FALLBACK_ prefix pattern)
    - Server-side price re-verification before INSERT to prevent client-side manipulation
    - audit_logs used for security event logging (PRICE_MISMATCH_DETECTED in new_data JSONB)

key-files:
  created: []
  modified:
    - src/pages/Order.tsx
    - backend/routes/orders.js

key-decisions:
  - "FALLBACK_ prefix for hardcoded arrays — retained as named fallbacks, not deleted"
  - "activeCakeSizes/activeFillings/etc. derived in render (not useMemo) for simplicity — arrays are small"
  - "Price validation errors are non-blocking — log and proceed to avoid disrupting legitimate orders if DB query fails"
  - "Generic error message 'Something went wrong, please try again' on price mismatch — does not reveal manipulation was detected"

patterns-established:
  - "DB fetch on mount with optionsLoading state and FALLBACK_ arrays as graceful degradation"
  - "cake_size_value (slug) kept separate from cake_size (human label) — both sent to backend"

requirements-completed: [SEC-01, SEC-02]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 08 Plan 04: Menu DB Wiring & Server-Side Price Validation Summary

**Order.tsx now fetches cake sizes, bread types, fillings, and upcharges from Supabase on mount with hardcoded fallback; backend validates price against DB before inserting any order (SEC-02)**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03T05:16:48Z
- **Completed:** 2026-04-03T05:21:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Order.tsx imports `api.getOrderFormOptions()` and fetches on mount with `optionsLoading` state
- Hardcoded arrays renamed with `FALLBACK_` prefix and retained as graceful degradation
- DB shape mapped to component shape via `activeCakeSizes`, `activeBreadTypes`, `activeFillings`, `activePremiumOptions`
- Loading skeleton (6 pulse blocks) shown on Step 2 (size) and Step 3 (bread/filling) while loading
- `cake_size_value` (slug) and `filling_values` (selectedFillings array) added to order payload
- Backend validates expected price from `cake_sizes` + `premium_filling_upcharges` tables before INSERT
- Price mismatch logged to `audit_logs` as `PRICE_MISMATCH_DETECTED` and returns generic 400 error
- Legacy orders (no `cake_size_value`) pass through unchanged for backward compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire Order.tsx to fetch from DB with fallback** - `cb104c2` (feat)
2. **Task 2: Add server-side price validation to backend/routes/orders.js** - `71d92fb` (feat)

## Files Created/Modified

- `src/pages/Order.tsx` - Added DB fetch, FALLBACK_ arrays, active derived arrays, loading skeletons, cake_size_value/filling_values in payload
- `backend/routes/orders.js` - Added cake_size_value/filling_values destructuring + price validation block before INSERT

## Decisions Made

- **FALLBACK_ prefix retained, not deleted** — Keeps hardcoded arrays available as a named fallback; more explicit than anonymous inline objects
- **activeCakeSizes/etc. derived in render (not useMemo)** — Arrays are small (8 sizes, 14 fillings); no measurable performance benefit from memoization
- **Price validation errors are non-blocking** — If validation DB query fails (network error, table missing), log and let order proceed; order creation is more critical than blocking on a validation error
- **Generic error on mismatch** — "Something went wrong, please try again" does not reveal to the attacker that price manipulation was detected (per Phase 8 context decision)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 8 is fully complete: SEC-01 (DB tables + API), SEC-02 (server validation), SEC-03 (Square removal), SEC-04 (password complexity) all done
- Ready for Phase 9: Security Hardening & Code Quality (CSRF protection, delivery option, file splitting)

---
*Phase: 08-menu-database-migration-and-price-security*
*Completed: 2026-04-03*
