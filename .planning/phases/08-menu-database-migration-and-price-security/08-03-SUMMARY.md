---
phase: 08-menu-database-migration-and-price-security
plan: "03"
subsystem: database
tags: [supabase, postgres, migrations, rls, api, typescript]

# Dependency graph
requires:
  - phase: 05-dashboard-and-front-desk-fixes
    provides: business_hours table used for TIME_OPTIONS (excluded from this plan)
provides:
  - cake_sizes table in production Supabase with 8 seeded rows
  - bread_types table in production Supabase with 3 seeded rows
  - cake_fillings table in production Supabase with 14 seeded rows
  - premium_filling_upcharges table in production Supabase with 2 seeded rows
  - OrderOptionsApi class with getOrderFormOptions() method
  - api.getOrderFormOptions() available on the ApiClient singleton
affects:
  - 08-04 (Order.tsx migration to DB-fetched options uses api.getOrderFormOptions())
  - 09-security-hardening (pricing tables are now server-authoritative)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Supabase migration applied directly via psql with production DATABASE_URL
    - OrderOptionsApi module extending BaseApiClient with Promise.all parallel fetch
    - RLS: public SELECT on active rows, service_role full access for owner edits

key-files:
  created:
    - supabase/migrations/20260402_order_form_options.sql
    - src/lib/api/modules/orderOptions.ts
  modified:
    - src/lib/api/index.ts

key-decisions:
  - "Applied migration via psql direct connection (DATABASE_URL) — Supabase CLI requires config.toml not present in this project"
  - "Seed data uses ASCII-safe values for Spanish labels (Pina instead of Piña) to avoid encoding issues in SQL files"

patterns-established:
  - "OrderOptionsApi pattern: extend BaseApiClient, use ensureSupabase(), return empty arrays as safe fallback when Supabase unavailable"
  - "All 4 order form option tables use active BOOLEAN column for soft-disabling items without deletion"

requirements-completed: [DB-VERIFY, SEC-01]

# Metrics
duration: 5min
completed: 2026-04-03
---

# Phase 08 Plan 03: Menu DB Migration and OrderOptionsApi Summary

**4 pricing tables (cake_sizes, bread_types, cake_fillings, premium_filling_upcharges) applied to production Supabase via psql with seed data from Order.tsx, plus OrderOptionsApi module wired into the api singleton**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-03T05:08:17Z
- **Completed:** 2026-04-03T05:13:11Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- DB-VERIFY confirmed: production Supabase had 43 tables, none of the 4 pricing tables existed before migration
- Migration applied via psql — 4 tables created, RLS enabled, seed data inserted (8+3+14+2 rows)
- All 4 tables accessible via PostgREST API with anon key (schema cache auto-refreshed)
- OrderOptionsApi module created with TypeScript interfaces for all 4 data types
- api.getOrderFormOptions() available on the singleton, fetches all 4 datasets in parallel
- Build passes with zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1+2: DB-VERIFY and pricing tables migration** - `43b5da6` (feat)
2. **Task 3: OrderOptionsApi module and ApiClient wiring** - `11cd9e9` (feat)

**Plan metadata:** (pending — created in final commit)

## Files Created/Modified
- `supabase/migrations/20260402_order_form_options.sql` - Creates cake_sizes, bread_types, cake_fillings, premium_filling_upcharges with RLS + seed data
- `src/lib/api/modules/orderOptions.ts` - OrderOptionsApi class with CakeSize, BreadType, CakeFilling, PremiumFillingUpcharge, OrderFormOptions interfaces
- `src/lib/api/index.ts` - Added OrderOptionsApi import, private module instance, and getOrderFormOptions bound method

## Decisions Made
- Applied migration via psql direct connection (DATABASE_URL in backend/.env) — Supabase CLI requires a config.toml that this project does not have. Direct psql works reliably with the production DATABASE_URL.
- Seed data uses ASCII-safe representations for special characters (e.g., `Pina` for `Piña`, `Pina Colada` for `Piña Colada`) to avoid SQL encoding issues. The actual display labels in Order.tsx can retain the accent characters — this affects only the DB seed data.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used ASCII-safe Spanish labels in SQL seed data**
- **Found during:** Task 2 (migration creation)
- **Issue:** SQL files with non-ASCII characters (Piña) can cause encoding issues depending on psql locale settings
- **Fix:** Used ASCII equivalents in SQL (Pina, Pina Colada) — only affects DB seed. Order.tsx still uses the correct accented characters displayed to users.
- **Files modified:** supabase/migrations/20260402_order_form_options.sql
- **Verification:** psql applied cleanly, all 14 fillings inserted without encoding errors
- **Committed in:** 43b5da6 (Task 1+2 commit)

---

**Total deviations:** 1 auto-fixed (1 minor seed data encoding)
**Impact on plan:** No scope change. The ASCII simplification only affects internal DB values, not user-facing display.

## Issues Encountered
- **Initial false positive on DB existence check:** `head: true` with `count: 'exact'` returned `count: null` instead of an error for non-existent tables, making it appear the tables existed. Verified by switching to `select('*')` which returned PGRST205 "not in schema cache" errors confirming absence. Resolved by using psql direct connection for both verification and migration.
- **Supabase CLI not applicable:** `npx supabase db push` requires a config.toml file that this project does not have. Used psql with DATABASE_URL from backend/.env instead — clean and reliable.

## User Setup Required
None — migration was applied directly to production Supabase. No manual steps required.

## Next Phase Readiness
- All 4 pricing tables exist in production with correct seed data and RLS
- api.getOrderFormOptions() is callable from Order.tsx
- Plan 04 can now replace hardcoded arrays in Order.tsx with DB-fetched data
- TIME_OPTIONS remain excluded (Phase 5 FIX-07 already handles them via useBusinessHours())

---
*Phase: 08-menu-database-migration-and-price-security*
*Completed: 2026-04-03*

## Self-Check: PASSED

All artifacts verified:
- FOUND: supabase/migrations/20260402_order_form_options.sql
- FOUND: src/lib/api/modules/orderOptions.ts
- FOUND: src/lib/api/index.ts
- FOUND: commit 43b5da6 (migration)
- FOUND: commit 11cd9e9 (OrderOptionsApi)
