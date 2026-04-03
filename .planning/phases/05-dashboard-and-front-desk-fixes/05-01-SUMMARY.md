---
phase: 05-dashboard-and-front-desk-fixes
plan: 01
subsystem: backend
tags: [bug-fix, database, rls, migrations, capacity]
dependency_graph:
  requires: []
  provides: [CMS-RLS, max-daily-capacity-column, capacity-admin-endpoint]
  affects: [FIX-06, MISS-04, MISS-05, MISS-08]
tech_stack:
  added: []
  patterns: [supabase-rls, pg-pool-query]
key_files:
  created:
    - supabase/migrations/20260402_cms_rls_policies.sql
    - supabase/migrations/20260402_add_max_daily_capacity.sql
  modified:
    - backend/routes/capacity.js
    - backend/db/analytics-views.sql
decisions:
  - "Capacity default is 10 (not 20) — matches capacity.js line 102 and capacity-inventory-schema.sql line 10"
  - "business_hours allows baker + owner write (front desk staff need to view/update hours)"
  - "backend/db/ files are reference library only — analytics-views.sql fix is documentation, not a live migration"
metrics:
  duration: "2 minutes"
  completed: "2026-04-03"
  tasks: 3
  files_changed: 4
---

# Phase 5 Plan 01: Backend Bug Fixes and Database Prerequisites Summary

Three backend/database bugs fixed and one missing database column added. These are foundational fixes that unblock Wave 2 frontend work in Phase 5.

## What Was Built

Fixed the `POST /api/capacity/set` admin endpoint (MISS-04), corrected the `v_inventory_usage` analytics view reference file (MISS-05), added RLS policies to all 5 CMS tables (MISS-08), and added the `max_daily_capacity` column prerequisite for FIX-06.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix capacity.js profiles bug + analytics-views used_at bug | 0be5398 | backend/routes/capacity.js, backend/db/analytics-views.sql |
| 2 | Create CMS RLS policies migration | c4fb58f | supabase/migrations/20260402_cms_rls_policies.sql |
| 3 | Create max_daily_capacity column migration | babbf7e | supabase/migrations/20260402_add_max_daily_capacity.sql |

## Decisions Made

1. **Capacity default is 10 (not 20):** The migration sets `DEFAULT 10` matching `capacity.js` line 102 and `capacity-inventory-schema.sql` line 10. Previous documentation had an error.

2. **business_hours write access for baker + owner:** Front desk staff (baker role) need write access to business hours since they manage the kitchen display schedule.

3. **analytics-views.sql is reference library only:** The fix to `iu.used_at` → `iu.created_at` updates the reference file. To apply the live view, the SQL must be run in the Supabase SQL editor separately.

## Success Criteria Verification

- [x] `capacity.js` line 142 reads `SELECT role FROM user_profiles WHERE user_id = $1`
- [x] `analytics-views.sql` has zero occurrences of `iu.used_at` (replaced with `iu.created_at`)
- [x] `supabase/migrations/20260402_cms_rls_policies.sql` exists with 5 RLS blocks
- [x] `supabase/migrations/20260402_add_max_daily_capacity.sql` exists with ADD COLUMN statement
- [x] `npm run build` passes without TypeScript errors

## Deviations from Plan

None — plan executed exactly as written.

## Manual Steps Required (Not Automated)

These migration files need to be applied to the live Supabase database:

1. Run `supabase/migrations/20260402_cms_rls_policies.sql` in Supabase SQL editor
2. Run `supabase/migrations/20260402_add_max_daily_capacity.sql` in Supabase SQL editor
3. Optionally re-run the `v_inventory_usage` view definition from `backend/db/analytics-views.sql` lines 174-190 to fix the live view in production

## Self-Check: PASSED

Files verified to exist:
- backend/routes/capacity.js — FOUND, line 142 has correct query
- backend/db/analytics-views.sql — FOUND, no iu.used_at occurrences
- supabase/migrations/20260402_cms_rls_policies.sql — FOUND, 5 RLS blocks
- supabase/migrations/20260402_add_max_daily_capacity.sql — FOUND, ADD COLUMN statement

Commits verified:
- 0be5398 — FOUND in git log
- c4fb58f — FOUND in git log
- babbf7e — FOUND in git log
