# Deferred Items — Phase 08

## Out-of-Scope Discoveries

### 1. backend/routes/payments-sqlite.js — Square imports remain

**Found during:** Task 2 (Strip Square code from backend/routes/payments.js)
**File:** `backend/routes/payments-sqlite.js`
**Issue:** Contains `import pkg from 'square'` and full Square SDK initialization. Only imported by `backend/sqlite-server.js`, which is an alternative SQLite-based server (dead code — not referenced by the active `backend/server.js`).
**Why deferred:** This file is pre-existing dead code outside the scope of 08-01-PLAN.md (which scopes only to `backend/routes/payments.js`). The active Express server does not reference it. The Vite frontend build does not reference it. Removing it does not affect the active application.
**Recommendation:** Delete both `backend/routes/payments-sqlite.js` and `backend/sqlite-server.js` in Phase 9 (Security Hardening & Code Quality) as part of dead code removal.
