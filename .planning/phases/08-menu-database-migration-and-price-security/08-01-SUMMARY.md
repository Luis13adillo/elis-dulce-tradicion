---
phase: 08-menu-database-migration-and-price-security
plan: "01"
subsystem: payments
tags: [square, stripe, dead-code, cleanup]

# Dependency graph
requires: []
provides:
  - Stripe-only backend/routes/payments.js with GET /order/:orderId only
  - Square SDK files deleted from src/ (square.ts, SquarePaymentForm.tsx)
  - Clean payment routes with no Square SDK imports or initialization
affects:
  - 08-02 (price security)
  - 09 (security hardening — sqlite-server dead code still exists, deferred)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stripe is sole payment provider — all Square code removed from active paths"

key-files:
  created: []
  modified:
    - backend/routes/payments.js

key-decisions:
  - "payments-sqlite.js Square imports are pre-existing dead code (only used by sqlite-server.js, which is not the active server) — deferred to Phase 9"
  - "No replacement Stripe management endpoints added — Stripe payments handled entirely via Supabase Edge Functions"

patterns-established:
  - "Dead code removal: delete files + strip routes, verify with build, commit atomically per task"

requirements-completed: [SEC-03]

# Metrics
duration: 4min
completed: 2026-04-03
---

# Phase 8 Plan 01: Remove Square Dead Code Summary

**Square SDK entirely removed from active codebase — deleted square.ts and SquarePaymentForm.tsx, stripped 540 lines of Square routes from payments.js leaving only the Stripe-compatible GET /order/:orderId route**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-03T04:57:00Z
- **Completed:** 2026-04-03T05:01:00Z
- **Tasks:** 2
- **Files modified:** 1 (payments.js) + 2 deleted (square.ts, SquarePaymentForm.tsx)

## Accomplishments
- Deleted `src/lib/square.ts` (81-line Square SDK wrapper)
- Deleted `src/components/payment/SquarePaymentForm.tsx` (170-line Square payment form)
- Stripped 540 lines from `backend/routes/payments.js` — removed Square client init, 5 routes (create-payment, verify, square/:paymentId, /:paymentId/refund, create-checkout), generateOrderNumber() helper, and logFailedPayment() helper
- Preserved `GET /order/:orderId` route intact (DB-only, no Square references)
- Build verified green after both task commits

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete Square source files** - `a98a0d4` (chore)
2. **Task 2: Strip Square code from backend/routes/payments.js** - `f8e05b7` (chore)

## Files Created/Modified
- `src/lib/square.ts` - DELETED (Square SDK wrapper)
- `src/components/payment/SquarePaymentForm.tsx` - DELETED (Square payment form component)
- `backend/routes/payments.js` - Stripped from 568 lines to 33 lines; only GET /order/:orderId remains

## Decisions Made
- No replacement Stripe management endpoints were added — Stripe payments are handled entirely via Supabase Edge Functions, not the Express backend
- `payments-sqlite.js` Square imports are pre-existing dead code (SQLite alternative server, not the active server) — logged to deferred-items.md for Phase 9

## Deviations from Plan

### Deferred Items (Not Auto-Fixed)

**1. [Out of Scope] backend/routes/payments-sqlite.js contains Square imports**
- **Found during:** Task 2 verification
- **Issue:** `payments-sqlite.js` contains `import pkg from 'square'` and full Square SDK usage. Only used by `backend/sqlite-server.js`.
- **Why not fixed:** Pre-existing dead code outside plan scope (`files_modified` only lists `backend/routes/payments.js`). The active `backend/server.js` does not reference it. The Vite frontend build does not reference it.
- **Status:** Logged to `deferred-items.md`; recommended for Phase 9 dead code removal

---

**Total deviations:** 0 auto-fixes. 1 discovery deferred as out-of-scope.
**Impact on plan:** Plan executed as specified. One pre-existing dead code file discovered and properly deferred.

## Issues Encountered
None — all 6 plan verification criteria passed cleanly.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Square dead code removed; Stripe is now the sole payment provider in all active code paths
- Ready for Phase 8 Plan 02 (pricing migration to database)
- Note: `backend/node_modules/square/` (the npm package) still on disk — the `square` package in `backend/package.json` can be removed in Phase 9 once `payments-sqlite.js` is also deleted

---
*Phase: 08-menu-database-migration-and-price-security*
*Completed: 2026-04-03*

## Self-Check: PASSED

- CONFIRMED DELETED: src/lib/square.ts
- CONFIRMED DELETED: src/components/payment/SquarePaymentForm.tsx
- FOUND: backend/routes/payments.js (Stripe-only, 33 lines)
- FOUND: .planning/phases/08-menu-database-migration-and-price-security/08-01-SUMMARY.md
- FOUND: commit a98a0d4 (Task 1)
- FOUND: commit f8e05b7 (Task 2)
