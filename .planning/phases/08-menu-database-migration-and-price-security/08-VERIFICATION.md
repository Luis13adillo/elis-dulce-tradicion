---
phase: 08-menu-database-migration-and-price-security
verified: 2026-04-03T06:00:00Z
status: human_needed
score: 4/5 success criteria verified
re_verification: false
human_verification:
  - test: "Navigate to Owner Dashboard and look for any UI to edit cake sizes, bread types, or fillings"
    expected: "No such UI exists in Phase 8 — owner must use Supabase Table Editor directly. Verify that the ROADMAP Success Criterion 2 ('Menu changes work from the Owner Dashboard') is intentionally deferred."
    why_human: "Success Criterion 2 in ROADMAP.md says changes work 'from the Owner Dashboard'. The CONTEXT.md and plan explicitly deferred Owner Dashboard UI to a future phase. Cannot programmatically verify whether this intent was user-accepted or is a scope gap."
  - test: "Place a test order through the order wizard (Steps 2-3 for sizes and fillings)"
    expected: "Size and filling options are loaded from the database (not from hardcoded JS). A brief loading skeleton (6 pulsing blocks) appears on the size step and the bread/filling step while options fetch."
    why_human: "Cannot verify database fetch vs. fallback behavior without a running app. The code path is wired correctly but real-time DB connectivity needs human confirmation."
  - test: "Attempt to register with password 'abc123' then with 'Abc123!!'"
    expected: "First attempt shows a bilingual error about password requirements. Second attempt proceeds normally."
    why_human: "Validates the actual user-facing error message display and form behavior in browser."
---

# Phase 8: Menu Database Migration & Price Security — Verification Report

**Phase Goal:** Remove Square dead code, harden password requirements, migrate order form options to DB, add server-side price validation
**Verified:** 2026-04-03
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | Order.tsx reads all menu options from the database via API | VERIFIED | `api.getOrderFormOptions()` called in `useEffect` on mount (Order.tsx line 272); `activeCakeSizes`, `activeBreadTypes`, `activeFillings`, `activePremiumOptions` derived from DB result with FALLBACK_ arrays as graceful degradation |
| 2 | Menu changes work from the Owner Dashboard without code redeployment | PARTIAL | Data is in DB (not hardcoded) so changes don't require code deployment, but the ROADMAP says "from the Owner Dashboard" — no Owner Dashboard UI for editing pricing tables was built. CONTEXT.md explicitly deferred this: "Owner uses Supabase Table Editor directly." |
| 3 | Backend recalculates order total and rejects mismatches | VERIFIED | `backend/routes/orders.js` lines 196-263 contain price validation block; queries `cake_sizes`, `cake_fillings`, `premium_filling_upcharges`; logs `PRICE_MISMATCH_DETECTED` to `audit_logs`; returns generic 400 on mismatch; skips legacy orders lacking `cake_size_value` |
| 4 | No Square payment code remains in the codebase (active paths) | VERIFIED | `src/lib/square.ts` deleted; `src/components/payment/SquarePaymentForm.tsx` deleted; `backend/routes/payments.js` stripped from 568 to 33 lines — only `GET /order/:orderId` remains. Note: `backend/routes/payments-sqlite.js` still contains Square imports but is dead code (only used by the inactive `sqlite-server.js`) — explicitly deferred to Phase 9 |
| 5 | Signup enforces password complexity beyond length >= 6 | VERIFIED | `validatePassword()` pure function in `Signup.tsx` (lines 14-31) enforces: ≥8 chars, uppercase, lowercase, digit, special character; old `length < 6` check removed; bilingual error messages; both password inputs updated to `minLength={8}` |

**Score:** 4/5 success criteria verified (1 needs human clarification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `backend/routes/payments.js` | Stripe-only routes, no Square | VERIFIED | 33 lines; contains only `GET /order/:orderId`; zero Square SDK imports |
| `src/lib/square.ts` | Deleted | VERIFIED | File does not exist on disk |
| `src/components/payment/SquarePaymentForm.tsx` | Deleted | VERIFIED | File does not exist on disk |
| `src/pages/Signup.tsx` | Contains `validatePassword` | VERIFIED | `validatePassword()` declared at line 14; 5 rules enforced; `validatePassword(formData.password)` called at line 63 |
| `supabase/migrations/20260402_order_form_options.sql` | Schema + seed for 4 tables | VERIFIED | 140 lines; creates `cake_sizes`, `bread_types`, `cake_fillings`, `premium_filling_upcharges`; seeds 8+3+14+2 rows; RLS enabled on all 4 tables |
| `src/lib/api/modules/orderOptions.ts` | OrderOptionsApi class | VERIFIED | Exports `OrderOptionsApi`, `OrderFormOptions`, and all 4 data interfaces; queries all 4 tables via `Promise.all`; returns empty arrays as safe fallback |
| `src/lib/api/index.ts` | `getOrderFormOptions` on singleton | VERIFIED | `OrderOptionsApi` imported at line 7; private module instance at line 18; bound method at line 63 |
| `src/pages/Order.tsx` | DB-driven form with fallback | VERIFIED | Imports `api` and `OrderFormOptions`; `FALLBACK_*` arrays defined; `orderOptions` and `optionsLoading` state; `useEffect` with `api.getOrderFormOptions()` on mount; `activeCakeSizes/Bread/Fillings/PremiumOptions` derived; loading skeletons on steps 2 and 3; `cake_size_value` and `filling_values` added to order payload |
| `backend/routes/orders.js` | Server-side price validation | VERIFIED | `cake_size_value` and `filling_values` destructured at lines 192-193; price validation block at lines 196-263; `PRICE_MISMATCH_DETECTED` logged; generic `ORDER_INVALID` 400 returned on mismatch |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `backend/routes/payments.js` | Square npm package | import statement | NOT_WIRED (correct) | `grep -c "SquareClient\|squareClient\|SquareEnvironment\|paymentsApi\|refundsApi"` returns 0 — Square removed as intended |
| `src/lib/api/modules/orderOptions.ts` | Supabase tables: cake_sizes, bread_types, cake_fillings, premium_filling_upcharges | `sb.from('cake_sizes').select('*').eq('active', true)` | VERIFIED | All 4 table queries present using the exact pattern from the plan |
| `src/lib/api/index.ts` | `src/lib/api/modules/orderOptions.ts` | `import + bind in ApiClient` | VERIFIED | `import { OrderOptionsApi } from './modules/orderOptions'` at line 7; `getOrderFormOptions = this.orderOptionsModule.getOrderFormOptions.bind(this.orderOptionsModule)` at line 63 |
| `src/pages/Order.tsx` | `api.getOrderFormOptions()` | `useEffect` on mount | VERIFIED | `api.getOrderFormOptions().then(...).catch(...).finally(...)` at lines 272-285; `setOrderOptions` stores result; `setOptionsLoading(false)` on completion |
| `backend/routes/orders.js` | Supabase tables via pool.query | `cake_size_value` validation before INSERT | VERIFIED | `SELECT price FROM cake_sizes WHERE value = $1` at line 201; `SELECT COUNT(*) as cnt FROM cake_fillings WHERE value = ANY($1) AND is_premium = true` at line 212; `SELECT upcharge FROM premium_filling_upcharges WHERE size_value = $1` at line 222; `ROLLBACK` + `sendError` on mismatch |

### Requirements Coverage

The requirements IDs used in these plans (SEC-01, SEC-02, SEC-03, SEC-04, DB-VERIFY) are defined in ROADMAP.md under Phase 8, not in `.planning/REQUIREMENTS.md` (which covers an older set of email/notification requirements from a prior planning cycle). All five phase-8 requirements are covered:

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|---------|
| SEC-01 | 08-03, 08-04 | Move hardcoded cake sizes, bread types, fillings, premium upcharges from Order.tsx to DB tables | SATISFIED | 4 tables created and seeded; Order.tsx reads from DB via `getOrderFormOptions()` |
| SEC-02 | 08-04 | Add server-side price recalculation on order creation | SATISFIED | `PRICE_MISMATCH_DETECTED` block in `backend/routes/orders.js` before INSERT |
| SEC-03 | 08-01 | Remove Square dead code from active codebase | SATISFIED | Square files deleted; payments.js stripped to Stripe-only; `backend/routes/payments-sqlite.js` explicitly deferred (inactive path) |
| SEC-04 | 08-02 | Add password complexity requirements on signup | SATISFIED | `validatePassword()` in Signup.tsx enforces 5 rules beyond the old `length >= 6` |
| DB-VERIFY | 08-03 | Query production Supabase to confirm which schemas are applied | SATISFIED | Summary documents 43 tables found; 4 pricing tables confirmed absent before migration and applied via psql |

Note on REQUIREMENTS.md orphans: The existing `.planning/REQUIREMENTS.md` (EMAIL-01 through UX-05) does not map any requirements to Phase 8. There are no orphaned requirements for this phase in that document. The phase-specific requirements (SEC-01 through DB-VERIFY) are inline in ROADMAP.md Phase 8.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/test/mocks/square.ts` | 1-21 | Square test mock file still exists | Info | Only referenced by `src/test/mocks/square.ts` itself (self-referential export); not imported by any active test file. Pre-existing test scaffold — does not affect production bundle. |
| `backend/routes/payments-sqlite.js` | — | Square SDK imports (43 matches) | Info | Only used by `backend/sqlite-server.js` (inactive alternative server). Not imported by `backend/server.js`. Explicitly deferred to Phase 9 per `deferred-items.md`. |
| `src/pages/Privacy.tsx` | 71 | References Square in privacy policy text | Info | Legal copy references Square as payment processor — cosmetic, not code. Does not affect functionality. |
| `src/pages/Legal/PrivacyPolicy.tsx` | 89, 144 | References Square in legal text | Info | Same as above — static legal text, not active code. |
| `src/pages/Legal/TermsOfService.tsx` | 100 | References Square in legal text | Info | Same as above — static legal text. |
| `src/pages/FAQ.tsx` | 80-81 | References Square as accepted payment method | Warning | FAQ tells customers Square is accepted. Since Stripe is the active provider, this is factually incorrect content — but out of scope for this phase and does not block goal achievement. |
| `src/lib/cancellation.ts` | 28 | `squareRefundId?: string` field in type | Info | Database field name, not active Square code — column exists in DB schema from before Square was removed. |
| `src/pages/OrderConfirmation.tsx` | 47 | `sessionStorage.removeItem('squareOrderId')` | Info | Clearing a legacy sessionStorage key that is never set by the current Stripe flow. Harmless cleanup that was missed. |

No blockers. All anti-patterns are in legacy/legal text or explicitly deferred dead code.

### Human Verification Required

#### 1. Success Criterion 2: Owner Dashboard Menu Management

**Test:** Log in as the owner (`owner@elisbakery.com`) and navigate through the Owner Dashboard. Look for any UI to add/edit/remove cake sizes, bread types, fillings, or pricing upcharges.
**Expected:** No such UI exists. The plan explicitly scoped this to Supabase Table Editor only. The CONTEXT.md states: "No Owner Dashboard UI for editing these options in Phase 8 — owner uses Supabase Table Editor directly." This is a known scope deferral, not a bug.
**Why human:** The ROADMAP Success Criterion 2 says "Menu changes work from the Owner Dashboard without code redeployment." This is technically satisfied (data is in DB, so changes via Supabase Table Editor don't require code deployment), but the literal wording implies an Owner Dashboard UI. A human needs to confirm whether this interpretation is acceptable or whether an Owner Dashboard UI is required before the phase can be marked fully complete.

#### 2. Database Options Load in Order Form

**Test:** Open the order wizard (`/order`) in a browser. Complete Step 1 (date/time), then advance to Step 2 (size selection) and Step 3 (bread/filling).
**Expected:** Briefly see loading skeletons (animated pulse blocks) on Steps 2 and 3 before options appear. Sizes, bread types, and fillings should come from the database. Open browser DevTools → Network tab and confirm requests to the Supabase REST API for `cake_sizes`, `bread_types`, `cake_fillings`, `premium_filling_upcharges`.
**Why human:** Cannot confirm actual network traffic and DB connectivity without a running app.

#### 3. Password Complexity Enforcement

**Test:** Navigate to `/signup`. Submit the form with password `abc123`. Then retry with `Abc123!!`.
**Expected:** First attempt shows bilingual error: "La contraseña debe tener al menos 8 caracteres / Password must be at least 8 characters" (or the specific failing rule). Second attempt proceeds to the signUp call.
**Why human:** Validates actual browser-rendered form behavior and error display.

### Gaps Summary

No blocking gaps were found in the implementation. All four plan objectives are implemented and wired:

1. **SEC-03 (Square removal):** Fully executed. `square.ts` and `SquarePaymentForm.tsx` deleted. `payments.js` stripped to 33 lines. Remaining Square references are in inactive dead code (`payments-sqlite.js`) and legal/FAQ text — all noted and either deferred or cosmetic.

2. **SEC-04 (Password complexity):** Fully executed. `validatePassword()` function in `Signup.tsx` enforces all 5 rules. Old `length < 6` check removed. Bilingual error messages. Build passes.

3. **DB-VERIFY + SEC-01 (DB migration + API):** Migration file exists and was applied to production Supabase. `OrderOptionsApi` module created and wired into the `api` singleton. All 4 tables with seed data.

4. **SEC-01 + SEC-02 (Frontend wiring + server validation):** `Order.tsx` fetches from DB with `FALLBACK_*` arrays as graceful degradation. Loading skeletons rendered. `cake_size_value` and `filling_values` included in order payload. `backend/routes/orders.js` validates price before INSERT. `PRICE_MISMATCH_DETECTED` logged to `audit_logs` on mismatch.

The only open item is the **interpretation of Success Criterion 2** regarding Owner Dashboard vs. Supabase Table Editor — a human needs to confirm whether this scope deferral (documented in CONTEXT.md) is acceptable for phase completion.

---

_Verified: 2026-04-03_
_Verifier: Claude (gsd-verifier)_
