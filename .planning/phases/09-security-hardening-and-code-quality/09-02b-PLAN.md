---
plan: 09-02b
phase: 9
title: ReportsManager Refactor — CustomerReport + InventoryReport + Slim Orchestrator
wave: 2
depends_on:
  - 09-02a
requirements:
  - REFACTOR-02
files_modified:
  - src/components/dashboard/reports/CustomerReport.tsx (create)
  - src/components/dashboard/reports/InventoryReport.tsx (create)
  - src/components/dashboard/ReportsManager.tsx
autonomous: true
---

# Plan 09-02b: ReportsManager Refactor — CustomerReport + InventoryReport + Slim Orchestrator

## Goal

Second half of splitting `src/components/dashboard/ReportsManager.tsx`. Depends on 09-02a (which created `reportUtils.ts`, `RevenueReport.tsx`, `OrderVolumeReport.tsx`). This plan creates the final two report components (`CustomerReport`, `InventoryReport`) and rewrites `ReportsManager.tsx` as a slim orchestrator (~150-200 lines). No visible behavior changes.

## Context

- 09-02a already created: `src/components/dashboard/reports/reportUtils.ts`, `RevenueReport.tsx`, `OrderVolumeReport.tsx`
- `ReportsManager.tsx` is still 855 lines at the start of this plan — it gets slimmed in T03 here
- The Quick Export section in ReportsManager calls export functions from child modules
- `sendEmailReport` stays in ReportsManager (it is unique to the parent and small)
- After this plan, `src/components/dashboard/reports/` has 5 files and `ReportsManager.tsx` is ~150-200 lines

## Tasks

<tasks>

<task id="09-02b-T01">
### Create CustomerReport.tsx

**File:** `src/components/dashboard/reports/CustomerReport.tsx` (create)

Extract from `ReportsManager.tsx`:
- The `customerReport` useMemo (lines ~201-230 approximately)
- The `exportCustomerReport` function
- The Customer detail panel JSX (renders when `activeReport === 'customers'`)

**Props interface:**
```typescript
interface CustomerReportProps {
  filteredOrders: any[];
  dateRange: { start: Date; end: Date };
}
```

Export a named `exportCustomerReport` function: `exportCustomerReport(filteredOrders: any[], dateRange: { start: Date; end: Date }): void`.

Keep all imports inside this file.

<done>
`src/components/dashboard/reports/CustomerReport.tsx` exists, exports the default `CustomerReport` component and named `exportCustomerReport` function.
</done>
</task>

<task id="09-02b-T02">
### Create InventoryReport.tsx

**File:** `src/components/dashboard/reports/InventoryReport.tsx` (create)

Extract from `ReportsManager.tsx`:
- The `inventoryReport` useMemo (lines ~231-252 approximately)
- The `exportInventoryReport` function
- The Inventory detail panel JSX (renders when `activeReport === 'inventory'`)

**Props interface:**
```typescript
interface InventoryReportProps {
  ingredients: any[];
}
```

Export a named `exportInventoryReport` function: `exportInventoryReport(ingredients: any[]): void`.

Keep all imports inside this file.

<done>
`src/components/dashboard/reports/InventoryReport.tsx` exists, exports the default `InventoryReport` component and named `exportInventoryReport` function.
</done>
</task>

<task id="09-02b-T03">
### Slim down ReportsManager.tsx to orchestrator

**File:** `src/components/dashboard/ReportsManager.tsx`

Rewrite `ReportsManager.tsx` to be the data-fetching orchestrator. It keeps:
- All state: `orders`, `ingredients`, `isLoading`, `datePreset`, `activeReport`, `isSendingReport`
- `loadData()` function
- `filteredOrders` useMemo (date filtering)
- The header with date preset selector
- Summary cards section (with `setActiveReport` click handlers)
- Conditional renders of the 4 child report components
- Quick Export section (calls exported functions from the report modules)
- Email report button + `sendEmailReport` function (this function is small and unique to the parent — keep it here)
- Loading spinner

**Remove from ReportsManager.tsx:**
- `generateCSV`, `downloadCSV`, `getDateRange` — import from `./reports/reportUtils`
- `DatePreset` type — import from `./reports/reportUtils`
- `revenueSummary`, `orderVolume`, `customerReport`, `inventoryReport` useMemos — moved to child components
- `exportRevenueSummary`, `exportOrderVolume`, `exportCustomerReport`, `exportInventoryReport` — import from child component files
- The 4 report panel JSX blocks — replaced by `<RevenueReport>`, `<OrderVolumeReport>`, `<CustomerReport>`, `<InventoryReport>`

**Import pattern in the slimmed ReportsManager.tsx:**
```typescript
import { DatePreset, getDateRange } from './reports/reportUtils';
import { RevenueReport, exportRevenueSummary } from './reports/RevenueReport';
import { OrderVolumeReport, exportOrderVolume } from './reports/OrderVolumeReport';
import { CustomerReport, exportCustomerReport } from './reports/CustomerReport';
import { InventoryReport, exportInventoryReport } from './reports/InventoryReport';
```

**Conditional rendering in JSX** (replacing the long detail panel JSX):
```tsx
{activeReport === 'revenue' && (
  <RevenueReport filteredOrders={filteredOrders} dateRange={getDateRange(datePreset)} />
)}
{activeReport === 'volume' && (
  <OrderVolumeReport filteredOrders={filteredOrders} />
)}
{activeReport === 'customers' && (
  <CustomerReport filteredOrders={filteredOrders} dateRange={getDateRange(datePreset)} />
)}
{activeReport === 'inventory' && (
  <InventoryReport ingredients={ingredients} />
)}
```

After this refactor, `ReportsManager.tsx` should be ~150-200 lines.

<done>
`ReportsManager.tsx` is ~150-200 lines, no longer defines `generateCSV`, `downloadCSV`, `getDateRange`, the four useMemo data transforms, or the four inline export functions; it imports all of these from `./reports/` modules and renders the four child components conditionally.
</done>
</task>

</tasks>

## Verification

```bash
cd /Users/luismiguel/Desktop/elis-dulce-tradicion && npm run build
```

Build must pass with zero TypeScript errors.

**Spot check:**
- `src/components/dashboard/reports/` directory contains 5 files: `reportUtils.ts`, `RevenueReport.tsx`, `OrderVolumeReport.tsx`, `CustomerReport.tsx`, `InventoryReport.tsx`
- `src/components/dashboard/ReportsManager.tsx` is significantly shorter (~150-200 lines vs original 855)
- `ReportsManager.tsx` no longer defines `generateCSV`, `downloadCSV`, `getDateRange`, `revenueSummary`, `orderVolume`, `customerReport`, `inventoryReport` useMemos, or the 4 export functions inline
- Each child component file imports only from `@/` paths and `./reportUtils`
- `ReportsManager` still imports `api` and makes the `loadData()` calls (data fetching is not moved)

## must_haves

- [ ] `CustomerReport.tsx` and `InventoryReport.tsx` created in `reports/` directory
- [ ] Each report component receives filtered data as props (parent passes down — no internal API calls)
- [ ] Each report component has internal `useMemo` for its data transformation
- [ ] Each report component exports a named export function for use in Quick Export section of parent
- [ ] `ReportsManager.tsx` slimmed to orchestrator role (~150-200 lines)
- [ ] Quick Export section still works (calls exported functions from child modules)
- [ ] Build passes with zero TypeScript errors
- [ ] No visible behavior changes — all reports still display the same data
