---
phase: 05-dashboard-and-front-desk-fixes
plan: 04
subsystem: ui
tags: [react, supabase, realtime, sonner, typescript, tailwind]

# Dependency graph
requires:
  - phase: 05-01
    provides: max_daily_capacity column in business_settings table (DB prerequisite for FIX-06)

provides:
  - Configurable max daily capacity number input in BusinessSettings Orders tab
  - Non-blocking warning toast when new capacity is below today's order count
  - "Daily capacity updated" targeted toast on capacity change
  - FrontDeskInventory skeleton loading (replaces spinner)
  - FrontDeskInventory isError state with inline error banner and Retry button
  - FrontDeskInventory toast.error with Retry action on fetch failure
  - FrontDeskInventory Supabase channel health monitor (CHANNEL_ERROR + system disconnect handler)
  - DeliveryManagementPanel staffError state with toast.error and Retry action on staff fetch failure
  - DeliveryManagementPanel inline staff data unavailable indicator with Retry button

affects:
  - Phase 6 (Walk-In Order Creation)
  - Phase 7 (Recipe Management)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - sonner toast with action button pattern for retry (toast.error with { action: { label, onClick } })
    - Supabase channel health monitor for realtime connectivity detection
    - isError state pattern alongside isLoading for two-phase async UI states
    - skeleton loading pattern (animated pulse divs) replacing spinner

key-files:
  created: []
  modified:
    - src/components/admin/BusinessSettingsManager.tsx
    - src/components/kitchen/FrontDeskInventory.tsx
    - src/components/kitchen/DeliveryManagementPanel.tsx

key-decisions:
  - "Daily capacity warning is non-blocking: save proceeds after toast.warning fires"
  - "Capacity success toast is targeted: 'Daily capacity updated' when only capacity changed, generic otherwise"
  - "FrontDeskInventory uses a lightweight Supabase channel (no table subscriptions) purely as a health monitor"
  - "CHANNEL_ERROR and system disconnect both trigger isError=true independently"
  - "staffError in DeliveryManagementPanel uses inline underline button (not full error banner) to match existing panel density"
  - "Skeleton loading uses 4 animated pulse bars sized h-16 to approximate inventory card rows"

patterns-established:
  - "Toast with retry pattern: toast.error(message, { action: { label: t('Reintentar','Retry'), onClick: retryFn } })"
  - "isError state pattern: set true on catch, set false at start of retry, separate from isLoading"
  - "Supabase health monitor: supabase.channel('name').subscribe(status => { if (status==='CHANNEL_ERROR') {...} })"

requirements-completed: [FIX-06, FIX-08]

# Metrics
duration: 3min
completed: 2026-04-03
---

# Phase 5 Plan 04: Dashboard & Front Desk Fixes Summary

**Configurable daily capacity input in BusinessSettings plus actionable error/retry states with Supabase channel health monitoring in FrontDeskInventory and DeliveryManagementPanel**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-03T02:20:13Z
- **Completed:** 2026-04-03T02:23:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added max daily capacity number input (min=1, max=100, default=10) to BusinessSettings Orders tab with today's order count comparison warning
- FrontDeskInventory now shows skeleton loading, inline error banner with Retry button, and sonner toast with Retry action on both fetch failure and CHANNEL_ERROR/disconnect events
- DeliveryManagementPanel now shows toast.error with Retry action on staff fetch failure and an inline staff unavailable indicator

## Task Commits

Each task was committed atomically:

1. **Task 1: Add max daily capacity input to BusinessSettingsManager Orders tab (FIX-06)** - `0e0e40f` (feat)
2. **Task 2: Add error states with retry buttons and subscription disconnect handler (FIX-08)** - `9798e38` (feat)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `src/components/admin/BusinessSettingsManager.tsx` - Added supabase import, replaced handleSubmit with capacity-aware version querying today's order count, added Daily Capacity Card with number input in Orders tab
- `src/components/kitchen/FrontDeskInventory.tsx` - Added supabase import, isError state, skeleton loading, inline error banner with Retry, toast.error with Retry on fetch and on CHANNEL_ERROR/disconnect via health monitor channel
- `src/components/kitchen/DeliveryManagementPanel.tsx` - Added staffError state, extracted fetchStaff to standalone function, added toast.error with Retry on failure, added inline staff unavailable indicator

## Decisions Made

- Daily capacity warning is non-blocking: the `toast.warning` fires but `handleSubmit` does not `return` early — the save always proceeds
- Capacity-specific toast message ("Daily capacity updated") is shown only when `settings?.max_daily_capacity !== formData.max_daily_capacity`; other field saves show generic "Settings saved successfully"
- FrontDeskInventory uses a Supabase channel with no table subscriptions as a lightweight connectivity health monitor; CHANNEL_ERROR status fires when the WebSocket fails
- staffError in DeliveryManagementPanel uses a compact inline paragraph with underline Retry button to avoid a heavy error banner that would overpower the stats bar

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Build passed cleanly after both tasks. TypeScript had no errors.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 is now complete: all 4 plans executed (05-01 through 05-04)
- FIX-06 (capacity configurable) and FIX-08 (error states) are resolved
- Phase 6 (Walk-In Order Creation) can begin — no blockers from Phase 5
- The max_daily_capacity DB column was added in 05-01 and is now wired to the UI in 05-04

---
*Phase: 05-dashboard-and-front-desk-fixes*
*Completed: 2026-04-03*
