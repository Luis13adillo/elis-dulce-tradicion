---
phase: 08-menu-database-migration-and-price-security
plan: "02"
subsystem: auth
tags: [react, typescript, validation, security, password, forms]

# Dependency graph
requires: []
provides:
  - Password complexity validation function (validatePassword) in Signup.tsx
  - Bilingual error messages for all 5 password rules
affects: [09-security-hardening-and-code-quality]

# Tech tracking
tech-stack:
  added: []
  patterns: [validatePassword pure function above component declaration, bilingual error string with "/" separator for pre-t() context]

key-files:
  created: []
  modified:
    - src/pages/Signup.tsx

key-decisions:
  - "Error strings are pre-bilingual (Spanish / English in one string) because validatePassword runs outside the t() hook context"
  - "minLength HTML attribute updated from 6 to 8 to match the new validation rule"

patterns-established:
  - "validatePassword: pure function declared above component — testable in isolation, no hook dependency"
  - "Pre-bilingual error strings: 'Spanish text / English text' acceptable when t() is not available at call site"

requirements-completed: [SEC-04]

# Metrics
duration: 2min
completed: 2026-04-03
---

# Phase 08 Plan 02: Password Complexity Validation Summary

**Replaced weak 6-char password check with validatePassword() enforcing 8 chars, uppercase, lowercase, number, and special character — bilingual error messages for each rule**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-03T05:03:47Z
- **Completed:** 2026-04-03T05:05:01Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `validatePassword()` pure function above the `Signup` component declaration
- Replaced the old `password.length < 6` check with the new 5-rule validation via `validatePassword()`
- All error messages are bilingual (Spanish / English) in a single string, usable before `t()` context is available
- Updated `minLength` HTML attribute on both password inputs from `6` to `8` to stay consistent with validation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add password complexity validation to Signup.tsx** - `b05ec5d` (feat)

**Plan metadata:** _(docs commit follows)_

## Files Created/Modified
- `src/pages/Signup.tsx` - Added `validatePassword()` helper, replaced weak check, updated minLength attributes

## Decisions Made
- Error strings are pre-bilingual (`"Spanish / English"`) because `validatePassword()` is a pure function declared outside the component and has no access to `t()`. This matches the existing bilingual pattern used in the project.
- Updated `minLength={8}` on both password inputs to keep the HTML5 browser-level validation consistent with the JavaScript validation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Self-Check: PASSED

- `src/pages/Signup.tsx` — FOUND
- `08-02-SUMMARY.md` — FOUND
- Commit `b05ec5d` — FOUND

## Next Phase Readiness
- Password security requirement SEC-04 complete
- Ready for Plan 03 (server-side price validation / pricing migration)

---
*Phase: 08-menu-database-migration-and-price-security*
*Completed: 2026-04-03*
