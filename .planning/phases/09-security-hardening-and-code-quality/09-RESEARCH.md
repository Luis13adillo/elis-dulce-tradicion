# Phase 9: Security Hardening & Code Quality — Research

**Researched:** 2026-04-03
**Phase:** 09-security-hardening-and-code-quality
**Requirements addressed:** SEC-05, SEC-06, REFACTOR-01, REFACTOR-02

---

## 1. CSRF Protection (SEC-05)

### Critical Finding: CSRF May Not Be Needed Here

The standard security guidance is: **CSRF protection is only required when authentication tokens are sent automatically by the browser (i.e., stored in cookies).** When a JWT is stored in `localStorage` or memory and sent via `Authorization: Bearer <token>` header, CSRF attacks are not possible because an attacker-controlled form or iframe cannot read localStorage or inject custom headers.

**This project's authentication pattern:**
- Supabase Auth stores the session token in localStorage (the Supabase SDK default)
- The `AnalyticsApi` fetches `session.access_token` from `sb.auth.getSession()` and sends it as `Authorization: Bearer ...`
- The `api-client.ts` (legacy standalone client) reads from `localStorage.getItem('supabase.auth.token')` and sends it as `Authorization: Bearer ...`
- Most state-changing routes in the project go through **Supabase directly** (via `supabase.rpc()` or `supabase.from()`) — not through the Express backend
- The Express backend's `auth.js` middleware verifies `req.headers['authorization']` (Bearer token), not a cookie

**Conclusion:** The Express backend endpoints that mutate state are protected by Bearer JWT, not cookies. A cross-origin form POST cannot forge the `Authorization: Bearer` header — the attack vector CSRF protects against does not apply here.

### The Decision Has Already Been Made (CONTEXT.md)

The context document specifies:
- CSRF token sent via **HTTP header `X-CSRF-Token`**
- Token fetched once on app load from `GET /api/csrf-token`, stored in memory
- Auto-retry on failure with a fresh token

We must implement this as specified regardless of the theoretical redundancy. The defense-in-depth value is real, and the owner has made this decision.

### Library Choice: `csrf-csrf` v4

**Recommendation: Use `csrf-csrf`**

- `csurf` is deprecated (removed from npm registry)
- `csrf-csrf` is its actively maintained successor, built specifically for SPAs and stateless architectures
- Uses the Double Submit Cookie Pattern with HMAC signing
- Version 4 is current as of 2026
- The package's FAQ explicitly states: "if you're using a JWT and you aren't using it as a cookie, you likely don't need CSRF protection" — but it still works correctly for defense-in-depth

**Key integration pattern for this project:**

Since the Express backend has no sessions (stateless JWT auth), `csrf-csrf` must be configured to derive the "unique identifier" from the incoming request's JWT or from a cookie it sets itself. The simplest approach for this SPA is:

1. Backend installs `csrf-csrf`: `npm install csrf-csrf` in `backend/`
2. Backend exposes `GET /api/v1/csrf-token` which generates and returns a token, setting a signed cookie
3. All `POST/PUT/PATCH/DELETE` routes validate the `X-CSRF-Token` header against the cookie
4. Frontend fetches the token on app load, stores in a module-level variable (as per context decision), attaches to all state-changing requests

**Where to add the header in the frontend:**

The `api/index.ts` `ApiClient` class does NOT currently have a fetch interceptor layer. The `BaseApiClient` methods call `supabase.rpc()` or `supabase.from()` directly — these bypass the Express backend entirely. The CSRF header only needs to be on requests that hit the Express backend.

Routes that currently hit Express backend (those using `VITE_API_URL`):
- `AnalyticsApi.getDashboardMetrics` — GET (safe, no CSRF needed)
- `api-client.ts` — used by `OrderStatusFlow.tsx` for order transitions — PATCH (needs CSRF)
- Any future direct `fetch()` calls to `VITE_API_URL` endpoints

**Implementation approach:**
Create a module-level CSRF token store in `src/lib/csrf.ts`:
```typescript
// src/lib/csrf.ts
let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/v1/csrf-token`, { credentials: 'include' });
  const data = await res.json();
  csrfToken = data.token;
  return csrfToken!;
}

export function clearCsrfToken() {
  csrfToken = null;
}
```

The `api-client.ts` class can be updated to call `getCsrfToken()` and inject `X-CSRF-Token` for mutating methods. The existing Supabase-based routes in `api/modules/` do NOT go through Express, so they do not need CSRF tokens.

**Webhook exemption:** `backend/routes/webhooks.js` (Stripe webhook) must be explicitly excluded from CSRF validation — it uses raw body signature verification instead.

---

## 2. Delivery Option Enable (SEC-06)

### Current State (Confirmed by Code Audit)

In `src/pages/Order.tsx` lines 1036-1041:
```tsx
<button
  disabled
  className="flex-1 py-4 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-3 text-white/20 cursor-not-allowed"
>
  <MapPin size={18} /> Delivery
</button>
```

The button is `disabled` with `cursor-not-allowed` styling. Removing `disabled` and updating styling activates it.

### AddressAutocomplete Component

`src/components/order/AddressAutocomplete.tsx` (269 lines after Phase 9 note: the "551 LOC" figure in the phase description was an overestimate — actual is 269 lines) is fully built and handles:
- Lazy loading Google Maps script via dynamic `<script>` tag injection (no `@googlemaps/js-api-loader` needed)
- Google Places Autocomplete initialization once script loads
- Validation on `place_changed` event (fires when user selects from dropdown = "on blur" equivalent)
- Calls `api.calculateDeliveryFee(formattedAddress, zipCode)` for zone/fee lookup
- Displays zone name, delivery fee, distance, estimated time
- Shows "Outside delivery area" badge when not serviceable

**Critical finding: `api.calculateDeliveryFee` does not exist on ApiClient**

`AddressAutocomplete.tsx` calls `api.calculateDeliveryFee(...)` but the `ApiClient` class in `src/lib/api/index.ts` does NOT expose this method. This must be added.

The backend endpoint exists: `GET /api/v1/delivery/calculate-fee?address=...&zipCode=...` (in `backend/routes/delivery.js`). The function in `src/lib/pricing.ts` named `calculateDeliveryFee` is a different, unrelated function (takes `PricingData` object, tries to import `./googleMaps`). The API client method needs to call the Express backend endpoint.

**Required addition to API client:**
```typescript
// Add to src/lib/api/index.ts (or a new DeliveryApi module)
async calculateDeliveryFee(address: string, zipCode: string) {
  const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const res = await fetch(
    `${API_BASE_URL}/api/v1/delivery/calculate-fee?address=${encodeURIComponent(address)}&zipCode=${encodeURIComponent(zipCode)}`
  );
  if (!res.ok) return { serviceable: false, fee: 0 };
  return res.json();
}
```

### Google Maps Loading Pattern

`AddressAutocomplete.tsx` already implements the correct loading pattern:
1. Checks `window.google?.maps?.places` — if already loaded, use it
2. Checks for existing `<script>` tag with `maps.googleapis.com` — if found, waits for load event
3. Otherwise creates `<script async defer>` tag pointing to `https://maps.googleapis.com/maps/api/js?key=...&libraries=places`

This is the correct non-blocking pattern for Vite/React. No package install needed. `VITE_GOOGLE_MAPS_API_KEY` must be set in `.env` — the component already reads `import.meta.env.VITE_GOOGLE_MAPS_API_KEY` and degrades gracefully (shows warning) if missing.

**No changes needed to `index.html`** — the component self-loads the script.

**Note on `@react-google-maps/api`:** The `package.json` lists `@react-google-maps/api: ^2.20.7` and `react-places-autocomplete: ^7.3.0` as dependencies. These are installed but not used in AddressAutocomplete. The existing vanilla JS approach in AddressAutocomplete is simpler and should be kept as-is.

### Out-of-Zone Auto-Revert (Context Decision)

The context specifies: if address is outside delivery zone, show error and **automatically switch back to Pickup**.

The `AddressAutocomplete` component exposes `deliveryInfo.serviceable` via its `onChange` callback. The parent `Order.tsx` step 5 (Contact Info step) receives this. Logic needed:

```typescript
// In Order.tsx, when AddressAutocomplete onChange fires:
const handleAddressChange = (value: string, isValid: boolean, placeDetails?: any, deliveryInfo?: any) => {
  setFormData(prev => ({ ...prev, deliveryAddress: value }));
  if (deliveryInfo && !deliveryInfo.serviceable) {
    setFormData(prev => ({ ...prev, pickupType: 'pickup' }));
    toast.error(t('Dirección fuera del área de entrega. Cambiado a Pickup.', 'Address outside delivery area. Switched to Pickup.'));
  } else if (deliveryInfo && deliveryInfo.serviceable) {
    setDeliveryFee(deliveryInfo.fee || 0);
  }
};
```

### Delivery Address in Order Data

The order payload in `handleSubmit()` currently sends `delivery_option: formData.pickupType`. When delivery is selected, it must also send `delivery_address`, `delivery_zone`, and `delivery_fee`. The backend `orders.js` already handles these fields (confirmed in prior phases).

`formData` needs a new field: `deliveryAddress: ''`. The `getTotal()` function must add `deliveryFee` when pickupType is 'delivery'.

### Step Indicator Interactivity (Context Decision)

The context specifies: completed steps show a key-selection summary below the step number, and clicking a completed step jumps directly to it.

Currently the step indicator in the header is decorative only (progress bars):
```tsx
{STEPS.map((_, i) => (
  <div key={i} className={`h-2 w-10 rounded-full transition-all ...`} />
))}
```

This needs to be replaced with a clickable step indicator that shows summaries. This is part of the REFACTOR-01 work since the step components will each provide their own summary getter function.

---

## 3. Order.tsx Refactor (REFACTOR-01)

### Current Structure

`Order.tsx` is 1,104 lines with this structure:
- Lines 1-63: Fallback constants (FALLBACK_CAKE_SIZES, FALLBACK_BREAD_TYPES, FALLBACK_FILLINGS, FALLBACK_PREMIUM_FILLING_OPTIONS)
- Lines 64-93: Animation variants
- Lines 94-123: `FloatingInput` helper component
- Lines 126-571: Main `Order` component — all state, hooks, handlers
- Lines 572-1099: JSX render — 5 step regions inside AnimatePresence

**State inventory (all must stay in parent Order.tsx):**
```typescript
// formData: main form state (dateNeeded, timeNeeded, customerName, phone, email, pickupType, cakeSize, breadType, filling, theme, dedication)
const [formData, setFormData] = useState({...});
const [selectedFillings, setSelectedFillings] = useState<string[]>([]);
const [premiumFillingSizes, setPremiumFillingSizes] = useState<Record<string, string>>({});
const [isSubmitting, setIsSubmitting] = useState(false);
const [validationError, setValidationError] = useState<string | null>(null);
const [isUploadingImage, setIsUploadingImage] = useState(false);
const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
const [showCamera, setShowCamera] = useState(false);
const [consentGiven, setConsentGiven] = useState(false);
const [orderOptions, setOrderOptions] = useState<OrderFormOptions | null>(null);
const [optionsLoading, setOptionsLoading] = useState(true);
const [currentStep, setCurrentStep] = useState(0);
const [direction, setDirection] = useState(0);
```

### State Management Pattern

**Decision (per context): Parent Order.tsx holds all state, passes props + callbacks to step components.**

This is the correct choice. A React Context for order state would be over-engineering — the state tree is relatively flat and there are only 5 children. `useReducer` would add complexity without benefit given the already-modular nature of `setFormData`.

The pattern:
```typescript
// Each step receives what it needs:
<DateTimeStep
  dateNeeded={formData.dateNeeded}
  timeNeeded={formData.timeNeeded}
  timeOptions={timeOptions}
  onDateChange={(date) => setFormData(prev => ({ ...prev, dateNeeded: date }))}
  onTimeChange={(time) => setFormData(prev => ({ ...prev, timeNeeded: time }))}
/>
```

Each step component owns its own validation logic (per context decision).

### Component Split Plan

**Files to create under `src/components/order/steps/`:**

| File | Extracted from | Key props received |
|------|---------------|-------------------|
| `DateTimeStep.tsx` | Lines 686-742 | `dateNeeded`, `timeNeeded`, `timeOptions`, `onDateChange`, `onTimeChange` |
| `SizeStep.tsx` | Lines 744-792 | `cakeSize`, `activeCakeSizes`, `optionsLoading`, `isSpanish`, `onSizeChange` |
| `FlavorStep.tsx` | Lines 794-902 | `breadType`, `activeBreadTypes`, `selectedFillings`, `activeFillings`, `premiumFillingSizes`, `activePremiumOptions`, `optionsLoading`, `isSpanish`, `onBreadChange`, `onFillingToggle`, `onPremiumSizeSet` |
| `DetailsStep.tsx` | Lines 905-995 | `theme`, `dedication`, `imagePreviewUrl`, `isUploadingImage`, `isMobile`, `onThemeChange`, `onDedicationChange`, `onImageChange`, `onRemoveImage`, `onCameraCapture`, `fileInputRef` |
| `ContactStep.tsx` | Lines 998-1055 | `customerName`, `phone`, `email`, `pickupType`, `consentGiven`, `deliveryAddress`, `deliveryFee`, `onNameChange`, `onPhoneChange`, `onEmailChange`, `onPickupTypeChange`, `onConsentChange`, `onAddressChange` |

`FloatingInput` sub-component: stays in the same file as `ContactStep.tsx` or moves to `src/components/order/FloatingInput.tsx`.

The FALLBACK constants and `formatTimeDisplay` helper move to a shared file: `src/components/order/steps/orderStepConstants.ts`.

**Order.tsx after refactor:**
- Fallback constants (or import from shared constants)
- Animation variants
- All state declarations
- All business logic handlers
- `validateStep()` that delegates to step validation
- `nextStep()`, `prevStep()`, `handleSubmit()`
- Render: orchestrates `<AnimatePresence>` switching between 5 imported step components
- Updated clickable step indicator

### Clickable Step Indicator

Each step component exports a `getSummary(formData)` function:
```typescript
// In DateTimeStep.tsx:
export function getDateTimeSummary(formData: { dateNeeded: string; timeNeeded: string }): string | null {
  if (!formData.dateNeeded) return null;
  return `${formData.dateNeeded} • ${formatTimeDisplay(formData.timeNeeded)}`;
}
```

The step indicator in `Order.tsx` uses these:
```tsx
{STEPS.map((step, i) => (
  <button
    key={i}
    onClick={() => i < currentStep && goToStep(i)}
    className={cn(
      "flex flex-col items-center gap-1",
      i < currentStep && "cursor-pointer"
    )}
  >
    <div className={`h-2 w-10 rounded-full transition-all duration-500 ${i <= currentStep ? 'bg-[#C6A649] ...' : 'bg-white/10'}`} />
    {i < currentStep && summaries[i] && (
      <span className="text-[9px] text-[#C6A649]/70 font-bold max-w-[40px] truncate">{summaries[i]}</span>
    )}
  </button>
))}
```

---

## 4. ReportsManager.tsx Refactor (REFACTOR-02)

### Current Structure

`ReportsManager.tsx` is 855 lines with this structure:
- Lines 1-55: Utility functions (`generateCSV`, `downloadCSV`, `getDateRange`)
- Lines 58-77: Type definitions
- Lines 79-107: `ReportsManager` component setup (useState, useEffect, loadData)
- Lines 109-252: 4 `useMemo` data transforms (revenueSummary, orderVolume, customerReport, inventoryReport)
- Lines 254-352: 4 CSV export functions + 1 email send function
- Lines 354-852: JSX — summary cards + 4 conditional detail panels + quick export section

### Pattern (per context decision): Parent fetches data, passes props down

The parent `ReportsManager.tsx` becomes the orchestrator:
- Keeps `orders`, `ingredients`, `isLoading`, `datePreset`, `activeReport`, `isSendingReport` state
- Calls `loadData()` on mount
- Computes `filteredOrders` based on date range
- Passes `filteredOrders` and `ingredients` to child report components

**Files to create under `src/components/dashboard/reports/`:**

| File | Responsibility |
|------|---------------|
| `RevenueReport.tsx` | `revenueSummary` useMemo + revenue table + exportRevenueSummary |
| `OrderVolumeReport.tsx` | `orderVolume` useMemo + status/day/delivery-type display + exportOrderVolume |
| `CustomerReport.tsx` | `customerReport` useMemo + customer table + exportCustomerReport |
| `InventoryReport.tsx` | `inventoryReport` useMemo + inventory table + exportInventoryReport |
| `reportUtils.ts` | `generateCSV`, `downloadCSV`, `getDateRange`, `DatePreset` type |

`ReportsManager.tsx` after refactor keeps:
- State and data fetching
- Header with date preset selector
- Summary cards (with click handlers for `activeReport` toggle)
- Conditional renders of `<RevenueReport>`, `<OrderVolumeReport>`, `<CustomerReport>`, `<InventoryReport>`
- Quick Export section (calls exported functions from child components or parent passes handlers down)

**Key prop shapes for each component:**
```typescript
// RevenueReport
interface RevenueReportProps {
  filteredOrders: any[];
  dateRange: { start: Date; end: Date };
}

// OrderVolumeReport
interface OrderVolumeReportProps {
  filteredOrders: any[];
}

// CustomerReport
interface CustomerReportProps {
  filteredOrders: any[];
  dateRange: { start: Date; end: Date };
}

// InventoryReport
interface InventoryReportProps {
  ingredients: any[];
}
```

The Quick Export section needs access to the export functions. Three options:
1. Export functions are defined inside each child component and exposed via `ref` (imperative handle) — overly complex
2. Export functions are defined in child components and called via a shared callback — parent passes `onExport` prop
3. Export functions live in `reportUtils.ts` and imported by both parent and child — cleanest for this pattern

**Recommendation: Option 3** — each child component uses the shared `downloadCSV` util internally for the "Export CSV" button in the detail panel, and `ReportsManager.tsx` calls the same util functions directly for the Quick Export buttons.

---

## 5. Implementation Order for This Phase

The natural execution order given dependencies:

**Plan 09-01: CSRF Backend + Frontend Token Injection**
1. Install `csrf-csrf` in `backend/`
2. Add CSRF middleware to `backend/server.js` (exempt webhooks + GET/OPTIONS)
3. Add `GET /api/v1/csrf-token` endpoint
4. Create `src/lib/csrf.ts` token store
5. Update `src/lib/api-client.ts` to inject `X-CSRF-Token` header for mutating requests
6. Test that existing order status transitions still work

**Plan 09-02: Delivery Option Enablement**
1. Add `calculateDeliveryFee` method to `ApiClient` in `src/lib/api/index.ts`
2. Add `deliveryAddress` and `deliveryFee` to `formData` state in `Order.tsx`
3. Remove `disabled` + `cursor-not-allowed` from the Delivery button
4. Import and render `AddressAutocomplete` in step 5 (Contact Info), conditional on `pickupType === 'delivery'`
5. Wire the out-of-zone auto-revert handler
6. Add delivery fee to `getTotal()` calculation
7. Add `delivery_address` and `delivery_fee` to the `orderData` payload in `handleSubmit()`
8. Test full delivery flow (address input, fee display, checkout with delivery)

**Plan 09-03: Order.tsx Refactor**
1. Create `src/components/order/steps/` directory
2. Extract `FloatingInput` to standalone file or co-locate with ContactStep
3. Create `orderStepConstants.ts` with fallback arrays and `formatTimeDisplay`
4. Create `DateTimeStep.tsx`, `SizeStep.tsx`, `FlavorStep.tsx`, `DetailsStep.tsx`, `ContactStep.tsx`
5. Update `Order.tsx` to import and render step components
6. Replace progress bars with clickable step indicator showing summaries
7. Verify build passes — no behavior changes

**Plan 09-04: ReportsManager.tsx Refactor**
1. Create `src/components/dashboard/reports/` directory
2. Create `reportUtils.ts`
3. Create `RevenueReport.tsx`, `OrderVolumeReport.tsx`, `CustomerReport.tsx`, `InventoryReport.tsx`
4. Slim down `ReportsManager.tsx` to orchestrator role
5. Verify build passes — no behavior changes

---

## 6. Key Risks and Constraints

### CSRF Token and Cookie Configuration

`csrf-csrf` uses double-submit cookie pattern: it sets a signed cookie AND requires the same token value in `X-CSRF-Token` header. The backend must use `cookie-parser` (check if installed) and configure `sameSite`, `secure`, `httpOnly` appropriately. For a cross-origin SPA (frontend on Vercel, backend on a different domain), cookies need `sameSite: 'none'` + `secure: true` in production.

**Check if `cookie-parser` is installed:** It is NOT listed in `backend/package.json`. It must be added: `npm install cookie-parser`.

The frontend fetch calls must include `credentials: 'include'` to send cookies cross-origin. The `api-client.ts` does NOT currently set `credentials: 'include'`.

### AddressAutocomplete Not Imported Anywhere

The component is built but has a TypeScript signature mismatch: `AddressAutocomplete` calls `api.calculateDeliveryFee()` which doesn't exist on the `ApiClient` type. This will cause a TypeScript compile error when first imported. This must be resolved before importing it.

### Delivery Address in formData

Currently `formData` does not have a `deliveryAddress` field. This needs to be added. The `ContactStep` component (after refactor) will contain the `AddressAutocomplete`. The delivery fee also needs to flow from the address validation back into the parent's total calculation.

### Order.tsx Step Indicator UX

The current step indicator is a row of progress bars. Replacing it with a clickable indicator will require a visual redesign of that section in the header. Keep it minimal — the design system uses gold (`#C6A649`) for active state.

### ReportsManager CSV Export in Quick Export Section

The Quick Export section in `ReportsManager.tsx` calls `exportRevenueSummary()`, `exportOrderVolume()`, etc. After refactor, if these functions move into child components, the Quick Export section must either call the same underlying utils or receive callback functions as props. Using shared `reportUtils.ts` is the cleanest approach.

### server.js Square Dead Code

`backend/server.js` line 54 still references `squarecdn.com` in the CSP `scriptSrc` directive (leftover from Phase 8). This is minor but should be cleaned up during 09-01.

---

## 7. File Inventory for This Phase

**Files to create:**
- `backend/middleware/csrf.js` — CSRF middleware using csrf-csrf
- `src/lib/csrf.ts` — CSRF token store and fetch utility
- `src/components/order/steps/orderStepConstants.ts` — shared constants/utils
- `src/components/order/steps/DateTimeStep.tsx`
- `src/components/order/steps/SizeStep.tsx`
- `src/components/order/steps/FlavorStep.tsx`
- `src/components/order/steps/DetailsStep.tsx`
- `src/components/order/steps/ContactStep.tsx`
- `src/components/dashboard/reports/reportUtils.ts`
- `src/components/dashboard/reports/RevenueReport.tsx`
- `src/components/dashboard/reports/OrderVolumeReport.tsx`
- `src/components/dashboard/reports/CustomerReport.tsx`
- `src/components/dashboard/reports/InventoryReport.tsx`

**Files to modify:**
- `backend/server.js` — add CSRF middleware, fix CSP `scriptSrc` (remove squarecdn), add csrf-token route
- `backend/package.json` — add `csrf-csrf` and `cookie-parser`
- `src/lib/api/index.ts` — add `calculateDeliveryFee()` method
- `src/lib/api-client.ts` — add `credentials: 'include'`, add CSRF token injection for mutating methods
- `src/pages/Order.tsx` — remove delivery `disabled` + `cursor-not-allowed`, add `deliveryAddress` and `deliveryFee` to formData, import AddressAutocomplete, replace step indicator with clickable version, delegate step rendering to step components
- `src/components/dashboard/ReportsManager.tsx` — slim to orchestrator only

---

## Sources

- [csrf-csrf npm package](https://www.npmjs.com/package/csrf-csrf)
- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [JWTs & CSRF Tokens — when do you need them together?](https://medium.com/@gunawardena.buddika/jwts-csrf-tokens-465e5d4f91cf)
