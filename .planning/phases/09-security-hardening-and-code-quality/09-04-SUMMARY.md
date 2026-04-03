---
phase: 9
plan: "09-04"
subsystem: order-wizard
tags: [refactor, code-quality, component-extraction, order-flow]
dependency_graph:
  requires: [09-03]
  provides: [order-step-components, clickable-step-indicator]
  affects: [src/pages/Order.tsx, src/components/order/steps/]
tech_stack:
  added: []
  patterns: [feature-based-folder-organization, props-down-pattern, validator-exports, summary-getter-exports]
key_files:
  created:
    - src/components/order/steps/orderStepConstants.ts
    - src/components/order/steps/DateTimeStep.tsx
    - src/components/order/steps/SizeStep.tsx
    - src/components/order/steps/FlavorStep.tsx
    - src/components/order/steps/DetailsStep.tsx
    - src/components/order/steps/ContactStep.tsx
  modified:
    - src/pages/Order.tsx
decisions:
  - FloatingInput co-located in DetailsStep.tsx and imported by ContactStep — avoids creating a separate file for a small helper used in exactly 2 steps
  - onCameraCapture prop defined in DetailsStep interface but camera logic handled internally via onImageChange — simplifies parent-child contract
  - handlePhoneChange refactored from event-based to string-based signature — ContactStep passes e.target.value explicitly for clarity
  - validateFlavorStep accepts selectedFillings[] (required) but Order.tsx also checks hasPendingPremiumSelection before delegating — preserves premium filling UX constraint
metrics:
  duration: "8 minutes"
  completed: "2026-04-03"
  tasks_completed: 7
  tasks_total: 7
  files_modified: 7
requirements_satisfied:
  - REFACTOR-01
---

# Phase 9 Plan 04: Order.tsx Refactor — Extract Step Components + Migrate Delivery into ContactStep Summary

## One-Liner

Extracted 5 step components (DateTimeStep, SizeStep, FlavorStep, DetailsStep, ContactStep) from the 1,100-line Order.tsx monolith, migrated delivery UI into ContactStep, and replaced decorative progress bars with a clickable step indicator showing per-step summaries.

## What Was Built

Split `src/pages/Order.tsx` into 6 files under `src/components/order/steps/`:

1. **orderStepConstants.ts** — Shared FALLBACK_* arrays and `formatTimeDisplay` extracted from Order.tsx
2. **DateTimeStep.tsx** — Date picker + time slot grid + lead time display. Exports `validateDateTimeStep` and `getDateTimeSummary`.
3. **SizeStep.tsx** — Serving guide banner + loading skeleton + size selection grid. Exports `validateSizeStep` and `getSizeSummary`.
4. **FlavorStep.tsx** — Bread type selector + filling multi-select + premium size popup. Exports `validateFlavorStep` and `getFlavorSummary`.
5. **DetailsStep.tsx** — Theme/dedication inputs + image upload + camera capture. Also exports the `FloatingInput` helper component used by ContactStep.
6. **ContactStep.tsx** — Name/phone/email fields + enabled delivery button + `AddressAutocomplete` + delivery fee badge + consent checkbox. Exports `validateContactStep` and `getContactSummary`.

**Order.tsx changes:**
- Imports all step components and constants from `@/components/order/steps/`
- Removed ~500 lines of inline JSX (FALLBACK_* constants, FloatingInput, 5 step regions)
- Replaced decorative `div` progress bars with `button` elements that jump to completed steps and show summary text (date, size, flavor, details, contact)
- `validateStep()` delegates to per-step validator functions
- `goToStep()` handler allows clicking back to completed steps

## Deviations from Plan

None — plan executed exactly as written.

## Verification

Build passed with zero TypeScript errors:

```
vite v5.4.19 building for production...
4349 modules transformed.
built in 29.02s
```

Spot checks:
- `src/components/order/steps/` contains all 6 files
- `Order.tsx` no longer contains `FALLBACK_CAKE_SIZES` declarations or `FloatingInput` definition
- `AddressAutocomplete` is in `ContactStep.tsx`, not directly imported in `Order.tsx`
- Delivery button in `ContactStep.tsx` has no `disabled` prop or `cursor-not-allowed`
- Step indicator uses `<button>` elements with `goToStep()` click handlers

## Task Commits

| Task | Description | Commit |
|------|-------------|--------|
| 09-04-T01 | Create orderStepConstants.ts | 261b7b3 |
| 09-04-T02 | Create DateTimeStep.tsx | 48d0ec4 |
| 09-04-T03 | Create SizeStep.tsx | 9a4ecfd |
| 09-04-T04 | Create FlavorStep.tsx | 598d4b5 |
| 09-04-T05 | Create DetailsStep.tsx | 0b0824c |
| 09-04-T06 | Create ContactStep.tsx | 50dc75f |
| 09-04-T07 | Refactor Order.tsx | 0a55908 |
