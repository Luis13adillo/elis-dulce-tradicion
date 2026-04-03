# Phase 10: Post-Launch Polish - Research

**Researched:** 2026-04-03
**Domain:** Testing infrastructure, Supabase MFA, session timeout, SEO structured data
**Confidence:** HIGH (testing + SEO), MEDIUM (MFA recovery flow details)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Test scope & priorities
- Pricing logic (pricing.ts, order total calculations) and order state transitions (orderStateMachine.ts) are co-equal first priorities — both must be covered
- No coverage percentage target — test what matters (business-critical logic), not chase a number
- E2E tests: Rewrite Playwright specs from scratch (existing specs are stale scaffolds with wrong routes/credentials)
- E2E coverage: 2-3 scenarios — happy path (Homepage → Order wizard → Stripe test mode → Confirmation), one failure case (e.g., invalid card), owner login flow
- E2E uses real Supabase test project (not mocked), closer to production reality
- CI: GitHub Actions workflow from the start — block merges if tests fail
- Unit tests run in CI; E2E tests also run in CI (not local-only)

#### 2FA/MFA
- Required for owner account, optional for baker account
- Setup flow: Owner is prompted to enroll immediately after first login — cannot skip if owner role
- Enrollment shows QR code for authenticator app (TOTP)
- Recovery: Backup codes generated at setup time — owner saves them
- Scope: Admin accounts only (owner + baker) — no 2FA for customers

#### Session timeout
- Configurable by the owner via Owner Dashboard settings UI (not hardcoded)
- Default: 30 minutes of inactivity
- Warning: Blocking modal appears 2 minutes before expiry with "Stay logged in" button
- After auto-logout: Redirect to /login with "session expired" message displayed
- Scope: Admin accounts only (owner + baker roles) — not customers

#### SEO structured data
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

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TEST-01 | Add unit and integration test suites (currently at ~0% coverage despite Vitest + Playwright being configured) | Test infrastructure audit confirms existing setup; identified what tests exist vs. what's missing; pricing.ts and orderStateMachine.ts are testable pure functions |
| AUTH-01 | Add 2FA/MFA for owner and baker accounts | Supabase Auth MFA TOTP native support confirmed; full enrollment API documented; AAL-based enforcement pattern identified |
| AUTH-02 | Implement session timeout for inactive users (auto-logout after configurable period) | Existing useInactivityTimeout hook found but needs rebuild; warning modal pattern documented; configurable timeout via owner settings requires new DB setting |
| SEO-01 | Add JSON-LD structured data (LocalBusiness, BakeryProduct schemas) for rich search results | react-helmet-async 3.0.0 confirmed; Google LocalBusiness required/recommended fields documented; Bakery @type exists in schema.org |
</phase_requirements>

---

## Summary

Phase 10 addresses four distinct domains: testing coverage, admin authentication security, session management, and SEO. The project has a mature test infrastructure already in place (Vitest + jsdom + MSW + @testing-library/react, Playwright 1.59.1) with configuration files and utility wrappers already written. However, the actual test files are thin scaffolds. Some test files exist (`orderStateMachine.test.ts`, `Order.test.tsx`, integration stubs) but the unit tests for `pricing.ts` are entirely absent — the single highest-value gap. The existing `orderStateMachine.test.ts` is solid and provides a template for the pricing tests.

Supabase Auth natively supports TOTP MFA with a well-documented JavaScript SDK. The enrollment pattern is established: `mfa.enroll()` returns an SVG QR code, the user scans it, then `mfa.challenge()` + `mfa.verify()` complete enrollment. AAL (Authenticator Assurance Level) enforcement is the correct mechanism to require MFA before granting dashboard access. Critically, **Supabase does not support backup/recovery codes** — the documented approach is to enroll a second TOTP factor on a different device. The CONTEXT.md requirement for "backup codes" will need to be handled by enrolling a second TOTP factor, not generating OTP backup codes.

Session timeout and SEO are simpler: the existing `useInactivityTimeout.ts` hook exists but caused bugs when it duplicated auth checks. The rebuilt version must never call `signOut()` or `navigate()` directly — instead it should emit state that the component consumes. `react-helmet-async` 3.0.0 (released March 2026) supports React 18 and requires no `HelmetProvider` changes.

**Primary recommendation:** Start with TEST-01 (unit tests for pricing.ts + fixing existing test stubs), then AUTH-01/02 together (they share the Owner Dashboard settings UI), then SEO-01 (pure additive work).

---

## Standard Stack

### Core (all already installed — no new installs needed for testing)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | (in bun.lockb, npm scripts configured) | Unit + integration test runner | Already configured with jsdom + SWC; `npm run test` works |
| @testing-library/react | (installed) | Component rendering + assertions | The industry standard for React component tests |
| @testing-library/user-event | (installed) | Simulating user interactions | Preferred over fireEvent for realistic interaction simulation |
| msw | (installed via `@mswjs`) | HTTP request mocking | Intercepts fetch/XHR at network level; already wired in `/src/test/mocks/` |
| playwright | 1.59.1 | E2E browser automation | Already configured at `playwright.config.ts` |

### New Installs Required

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| react-helmet-async | 3.0.0 | Inject `<script type="application/ld+json">` per page | Only option that works correctly in React 18 with SSR-safety; v3.0.0 released March 2026 with React 19 support |

### Supporting — Already in Project (No Install)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @supabase/supabase-js | 2.78.0 | Supabase MFA APIs (`supabase.auth.mfa.*`) | Full TOTP enrollment + AAL enforcement built in |
| xstate | 5.25.0 | Order state machine being tested | Already imported in test files |
| zod | 3.25.76 | Schema validation already tested | Use for test fixture typing |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| react-helmet-async | Direct `document.head` manipulation | react-helmet-async is the standard; direct DOM manipulation doesn't work for SSR/pre-rendering and is fragile |
| react-helmet-async | react-schemaorg + schema-dts | Adds type safety for JSON-LD but adds 2 more packages; overkill for 2 schemas; plain JSON-LD strings in Helmet are sufficient |
| Supabase native TOTP | otpauth / speakeasy libs | Supabase handles all TOTP server-side; no reason to add a client-side TOTP library |
| Playwright chromium-only | Multi-browser matrix | For CI speed: chromium-only is sufficient; add webkit/firefox as discretion |

**Installation (new packages only):**
```bash
npm install react-helmet-async
```

---

## Architecture Patterns

### Recommended Test Structure

```
src/
├── __tests__/
│   ├── orderStateMachine.test.ts     # EXISTS — solid, use as template
│   ├── pricing.test.ts               # MISSING — highest priority gap
│   ├── frontend/
│   │   ├── Order.test.tsx            # EXISTS — thin scaffold, needs real tests
│   │   ├── AuthContext.test.tsx      # EXISTS — thin scaffold
│   │   ├── OrderTracking.test.tsx    # EXISTS
│   │   └── Menu.test.tsx             # EXISTS
│   └── integration/
│       └── order-flow.test.tsx       # EXISTS — skeleton only (expect(true).toBe(true))
├── test/
│   ├── setup.ts                      # EXISTS — complete, working
│   ├── test-utils.tsx                # EXISTS — AllTheProviders wrapper
│   └── mocks/
│       ├── handlers.ts               # EXISTS — MSW request handlers
│       ├── server.ts                 # EXISTS — MSW server setup
│       ├── supabase.ts               # EXISTS — mock Supabase client
│       └── factories.ts              # EXISTS — test data factories
e2e/
├── order-flow.spec.ts                # EXISTS — stale, rewrite from scratch
└── owner-dashboard.spec.ts           # EXISTS — uses wrong password, rewrite
.github/
└── workflows/
    └── ci.yml                        # MISSING — create for both vitest + playwright
```

### Pattern 1: Unit Testing Pure Functions (pricing.ts)

**What:** pricing.ts exports pure synchronous functions (`calculateCakePrice`, `calculateFillingCost`, `calculateThemeCost`, `calculateTax`) that take data objects and return numbers. These require no mocking.

**When to use:** Any function that takes inputs and returns outputs without side effects.

**Example:**
```typescript
// src/__tests__/pricing.test.ts
// Source: Pattern from existing orderStateMachine.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateCakePrice,
  calculateFillingCost,
  calculateThemeCost,
  calculateTax,
  type PricingData,
} from '@/lib/pricing';

const mockPricingData: PricingData = {
  cakePricing: [
    { size: 'small', base_price: 35 },
    { size: 'medium', base_price: 55 },
    { size: 'large', base_price: 75 },
  ],
  fillingPricing: [
    { name: 'chocolate', additional_cost: 5 },
    { name: 'vanilla', additional_cost: 0 },
  ],
  themePricing: [{ name: 'birthday', additional_cost: 10 }],
  deliveryZones: [],
  taxRates: [{ state: 'PA', county: null, rate: 0.06 }],
};

describe('calculateCakePrice', () => {
  it('returns base price for known size', () => {
    expect(calculateCakePrice('medium', mockPricingData)).toBe(55);
  });
  it('returns 0 for unknown size', () => {
    expect(calculateCakePrice('unknown', mockPricingData)).toBe(0);
  });
});

describe('calculateTax', () => {
  it('applies state tax rate correctly', () => {
    expect(calculateTax(100, 'PA', undefined, mockPricingData)).toBeCloseTo(6);
  });
  it('falls back to 8% when no rate found', () => {
    expect(calculateTax(100, 'XX', undefined, mockPricingData)).toBeCloseTo(8);
  });
});
```

### Pattern 2: Supabase MFA Enrollment Flow

**What:** Three-step TOTP enrollment using Supabase native MFA APIs.

**When to use:** When `owner` role user logs in for first time (forced enrollment) or baker opts in.

**Example:**
```typescript
// src/components/auth/EnrollMFA.tsx
// Source: https://supabase.com/docs/guides/auth/auth-mfa/totp
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export function EnrollMFA({ onEnrolled }: { onEnrolled: () => void }) {
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
      });
      if (error) { setError(error.message); return; }
      setFactorId(data.id);
      // totp.qr_code is an SVG string — encode as data URL for <img>
      setQrCode(`data:image/svg+xml;utf-8,${encodeURIComponent(data.totp.qr_code)}`);
    })();
  }, []);

  const handleVerify = async () => {
    const { data: challengeData } = await supabase.auth.mfa.challenge({ factorId });
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData!.id,
      code: verificationCode,
    });
    if (error) { setError(error.message); return; }
    onEnrolled();
  };

  return (
    <div>
      <img src={qrCode} alt="Scan with authenticator app" />
      <input value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)} />
      <button onClick={handleVerify}>Verify</button>
      {error && <p>{error}</p>}
    </div>
  );
}
```

### Pattern 3: AAL Enforcement (Require MFA Before Dashboard Access)

**What:** After login, check current vs. next AAL. If `nextLevel === 'aal2'` and `currentLevel !== 'aal2'`, show MFA challenge before showing dashboard content.

**When to use:** Wrap OwnerDashboard and FrontDesk with this check.

**Example:**
```typescript
// Source: https://supabase.com/docs/guides/auth/auth-mfa/totp
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function AuthenticatorAssuranceCheck({
  children,
  userRole,
}: {
  children: React.ReactNode;
  userRole: 'owner' | 'baker' | 'customer';
}) {
  const [readyToShow, setReadyToShow] = useState(false);
  const [showMFAChallenge, setShowMFAChallenge] = useState(false);

  useEffect(() => {
    (async () => {
      // Only check MFA for admin roles
      if (userRole === 'customer') { setReadyToShow(true); return; }

      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) { setReadyToShow(true); return; }

      if (data.nextLevel === 'aal2' && data.nextLevel !== data.currentLevel) {
        setShowMFAChallenge(true);
      } else {
        setReadyToShow(true);
      }
    })();
  }, [userRole]);

  if (showMFAChallenge) return <MFAChallengeScreen onVerified={() => setReadyToShow(true)} />;
  if (!readyToShow) return null;
  return <>{children}</>;
}
```

### Pattern 4: useInactivityTimeout — Correct Rebuild

**What:** A hook that tracks inactivity and triggers a callback (NOT directly calling signOut/navigate). Uses a warning-before-expiry pattern.

**Critical constraint from CONTEXT.md:** Must NOT duplicate ProtectedRoute auth checks. Must NOT call `signOut()` or `navigate()` directly — previous version caused redirect loops.

**Example:**
```typescript
// src/hooks/useInactivityTimeout.ts (REBUILT)
// Pattern: external callback, no auth side effects in hook
import { useEffect, useRef, useCallback } from 'react';

interface UseInactivityTimeoutOptions {
  timeoutMs: number;
  warningMs?: number; // how early to warn (default: 2 minutes = 120000ms)
  onWarn: () => void;     // show the warning modal
  onExpire: () => void;   // called when timer fully expires — parent handles signOut + navigate
  onDismissWarning?: () => void; // called when user clicks "Stay logged in"
}

export function useInactivityTimeout({
  timeoutMs,
  warningMs = 2 * 60 * 1000,
  onWarn,
  onExpire,
}: UseInactivityTimeoutOptions) {
  const warnTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const expireTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const resetTimers = useCallback(() => {
    if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
    if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    warnTimerRef.current = setTimeout(onWarn, timeoutMs - warningMs);
    expireTimerRef.current = setTimeout(onExpire, timeoutMs);
  }, [timeoutMs, warningMs, onWarn, onExpire]);

  useEffect(() => {
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    // Throttle resets to max once per second
    let lastReset = 0;
    const throttledReset = () => {
      const now = Date.now();
      if (now - lastReset > 1000) { lastReset = now; resetTimers(); }
    };
    events.forEach((e) => window.addEventListener(e, throttledReset, { passive: true }));
    resetTimers(); // Start initial timers
    return () => {
      events.forEach((e) => window.removeEventListener(e, throttledReset));
      if (warnTimerRef.current) clearTimeout(warnTimerRef.current);
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    };
  }, [resetTimers]);
}
```

### Pattern 5: JSON-LD Injection with react-helmet-async

**What:** Inject structured data into `<head>` using `<Helmet>` with a `script` prop.

**When to use:** Homepage (LocalBusiness) and Menu page (BakeryProduct for each item shown).

**Example:**
```typescript
// Source: https://developers.google.com/search/docs/appearance/structured-data/local-business
import { Helmet } from 'react-helmet-async';

// In Index.tsx
const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "Bakery",
  "name": "Eli's Dulce Tradicion",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "324 W Marshall St",
    "addressLocality": "Norristown",
    "addressRegion": "PA",
    "postalCode": "19401",
    "addressCountry": "US"
  },
  "telephone": "+16102796200",
  "url": "https://elisbakery.com",
  "priceRange": "$$",
  "servesCuisine": "Bakery",
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "09:00", "closes": "18:00" }
  ]
};

<Helmet>
  <script type="application/ld+json">
    {JSON.stringify(localBusinessSchema)}
  </script>
</Helmet>
```

### Pattern 6: GitHub Actions CI Workflow

**What:** A single `ci.yml` that runs Vitest unit tests then Playwright E2E tests on every PR to main.

**Discretion applied:** Chromium only for speed; 20-minute timeout; upload report artifact on failure.

```yaml
# .github/workflows/ci.yml
# Source: https://playwright.dev/docs/ci-intro
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:frontend

  e2e-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    env:
      VITE_SUPABASE_URL: ${{ secrets.VITE_SUPABASE_URL }}
      VITE_SUPABASE_ANON_KEY: ${{ secrets.VITE_SUPABASE_ANON_KEY }}
      VITE_STRIPE_PUBLISHABLE_KEY: ${{ secrets.VITE_STRIPE_PUBLISHABLE_KEY }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx playwright install chromium --with-deps
      - run: npx playwright test --project=chromium
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

### Anti-Patterns to Avoid

- **Re-adding the previous useInactivityTimeout directly:** The existing `src/hooks/useInactivityTimeout.ts` calls `signOut()` and `navigate()` directly inside the hook — this caused the prior redirect loops. Rebuild with callbacks only.
- **Checking `isAuthenticated` inside the inactivity hook:** ProtectedRoute already handles unauthenticated access. The hook should only manage the timer.
- **Enrolling MFA then immediately requiring aal2 on the same page render:** Always give the user time to complete enrollment before enforcing AAL. Check AAL on next page load / navigation.
- **Using `react-helmet` (not async):** The original `react-helmet` is unmaintained. Use `react-helmet-async` only.
- **Putting JSON-LD in a useEffect / DOM manipulation:** Use `<Helmet>` with `script` prop only — never `document.head.appendChild` or string injection via dangerouslySetInnerHTML on `<script>` tags outside Helmet.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP QR code generation | Custom QR code library + TOTP secret generation | `supabase.auth.mfa.enroll()` | Supabase generates QR SVG + secret server-side; no client-side TOTP library needed |
| MFA session tracking | Custom JWT claim parsing | `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` | Returns `currentLevel`/`nextLevel`; handles all session states |
| HTTP request mocking in tests | `jest.mock('fetch')` or manual fetch spy | MSW (already installed) | MSW intercepts at network level; handlers already in `src/test/mocks/handlers.ts` |
| React rendering test wrapper | Per-test Provider setup | `src/test/test-utils.tsx` render() | Already has QueryClient, Router, AuthProvider, i18n, ThemeProvider |
| Head/meta tag injection | `document.head.appendChild` | react-helmet-async 3.0.0 | Handles deduplication, SSR, and ordering; avoids DOM manipulation race conditions |
| Backup/recovery codes | Custom OTP code generation + storage | Second TOTP factor enrollment | Supabase does not support recovery codes; their documented pattern is enrolling a backup TOTP factor |

**Key insight:** Supabase Auth handles the full TOTP lifecycle server-side. The client only needs to display the QR code and collect the 6-digit verification code.

---

## Common Pitfalls

### Pitfall 1: useInactivityTimeout Redirect Loops

**What goes wrong:** The hook directly calls `signOut()` and then `navigate('/login')`. But `signOut()` triggers `onAuthStateChange` in AuthContext, which updates state and causes ProtectedRoute to redirect too. Two redirects race and create a loop.

**Why it happens:** Auth state changes from signOut + explicit navigation both trigger routing at the same time.

**How to avoid:** Build the hook with `onWarn` and `onExpire` callback props. The consumer (OwnerDashboard or FrontDesk) calls `signOut()` in its own `onExpire` handler. Never put `navigate()` inside the hook.

**Warning signs:** Rapid redirect between `/login` and dashboard pages after inactivity.

### Pitfall 2: MFA Enrollment Race — AAL Not Updated Immediately

**What goes wrong:** After calling `mfa.verify()` successfully, immediately calling `getAuthenticatorAssuranceLevel()` may still return `aal1` because the JWT hasn't refreshed yet.

**Why it happens:** Supabase updates session AAL asynchronously; the current session token is issued before enrollment completes.

**How to avoid:** After successful `mfa.verify()`, call `supabase.auth.refreshSession()` before re-checking AAL, or simply call `onEnrolled()` and let the parent component trigger a re-check on next navigation.

**Warning signs:** User enrolls MFA successfully but still sees the enrollment prompt on next load.

### Pitfall 3: MSW `onUnhandledRequest: 'error'` Breaks New Test Files

**What goes wrong:** `src/test/setup.ts` configures MSW with `onUnhandledRequest: 'error'`. New test files that call API endpoints not listed in `src/test/mocks/handlers.ts` will throw unhandled request errors.

**Why it happens:** The Supabase client makes multiple REST calls on initialization (getSession, profile lookup). The existing `handlers.ts` mock has a Supabase auth handler but it may not cover all new Supabase calls.

**How to avoid:** Either add new Supabase endpoint mocks to `handlers.ts`, or use `server.use(...)` inside individual `beforeEach` blocks for test-specific overrides.

**Warning signs:** Tests fail with "Error: [MSW] Cannot find a handler for: POST https://*.supabase.co/..."

### Pitfall 4: E2E Tests Hitting Production Supabase

**What goes wrong:** Playwright E2E tests configured to use `VITE_SUPABASE_URL` from `.env` may hit the production database if env vars aren't scoped to CI secrets.

**Why it happens:** The CONTEXT.md decision says "E2E uses real Supabase test project" — but if the same URL is used for prod and CI, real data gets mutated.

**How to avoid:** Use separate GitHub Actions secrets scoped to the test Supabase project. The test accounts (`owner@elisbakery.com`, `orders@elisbakery.com`) already exist in the real project per CONTEXT.md.

**Warning signs:** E2E tests create orders that appear in the real owner dashboard.

### Pitfall 5: Owner Password in E2E Spec Is Wrong

**What goes wrong:** The existing `owner-dashboard.spec.ts` uses `ChangeThisPassword123!` but the actual owner password is `ElisBakery123`.

**Why it happens:** Spec was written with a placeholder password, never updated.

**How to avoid:** When rewriting E2E specs, use credentials from CONTEXT.md: owner = `ElisBakery123`, front desk = `OrdersElisBakery123`. Store as environment variables in CI (not hardcoded in spec files).

**Warning signs:** E2E login test fails immediately on credentials.

### Pitfall 6: Playwright `webServer.command` Needs Backend Too

**What goes wrong:** `playwright.config.ts` runs `npm run dev` (Vite only) but many page loads trigger API calls to Express on port 3001 that aren't running.

**Why it happens:** `npm run dev` only starts Vite; Express backend is separate (`npm run server:dev`).

**How to avoid:** For E2E tests that hit the Express backend, either (a) mock those endpoints via Playwright `page.route()`, or (b) add a second `webServer` entry in `playwright.config.ts` for the backend. Option (a) is cleaner for CI.

### Pitfall 7: JSON-LD Missing HelmetProvider

**What goes wrong:** `<Helmet>` renders nothing if `<HelmetProvider>` is not in the component tree.

**Why it happens:** react-helmet-async requires a provider wrapper at the app root.

**How to avoid:** Add `<HelmetProvider>` to `App.tsx` wrapping the entire application. Check that `src/test/test-utils.tsx` also includes it if testing Helmet output.

**Warning signs:** `<Helmet>` renders without errors but `<script type="application/ld+json">` is absent from `<head>`.

---

## Code Examples

Verified patterns from official sources:

### Supabase MFA Enroll + Challenge + Verify
```typescript
// Source: https://supabase.com/docs/guides/auth/auth-mfa/totp

// Step 1: Enroll
const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
});
// enrollData.id — factor ID for subsequent calls
// enrollData.totp.qr_code — SVG string, encode as data:image/svg+xml;utf-8,...
// enrollData.totp.uri — otpauth:// URI for manual entry

// Step 2: Challenge
const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
  factorId: enrollData.id,
});

// Step 3: Verify
const { error: verifyError } = await supabase.auth.mfa.verify({
  factorId: enrollData.id,
  challengeId: challengeData.id,
  code: userEnteredSixDigitCode,
});
// If no verifyError, factor is now active (aal2)
```

### AAL Check — Post-Login Enforcement
```typescript
// Source: https://supabase.com/docs/guides/auth/auth-mfa/totp
const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
// data.currentLevel: 'aal1' | 'aal2'
// data.nextLevel: 'aal1' | 'aal2'
// Show MFA challenge when: data.nextLevel === 'aal2' && data.currentLevel !== 'aal2'
```

### AAL Challenge (re-authenticate after login)
```typescript
// Source: https://supabase.com/docs/reference/javascript/auth-mfa-api
const { data: factors } = await supabase.auth.mfa.listFactors();
const totpFactor = factors.totp[0]; // Use first enrolled TOTP factor
const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totpFactor.id });
const { error } = await supabase.auth.mfa.verify({
  factorId: totpFactor.id,
  challengeId: challenge.id,
  code: userEnteredCode,
});
```

### LocalBusiness JSON-LD for Bakery
```typescript
// Source: https://developers.google.com/search/docs/appearance/structured-data/local-business
// Note: Use "@type": "Bakery" — the most specific sub-type per Google guidance
const schema = {
  "@context": "https://schema.org",
  "@type": "Bakery",
  "name": "Eli's Dulce Tradicion",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "324 W Marshall St",
    "addressLocality": "Norristown",
    "addressRegion": "PA",
    "postalCode": "19401",
    "addressCountry": "US"
  },
  "telephone": "+16102796200",
  "url": "https://elisbakery.com",
  "priceRange": "$$",
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
      "opens": "09:00",
      "closes": "18:00"
    }
  ]
};
```

### react-helmet-async Setup (App.tsx)
```typescript
// npm install react-helmet-async
// Source: https://www.npmjs.com/package/react-helmet-async (v3.0.0)
import { HelmetProvider } from 'react-helmet-async';

// In App.tsx, wrap everything:
<HelmetProvider>
  {/* rest of app */}
</HelmetProvider>

// In any page component:
import { Helmet } from 'react-helmet-async';
<Helmet>
  <script type="application/ld+json">
    {JSON.stringify(localBusinessSchema)}
  </script>
</Helmet>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom TOTP library + QR code generation | `supabase.auth.mfa.enroll()` returns SVG QR code natively | Supabase 2.x | No client-side TOTP lib needed |
| `react-helmet` (unmaintained, thread-unsafe) | `react-helmet-async` 3.0.0 (React 18+19 compatible) | March 2026 (v3.0.0) | Use HelmetProvider; API unchanged |
| E2E tests: jsdom simulated browser | Playwright real browser automation | 2022+ | More realistic for auth flows, Stripe redirects |
| Manual sitemap maintenance | Dynamic sitemap generation | — | Static file still valid for small site; keep manual per CONTEXT.md |

**Deprecated/outdated:**
- `react-helmet` (nfl/react-helmet): Unmaintained, thread-unsafe. Always use `react-helmet-async`.
- The existing E2E specs in `/e2e/`: Use wrong password, wrong field selectors (form uses step components now after Phase 9 refactor). Rewrite from scratch.
- The `useInactivityTimeout.ts` as currently written: Direct `signOut()` call in hook caused redirect loops. Present file should be replaced entirely.

---

## Open Questions

1. **Session timeout stored where in database?**
   - What we know: CONTEXT.md says configurable via Owner Dashboard settings UI. BusinessSettings component exists (`src/components/admin/BusinessSettingsManager.tsx`). `business_settings` table exists in DB.
   - What's unclear: Does `business_settings` have a `session_timeout_minutes` column already, or does a migration need to add it?
   - Recommendation: Read `BusinessSettingsManager.tsx` during planning; if column missing, add a migration in Wave 0.

2. **Supabase project has MFA enabled?**
   - What we know: TOTP MFA is enabled by default on all Supabase projects per official docs.
   - What's unclear: The specific project at `VITE_SUPABASE_URL` needs to be verified in the dashboard (Authentication → Settings → MFA).
   - Recommendation: Add a manual verification step in Wave 0 task: check Supabase dashboard that MFA is enabled.

3. **E2E Stripe test flow: Stripe test card triggers payment intent**
   - What we know: Stripe is in test mode (`pk_test_...`). Test card `4242 4242 4242 4242` triggers payment_intent.succeeded.
   - What's unclear: Does the E2E test need the Express backend + Supabase edge function running? Or can Playwright mock the Stripe payment step?
   - Recommendation: Mock the Stripe payment step using `page.route()` in Playwright to avoid needing a running backend in CI. The "real" happy path test can stay local-only.

4. **`input-otp` package for 2FA code entry**
   - What we know: `input-otp` v1.4.2 is already installed in `package.json` dependencies. This is the standard React OTP input component.
   - What's unclear: Whether an OTP input component exists in `src/components/ui/input-otp.tsx` (shadcn/ui includes one).
   - Recommendation: Check for `src/components/ui/input-otp.tsx` — if it exists (shadcn installs it), use it directly for the 2FA code entry field.

---

## Sources

### Primary (HIGH confidence)
- https://supabase.com/docs/guides/auth/auth-mfa/totp — Full TOTP enrollment flow, AAL levels, React component patterns
- https://supabase.com/docs/reference/javascript/auth-mfa-api — All MFA API method signatures (enroll, challenge, verify, listFactors, unenroll, getAuthenticatorAssuranceLevel)
- https://developers.google.com/search/docs/appearance/structured-data/local-business — Required + recommended LocalBusiness fields, JSON-LD examples
- Direct codebase audit — `vitest.config.ts`, `playwright.config.ts`, `src/test/setup.ts`, `src/test/test-utils.tsx`, `src/__tests__/**` all inspected

### Secondary (MEDIUM confidence)
- https://www.npmjs.com/package/react-helmet-async — v3.0.0 confirmed as current stable release (March 2026), React 18/19 compatible
- https://playwright.dev/docs/ci-intro — Official Playwright GitHub Actions YAML template verified
- Codebase confirms: Playwright 1.59.1 installed; MSW installed via `@mswjs`; `@testing-library/react` installed; `input-otp` 1.4.2 in package.json

### Tertiary (LOW confidence)
- Multiple sources confirm Supabase does NOT support OTP backup/recovery codes — backup is second TOTP factor enrollment (this directly conflicts with CONTEXT.md requirement for "backup codes at setup time" — flagged for planner to reconcile)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in node_modules / package.json / npm
- Architecture: HIGH — test infrastructure fully audited from source; Supabase MFA pattern from official docs
- Pitfalls: HIGH — most from direct codebase inspection (wrong password in spec, direct signOut in hook, missing HelmetProvider); MFA AAL refresh timing is MEDIUM (from docs)
- MFA recovery codes: LOW — Supabase officially does not support backup codes; CONTEXT.md assumption needs reconciling

**Research date:** 2026-04-03
**Valid until:** 2026-05-03 (30 days) — Supabase and react-helmet-async APIs are stable; Playwright 1.59 is current

---

## Critical Note for Planner: MFA Recovery Codes

CONTEXT.md specifies "Recovery: Backup codes generated at setup time — owner saves them." However, **Supabase does not support backup/recovery codes** — this is confirmed by official documentation. The Supabase-documented recovery mechanism is enrolling a second TOTP factor (different device/app).

The planner must decide: either (a) implement a custom recovery code system outside Supabase (significant complexity: generate codes, hash+store in DB, verify on login — do not hand-roll), or (b) adapt the UX to the Supabase pattern (enroll backup TOTP factor on second device). Option (b) is strongly recommended — it aligns with Supabase's design, avoids building credential storage, and is simpler to implement correctly.
