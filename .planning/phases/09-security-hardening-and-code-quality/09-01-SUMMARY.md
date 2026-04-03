---
phase: 9
plan: "09-01"
subsystem: security
tags: [csrf, security, backend, frontend, middleware]
dependency_graph:
  requires: []
  provides: [SEC-05]
  affects: [backend/server.js, src/lib/api-client.ts]
tech_stack:
  added: [csrf-csrf@4.0.3, cookie-parser@1.4.7]
  patterns: [double-submit-cookie, defense-in-depth, token-injection]
key_files:
  created:
    - backend/middleware/csrf.js
    - src/lib/csrf.ts
  modified:
    - backend/package.json
    - backend/package-lock.json
    - backend/server.js
    - src/lib/api-client.ts
decisions:
  - "csrf-csrf double-submit cookie pattern: sameSite=lax in dev, none+secure in production (cross-origin Vercel/backend)"
  - "CSRF is defense-in-depth only — auth uses Bearer JWT, not cookies — graceful degradation on fetch failure"
  - "Webhook routes excluded from CSRF check by path prefix matching before doubleCsrfProtection runs"
  - "Auto-retry on 403 CSRF_INVALID: clear cached token, fetch fresh, retry once — non-blocking on failure"
  - "Cookie comment updated: /api/webhooks comment now says Stripe (was Square dead code reference)"
metrics:
  duration: "4m 23s"
  completed_date: "2026-04-03"
  tasks_completed: 5
  files_modified: 6
  commits: 5
requirements_satisfied: [SEC-05]
---

# Phase 9 Plan 01: CSRF Protection — Backend Middleware + Frontend Token Injection Summary

**One-liner:** CSRF defense-in-depth via csrf-csrf double-submit cookie pattern with X-CSRF-Token header injection on all Express mutating requests.

## What Was Built

Added CSRF protection to the Express backend and wired the SPA to automatically fetch and send CSRF tokens on state-changing requests. This is defense-in-depth protection — the project already uses Bearer JWT (not cookies) for auth, so CSRF is not strictly required but adds another layer per phase 9 requirements.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| T01 | Install csrf-csrf and cookie-parser | 2e50f65 | backend/package.json, backend/package-lock.json |
| T02 | Create CSRF middleware module | 2201cd2 | backend/middleware/csrf.js (new) |
| T03a | Update server.js CSP cleanup + cookie-parser | 9f342b6 | backend/server.js |
| T03b | Wire CSRF middleware + token endpoint | 719a072 | backend/server.js |
| T04 | Create frontend CSRF token store | 0c393cb | src/lib/csrf.ts (new) |
| T05 | Update api-client.ts CSRF injection | 09ae5b4 | src/lib/api-client.ts |

## Implementation Details

### Backend (csrf.js middleware)
- `doubleCsrf()` from `csrf-csrf` configured with env-driven secret
- Cookie name: `__Host-psifi.x-csrf-token` in production, `x-csrf-token` in dev
- `sameSite: 'none'` + `secure: true` in production (cross-origin Vercel/Express)
- `sameSite: 'lax'` in development (same-origin)
- Ignores GET, HEAD, OPTIONS methods automatically

### Backend (server.js)
- Removed `squarecdn.com` and `squareup.com` from Helmet CSP `scriptSrc` and `connectSrc`
- Added `maps.googleapis.com` and `maps.gstatic.com` to CSP for Google Maps delivery feature
- Updated `crossOriginEmbedderPolicy` comment from "Allow Square SDK" to "Allow Google Maps"
- Registered `cookieParser()` after CORS, before body parsing
- CSRF middleware applied after `validateInput`, with inline webhook exclusion by path prefix
- `GET /api/v1/csrf-token` endpoint added before versioned routes

### Frontend (csrf.ts)
- Module-level `csrfToken` variable caches the fetched token
- Deduplicates concurrent fetches via in-flight `fetchPromise` tracking
- Fetches with `credentials: 'include'` for cookie transport
- Graceful degradation: returns empty string when backend unreachable (no error thrown)
- `clearCsrfToken()` exported for refresh after CSRF validation failure

### Frontend (api-client.ts)
- Imports `getCsrfToken` and `clearCsrfToken` from `@/lib/csrf`
- Fetches CSRF token before building requestHeaders for non-GET/HEAD methods
- Adds `X-CSRF-Token` header when token is available
- Adds `credentials: 'include'` to `requestConfig` for cookie transport
- Auto-retries once on 403 CSRF_INVALID/CSRF-related failures with fresh token

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Comment] Fixed legacy webhook comment referencing Square**
- **Found during:** Final verification pass on server.js
- **Issue:** Legacy `/api/webhooks` route had comment "they're from Square" — Square is dead code since Phase 8
- **Fix:** Updated comment to say "they're from Stripe"
- **Files modified:** backend/server.js

## Verification

- Build: PASSED with zero TypeScript errors
- Spot checks: All 6 must-have criteria verified
- `csrf-csrf` and `cookie-parser` in backend/package.json: confirmed
- `backend/middleware/csrf.js` exports `cookieParser`, `generateToken`, `doubleCsrfProtection`: confirmed
- `src/lib/csrf.ts` exports `getCsrfToken()` and `clearCsrfToken()`: confirmed
- `src/lib/api-client.ts` has `credentials:'include'`, CSRF import, X-CSRF-Token injection: confirmed
- No `squarecdn.com` or `squareup.com` in CSP: confirmed (grep returns 0)
- Webhook path exclusion in doubleCsrfProtection wrapper: confirmed

## Self-Check: PASSED

All created files exist. All commits verified. Build passes.
