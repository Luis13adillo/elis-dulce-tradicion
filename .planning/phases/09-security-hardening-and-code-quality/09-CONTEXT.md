# Phase 9: Security Hardening & Code Quality - Context

**Gathered:** 2026-04-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Add CSRF protection across all state-changing backend routes, enable the delivery option in the customer order flow (wiring up the existing AddressVerification.tsx), and refactor Order.tsx (1,004 lines → 5 step components) and ReportsManager.tsx (854 lines → separate report components) for maintainability. No new capabilities — strictly security hardening, delivery enablement, and code quality.

</domain>

<decisions>
## Implementation Decisions

### Delivery UX — Address input placement
- Address input appears in **Step 5 (Contact Info)** — delivery address collected alongside name, phone, email
- Google Maps autocomplete fires as customer types; address validation runs on **blur** (when customer leaves the field)
- Delivery fee is shown **as soon as the address is validated** (before Stripe payment page) — no surprises at checkout

### Delivery UX — Out-of-zone behavior
- If address is outside delivery zone: show clear error message and **automatically switch back to Pickup**
- Customer does not need to manually toggle — the revert is automatic with a visible explanation

### Order step navigation
- Every step has a **Back button** that preserves all previously entered data
- Going back and editing an earlier step **keeps all later step data as-is** — no cascading resets
- Completed steps show a **key-selection summary below the step number** in the step indicator (e.g., "1 ✓ Date: March 5 • 2:00 PM")
- **Clicking a completed step in the indicator jumps directly there** — the indicator is interactive, not just decorative

### Refactor intent — Order.tsx
- **Strictly structural** — behavior identical before and after the split; no visible UX changes
- **Parent Order.tsx holds all state** and passes it to step components via props + callbacks
- **Each step component owns its own validation** (DateTimeStep validates date/time, SizeStep validates size, etc.)

### Refactor intent — ReportsManager.tsx
- **Strictly structural** — no visible changes, no behavioral changes
- **Shared parent (ReportsManager) fetches all data** and passes props down to each report component (RevenueReport, OrderVolumeReport, CustomerReport, InventoryReport)

### CSRF — Scope
- **All state-changing routes (POST/PUT/DELETE)** require a CSRF token — maximum coverage across the entire backend

### CSRF — Token transmission
- Tokens sent via **HTTP header (X-CSRF-Token)** — standard SPA pattern, compatible with existing API client (Fetch/Axios-based)
- Token fetched **once on app load** from GET /api/csrf-token, stored in memory for the session
- Token is **refreshed automatically after a validation failure** before retrying

### CSRF — Failure behavior
- When CSRF validation fails: show **toast error + automatically retry once** with a fresh token
- Message: something like "Something went wrong, trying again..." — transparent to the user if the retry succeeds
- If retry also fails, surface a persistent error

### Claude's Discretion
- CSRF token storage mechanism in the frontend (module-level variable, Zustand, etc.)
- Exact toast wording and timing
- How the API client intercepts and attaches the CSRF header to all requests

</decisions>

<specifics>
## Specific Ideas

- The delivery option currently exists in Order.tsx with `cursor-not-allowed` styling — just remove the disabled state and wire up AddressVerification.tsx (already 551 LOC, already exists)
- Step indicator interaction (click to jump) should feel native — make completed steps visually clickable (pointer cursor, hover state)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-security-hardening-and-code-quality*
*Context gathered: 2026-04-03*
