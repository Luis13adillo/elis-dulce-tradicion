---
phase: 10-post-launch-polish
plan: "04"
subsystem: auth-session
tags: [session-timeout, auth, security, admin, owner-dashboard, front-desk]
dependency_graph:
  requires: [10-03]
  provides: [AUTH-02]
  affects: [src/pages/OwnerDashboard.tsx, src/pages/FrontDesk.tsx, src/pages/Login.tsx, src/components/admin/BusinessSettingsManager.tsx]
tech_stack:
  added: []
  patterns: [callback-pattern, useInactivityTimeout, SessionTimeoutModal, non-dismissable-dialog]
key_files:
  created:
    - supabase/migrations/20260404_session_timeout.sql
    - src/hooks/useInactivityTimeout.ts
    - src/components/auth/SessionTimeoutModal.tsx
  modified:
    - src/pages/OwnerDashboard.tsx
    - src/pages/FrontDesk.tsx
    - src/pages/Login.tsx
    - src/components/admin/BusinessSettingsManager.tsx
    - src/lib/cms.ts
decisions:
  - "useInactivityTimeout rebuilt with callback-only pattern (no signOut/navigate inside hook) to prevent redirect loops"
  - "sessionTimeoutMinutes fetched per-component via dynamic import of supabase client to avoid effect coupling"
  - "SessionTimeoutModal placed outside dark mode wrapper in FrontDesk to avoid z-index issues"
  - "session_timeout_minutes stored in business_settings table (DEFAULT 30 minutes)"
metrics:
  duration: "6 minutes"
  completed: "2026-04-03"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 8
---

# Phase 10 Plan 04: Configurable Session Timeout Summary

Rebuilt session timeout system for admin accounts using a callback-only pattern that avoids redirect loops. Default 30-minute timeout, configurable by owner from Business Settings. A blocking modal appears 2 minutes before expiry with "Stay Logged In" and "Sign Out" options.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | DB migration + rebuilt hook + modal | 29a31fc | 20260404_session_timeout.sql, useInactivityTimeout.ts, SessionTimeoutModal.tsx |
| 2 | Wire dashboards + settings UI + Login toast | 7663be8 | OwnerDashboard.tsx, FrontDesk.tsx, Login.tsx, BusinessSettingsManager.tsx, cms.ts |

## What Was Built

### DB Migration (`supabase/migrations/20260404_session_timeout.sql`)
Added `session_timeout_minutes INTEGER NOT NULL DEFAULT 30` to `business_settings` table. Migration applied to production Supabase via psql.

### Rebuilt `useInactivityTimeout.ts`
Completely replaced the old hook which caused redirect loops by calling `signOut()` and `navigate()` directly inside the hook. The new version:
- Accepts `{ timeoutMs, warningMs?, onWarn, onExpire }` callbacks
- Fires `onWarn` at `timeoutMs - warningMs` (default: 2 min warning before expiry)
- Fires `onExpire` at `timeoutMs`
- Throttles activity events (max 1 reset per second)
- Returns a `resetTimers()` function for the "Stay Logged In" button
- Has ZERO imports of `useAuth` or `useNavigate`

### `SessionTimeoutModal.tsx`
Non-dismissable Dialog component (blocks Escape key and overlay click). Shows countdown seconds remaining. Two buttons: "Cerrar sesion / Sign Out" (outline) and "Seguir conectado / Stay Logged In" (default/primary).

### OwnerDashboard.tsx + FrontDesk.tsx
Both wired with:
- `sessionTimeoutMinutes` state (default 30), fetched from `business_settings` on mount
- `useInactivityTimeout` with `onWarn: () => setShowTimeoutWarning(true)` and `onExpire: () => signOut() + navigate('/login', { state: { sessionExpired: true } })`
- Countdown `useEffect` that ticks down `secondsLeft` while modal is shown
- `SessionTimeoutModal` rendered in JSX with `resetTimers()` wired to "Stay Logged In"

FrontDesk's modal is placed outside the `KitchenRedesignedLayout` (which wraps dark mode content) to avoid z-index issues.

### BusinessSettingsManager.tsx
Added "Session Security" card in the Orders tab with:
- Label: "Tiempo de sesion (minutos) / Session Timeout (minutes)"
- Input: type=number, min=5, max=480, step=5
- Saves to `business_settings.session_timeout_minutes` via existing `updateMutation`

### Login.tsx
Added `useEffect` that calls `toast.info('Tu sesion expiro por inactividad / Your session expired due to inactivity')` when `location.state?.sessionExpired` is `true`.

## Verification

```
grep -n "useInactivityTimeout" src/pages/OwnerDashboard.tsx  -> line 67 (import), 138 (hook call)
grep -n "useInactivityTimeout" src/pages/FrontDesk.tsx       -> line 32 (import), 88 (hook call)
grep -n "session_timeout_minutes" src/components/admin/BusinessSettingsManager.tsx -> 5 lines
grep -n "sessionExpired" src/pages/Login.tsx                 -> lines 29, 33, 36
grep -n "signOut|navigate" src/hooks/useInactivityTimeout.ts -> 1 line (comment only, not code)
npm run build                                                -> exit 0
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one minor addition:

**1. [Rule 2 - Enhancement] Added session_timeout_minutes to BusinessSettings TypeScript type**
- **Found during:** Task 2
- **Issue:** `cms.ts` `BusinessSettings` interface was missing the new field, which would cause TypeScript errors in BusinessSettingsManager.tsx when binding the form state
- **Fix:** Added `session_timeout_minutes?: number` to `BusinessSettings` interface in `src/lib/cms.ts`
- **Files modified:** `src/lib/cms.ts`
- **Commit:** 7663be8

**2. [Rule 2 - Enhancement] Added specific toast message for session timeout changes**
- **Found during:** Task 2
- **Issue:** The plan mentioned adding the save handler but the original code only had a generic "settings saved" message
- **Fix:** Added `timeoutChanged` check alongside existing `capacityChanged` check to show targeted "Session timeout updated" message
- **Files modified:** `src/components/admin/BusinessSettingsManager.tsx`
- **Commit:** 7663be8

## Self-Check: PASSED

All created files exist on disk. Both task commits verified in git log.
