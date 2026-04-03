# Phase 10: Post-Launch Polish - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add automated testing, admin security features, and SEO improvements. This phase delivers: (1) Vitest unit tests for core business logic + Playwright E2E tests with CI integration, (2) 2FA/MFA for admin accounts + session timeout with configurable duration, (3) JSON-LD structured data on homepage and menu pages + updated sitemap.

</domain>

<decisions>
## Implementation Decisions

### Test scope & priorities
- Pricing logic (pricing.ts, order total calculations) and order state transitions (orderStateMachine.ts) are co-equal first priorities — both must be covered
- No coverage percentage target — test what matters (business-critical logic), not chase a number
- E2E tests: Rewrite Playwright specs from scratch (existing specs are stale scaffolds with wrong routes/credentials)
- E2E coverage: 2-3 scenarios — happy path (Homepage → Order wizard → Stripe test mode → Confirmation), one failure case (e.g., invalid card), owner login flow
- E2E uses real Supabase test project (not mocked), closer to production reality
- CI: GitHub Actions workflow from the start — block merges if tests fail
- Unit tests run in CI; E2E tests also run in CI (not local-only)

### 2FA/MFA
- Required for owner account, optional for baker account
- Setup flow: Owner is prompted to enroll immediately after first login — cannot skip if owner role
- Enrollment shows QR code for authenticator app (TOTP)
- Recovery: Backup codes generated at setup time — owner saves them
- Scope: Admin accounts only (owner + baker) — no 2FA for customers

### Session timeout
- Configurable by the owner via Owner Dashboard settings UI (not hardcoded)
- Default: 30 minutes of inactivity
- Warning: Blocking modal appears 2 minutes before expiry with "Stay logged in" button
- After auto-logout: Redirect to /login with "session expired" message displayed
- Scope: Admin accounts only (owner + baker roles) — not customers

### SEO structured data
- JSON-LD implementation: react-helmet-async, per-page injection
- Pages: Homepage gets LocalBusiness schema; Menu/product pages get BakeryProduct schema
- LocalBusiness schema includes: name, address, phone, business hours, cuisine type, price range
- Sitemap: Update /public/sitemap.xml manually (static file) — include all current public pages with correct dates

### Claude's Discretion
- Exact GitHub Actions workflow configuration (Node version, caching strategy)
- Specific Vitest test file structure and naming conventions
- Playwright config details (browser targets, timeouts, retry counts)
- Exact TOTP library choice for 2FA (Supabase MFA supports TOTP natively)
- Specific session timeout hook implementation pattern (rebuild useInactivityTimeout cleanly)
- BakeryProduct schema field selection for individual cake pages

</decisions>

<specifics>
## Specific Ideas

- The previous `useInactivityTimeout` hook was removed because it caused redirect loops and session instability — the rebuilt version must NOT duplicate auth checks that ProtectedRoute already handles
- Session timeout modal must handle the case where the user is mid-form (e.g., filling in an order note) — "Stay logged in" resets the timer without disrupting their work
- E2E tests should use the existing test accounts: owner@elisbakery.com / ElisBakery123, orders@elisbakery.com / OrdersElisBakery123
- The Playwright config exists at project root — just needs correct baseURL and credential setup
- Vitest is already configured (npm run test) — just needs test files in src/__tests__/ or colocated .test.ts files

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-post-launch-polish*
*Context gathered: 2026-04-03*
