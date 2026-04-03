---
phase: 10-post-launch-polish
plan: "03"
subsystem: auth
tags: [supabase, mfa, totp, react, shadcn, otp]

# Dependency graph
requires:
  - phase: 03-dashboard-verification
    provides: OwnerDashboard and FrontDesk page components that are wrapped
  - phase: 05-dashboard-and-front-desk-fixes
    provides: finalized dashboard structure that AAL wrapper is applied to
provides:
  - TOTP enrollment UI with QR code + second-device recovery
  - TOTP challenge screen for already-enrolled users
  - AAL wrapper component gating dashboard access on MFA verification
  - OwnerDashboard wrapped with owner-role MFA gate
  - FrontDesk wrapped with baker-role optional MFA gate
affects: [auth, OwnerDashboard, FrontDesk, login]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AAL enforcement via AuthenticatorAssuranceCheck wrapper component"
    - "Supabase TOTP MFA: enroll → challenge → verify → refreshSession"
    - "Auto-submit OTP input when 6 digits entered via useEffect on code"
    - "Fail open on AAL API error (don't block dashboard on transient errors)"

key-files:
  created:
    - src/components/auth/EnrollMFA.tsx
    - src/components/auth/MFAChallengeScreen.tsx
    - src/components/auth/AuthenticatorAssuranceCheck.tsx
  modified:
    - src/pages/OwnerDashboard.tsx
    - src/pages/FrontDesk.tsx

key-decisions:
  - "Supabase does not support backup codes — second TOTP factor on another device is the documented recovery mechanism; EnrollMFA includes a second-device enrollment section"
  - "AuthenticatorAssuranceCheck fails open on AAL API error — transient API failures should not lock out admins"
  - "AuthenticatorAssuranceCheck does NOT call signOut() or navigate() — ProtectedRoute handles unauthenticated access; this component only gates content display"
  - "Baker MFA is optional: if baker has no TOTP factor, AAL nextLevel stays aal1, check passes, baker sees dashboard"
  - "Owner MFA enforcement requires Supabase project setting (Require MFA for user) — AAL check alone is insufficient without that config"

patterns-established:
  - "AAL wrapper pattern: wrap return JSX with <AuthenticatorAssuranceCheck userRole='role'> to add MFA gate"
  - "TOTP flow: enroll() to get factorId + QR, challenge(factorId) to get challengeId, verify(factorId, challengeId, code), refreshSession()"

requirements-completed:
  - AUTH-01

# Metrics
duration: 4min
completed: 2026-04-03
---

# Phase 10 Plan 03: 2FA/MFA for Admin Accounts Summary

**TOTP 2FA for admin dashboards using Supabase MFA APIs: QR enrollment, auto-submit challenge screen, and AAL wrapper gating OwnerDashboard (required) and FrontDesk (optional)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-03T14:35:42Z
- **Completed:** 2026-04-03T14:39:55Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 modified)

## Accomplishments
- Created EnrollMFA.tsx: QR code display via `data:image/svg+xml` encoding, InputOTP 6-digit entry, challenge+verify+refreshSession flow, second-device recovery section (Supabase TOTP instead of backup codes)
- Created MFAChallengeScreen.tsx: lists factors on mount, creates challenge, auto-submits OTP on 6 digits, error handling with code reset
- Created AuthenticatorAssuranceCheck.tsx: AAL gate that detects if session needs aal2, shows enrollment or challenge, fails open on API errors; customer role always passes through
- Wired both dashboards: OwnerDashboard wrapped with `userRole="owner"` (MFA required), FrontDesk wrapped with `userRole="baker"` (optional — passes through if no TOTP factor enrolled)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create EnrollMFA and MFAChallengeScreen components** - `798de71` (feat)
2. **Task 2: Create AuthenticatorAssuranceCheck and wire to dashboards** - `a9204a5` (feat)

**Plan metadata:** (docs commit — see final commit)

## Files Created/Modified
- `src/components/auth/EnrollMFA.tsx` - TOTP enrollment: QR code, OTP input, challenge+verify flow, second-device recovery option
- `src/components/auth/MFAChallengeScreen.tsx` - TOTP challenge for enrolled users: listFactors on mount, auto-submit on 6 digits
- `src/components/auth/AuthenticatorAssuranceCheck.tsx` - AAL wrapper: routes to EnrollMFA or MFAChallengeScreen based on factor enrollment and session level
- `src/pages/OwnerDashboard.tsx` - Import + wrapped return JSX with `<AuthenticatorAssuranceCheck userRole="owner">`
- `src/pages/FrontDesk.tsx` - Import + wrapped return JSX with `<AuthenticatorAssuranceCheck userRole="baker">`

## Decisions Made
- Supabase does not support backup codes — second TOTP factor on another device is the documented recovery mechanism. EnrollMFA includes a "Recovery Access" section that initiates a second `supabase.auth.mfa.enroll()` call for a backup device.
- AuthenticatorAssuranceCheck fails open on AAL API error. Transient Supabase errors should not block dashboard access for legitimate admins.
- The wrapper does NOT call `signOut()` or `navigate()` — ProtectedRoute handles unauthenticated access. This component only gates content display.
- Owner MFA enforcement requires the Supabase project to have "Require MFA" configured for the owner account. Without that server-side setting, `nextLevel` will be `aal1` even for owner accounts. A comment in OwnerDashboard.tsx documents this manual setup step.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**MFA requires manual Supabase configuration before it takes effect for owner accounts:**

1. Log in to [supabase.com](https://supabase.com) → your project
2. Go to Authentication → Users → find `owner@elisbakery.com`
3. Enable "Require MFA" for this user
4. Without this setting, `getAuthenticatorAssuranceLevel()` returns `nextLevel: 'aal1'` for owner accounts and the MFA gate never triggers

**For baker accounts (orders@elisbakery.com):** MFA is optional — no Supabase setting needed. If the baker enrolls TOTP manually, they will be challenged on next login.

## Next Phase Readiness
- AUTH-01 complete: MFA components built and wired to both dashboards
- Phase 10 continues with remaining plans (session timeout, JSON-LD structured data)
- No blockers

---
*Phase: 10-post-launch-polish*
*Completed: 2026-04-03*
