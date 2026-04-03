---
phase: 09-security-hardening-and-code-quality
plan: "03"
subsystem: ui
tags: [react, typescript, google-maps, delivery, api-client, order-flow]

# Dependency graph
requires:
  - phase: 09-01
    provides: CSRF middleware on backend — delivery fee endpoint is protected
provides:
  - calculateDeliveryFee(address, zipCode) method on ApiClient calling GET /api/v1/delivery/calculate-fee
  - Delivery option enabled in Order.tsx step 5 (Contact) with AddressAutocomplete, out-of-zone auto-revert, delivery fee display
  - delivery_address and delivery_fee fields in order payload sent to PaymentCheckout
affects:
  - 09-04 (Order.tsx step extraction — depends on this delivery wiring being in place)
  - PaymentCheckout.tsx (receives delivery_address and delivery_fee via sessionStorage pendingOrder)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Out-of-zone auto-revert: when AddressAutocomplete reports serviceable===false, pickupType switches back to pickup and toast.error fires
    - Delivery fee as separate state (not in formData) — computed from API response, added to getTotal()

key-files:
  created: []
  modified:
    - src/lib/api/index.ts
    - src/pages/Order.tsx

key-decisions:
  - "deliveryFee kept as separate state (not in formData) — it is a computed/derived value from the API, not a form field the user edits"
  - "AddressAutocomplete already handles the calculateDeliveryFee API call internally via its place_changed listener — Order.tsx only receives results via handleAddressChange callback"
  - "Delivery address validation added to validateStep info case before consentGiven check — gate ordering: name, phone, email, address, consent"

patterns-established:
  - "handleAddressChange(address, isValid, placeDetails?, deliveryInfo?) — receives full delivery info from AddressAutocomplete callback and drives pickupType revert logic"

requirements-completed:
  - SEC-06

# Metrics
duration: 6min
completed: 2026-04-03
---

# Phase 9 Plan 03: Delivery Enablement Summary

**Delivery option enabled in Order.tsx — AddressAutocomplete wired with out-of-zone auto-revert, calculateDeliveryFee added to ApiClient, delivery fields in order payload**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-03T12:50:00Z
- **Completed:** 2026-04-03T12:56:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added `calculateDeliveryFee(address, zipCode)` to `ApiClient` — calls `GET /api/v1/delivery/calculate-fee` on Express backend, returns `{ serviceable, fee, zone, distance, estimatedTime }`, graceful fallback on error
- Enabled delivery button in Order.tsx step 5: removed `disabled` prop and `cursor-not-allowed` class, replaced with active onClick handler
- Wired `AddressAutocomplete` component into the Contact step with conditional render on `pickupType === 'delivery'`
- Implemented `handleAddressChange` with out-of-zone auto-revert: switches `pickupType` back to `'pickup'` and shows `toast.error` when `serviceable === false`
- Delivery fee displayed in UI as gold badge, included in `getTotal()` calculation
- `delivery_address` and `delivery_fee` included in `orderData` payload sent to `PaymentCheckout` via `sessionStorage`
- Contact step validation requires non-empty `deliveryAddress` when `pickupType === 'delivery'`
- Build verified green: zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Add calculateDeliveryFee to ApiClient** - `181f8da` (feat)
2. **Task 2: Wire delivery into Order.tsx** - `8c1c58a` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `src/lib/api/index.ts` - Added `calculateDeliveryFee(address, zipCode)` method after `createPaymentIntent`
- `src/pages/Order.tsx` - Added `deliveryAddress` to formData, `deliveryFee` state, `handleAddressChange` handler, enabled delivery button, AddressAutocomplete in Contact step, updated getTotal and order payload, updated validateStep

## Decisions Made
- `deliveryFee` is kept as separate state (not in `formData`) because it is a computed/derived value from the delivery API response, not a user-input field
- `AddressAutocomplete` already handles the `calculateDeliveryFee` API call internally via its `place_changed` listener — `Order.tsx` only receives results via the `handleAddressChange` callback parameter `deliveryInfo`
- Delivery address validation placed before consent check in `validateStep` — gate ordering: name, phone, email, delivery address (conditional), consent

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - build passed on first attempt.

## User Setup Required
None - no external service configuration required beyond what already exists (Google Maps API key for AddressAutocomplete, Express backend running for delivery fee endpoint).

## Next Phase Readiness
- Delivery option is now fully functional in the order flow
- 09-04 (Order.tsx step component extraction) can now proceed — delivery wiring is in place
- Google Maps API key (`VITE_GOOGLE_MAPS_API_KEY`) must be set in `.env` for AddressAutocomplete to function; without it the component shows a manual input fallback warning

---
*Phase: 09-security-hardening-and-code-quality*
*Completed: 2026-04-03*
