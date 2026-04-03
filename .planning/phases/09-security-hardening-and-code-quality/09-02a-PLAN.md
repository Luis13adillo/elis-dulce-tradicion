---
plan: 09-02a
phase: 9
title: ReportsManager Refactor — reportUtils + RevenueReport + OrderVolumeReport
wave: 1
depends_on: []
requirements:
  - REFACTOR-02
files_modified:
  - src/components/dashboard/reports/reportUtils.ts (create)
  - src/components/dashboard/reports/RevenueReport.tsx (create)
  - src/components/dashboard/reports/OrderVolumeReport.tsx (create)
autonomous: true
---

# Plan 09-02a: ReportsManager Refactor — reportUtils + RevenueReport + OrderVolumeReport

## Goal

First half of splitting `src/components/dashboard/ReportsManager.tsx` (855 lines). Create the shared `reportUtils.ts` module and two of the four report components: `RevenueReport` and `OrderVolumeReport`. These are the utility foundation and first two report extractions. No visible behavior changes.

## Context

- `ReportsManager.tsx` is 855 lines: utility functions at top, 4 `useMemo` data transforms (lines 109-252), 4 CSV export functions + email (lines 254-352), then 500 lines of JSX for 4 conditional report panels + quick export section
- Pattern per context decision: parent (`ReportsManager`) fetches all data and passes `filteredOrders` and `ingredients` as props to each child report component
- CSV export functions live in `reportUtils.ts` — imported by both parent (Quick Export section) and child components (internal Export CSV buttons)
- Each report component owns its `useMemo` data transform (e.g., `RevenueReport` computes `revenueSummary` internally from `filteredOrders`)
- No new behavior, no design changes — strictly structural
- 09-02b depends on this plan and completes the remaining two report components + slims ReportsManager

## Tasks

<tasks>

<task id="09-02a-T01">
### Read the full ReportsManager.tsx source

**File:** `src/components/dashboard/ReportsManager.tsx`

Read the entire file (855 lines) to understand the exact structure before extracting:
- Lines 33-77: CSV helpers + DatePreset type + getDateRange function
- Lines 79-107: Component setup (state, loadData)
- Lines 109-252: 4 useMemo transforms (revenueSummary, orderVolume, customerReport, inventoryReport)
- Lines 254-352: 4 export functions (exportRevenueSummary, exportOrderVolume, exportCustomerReport, exportInventoryReport) + sendEmailReport
- Lines 354-852: JSX for 4 report panels + quick export buttons + loading state

Take note of all import statements at the top — they will need to be split across child components.

<done>
The full ReportsManager.tsx source has been read and the structure (imports, useMemos, export functions, JSX regions) is understood and noted.
</done>
</task>

<task id="09-02a-T02">
### Create src/components/dashboard/reports/reportUtils.ts

**File:** `src/components/dashboard/reports/reportUtils.ts` (create directory and file)

Extract the shared utility functions from `ReportsManager.tsx` lines 33-77:

```typescript
import { subDays, startOfWeek, startOfMonth } from 'date-fns';

// Re-export type for use across report components
export type DatePreset = 'today' | 'this_week' | 'this_month' | 'last_30' | 'last_90' | 'all_time';

export function generateCSV(headers: string[], rows: (string | number)[][]): string {
  const escape = (val: string | number) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(',')];
  rows.forEach(row => lines.push(row.map(escape).join(',')));
  return lines.join('\n');
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getDateRange(preset: DatePreset): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = now;
  switch (preset) {
    case 'today':
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end, label: 'Today' };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end, label: 'This Week' };
    case 'this_month':
      return { start: startOfMonth(now), end, label: 'This Month' };
    case 'last_30':
      return { start: subDays(now, 30), end, label: 'Last 30 Days' };
    case 'last_90':
      return { start: subDays(now, 90), end, label: 'Last 90 Days' };
    case 'all_time':
      return { start: new Date(2020, 0, 1), end, label: 'All Time' };
  }
}
```

<done>
`src/components/dashboard/reports/reportUtils.ts` exists and exports `DatePreset`, `generateCSV`, `downloadCSV`, and `getDateRange`.
</done>
</task>

<task id="09-02a-T03">
### Create RevenueReport.tsx

**File:** `src/components/dashboard/reports/RevenueReport.tsx` (create)

Extract from `ReportsManager.tsx`:
- The `revenueSummary` useMemo (lines ~109-162)
- The `exportRevenueSummary` function (lines ~254-280)
- The Revenue detail panel JSX (the panel that renders when `activeReport === 'revenue'`, lines ~354-500 approximately)

**Props interface:**
```typescript
interface RevenueReportProps {
  filteredOrders: any[];
  dateRange: { start: Date; end: Date };
}
```

The component:
1. Computes `revenueSummary` internally via `useMemo` from `filteredOrders`
2. Renders the revenue table / breakdown
3. Has an "Export CSV" button that calls `downloadCSV` from `reportUtils.ts` directly

Export a named `exportRevenueSummary` function from this file (signature: `exportRevenueSummary(filteredOrders: any[], dateRange: { start: Date; end: Date }): void`) so `ReportsManager` can call it from the Quick Export section.

Keep all imports (`date-fns`, lucide icons, shadcn components) inside this file. Use `@/` imports throughout.

<done>
`src/components/dashboard/reports/RevenueReport.tsx` exists, exports the default `RevenueReport` component and named `exportRevenueSummary` function.
</done>
</task>

<task id="09-02a-T04">
### Create OrderVolumeReport.tsx

**File:** `src/components/dashboard/reports/OrderVolumeReport.tsx` (create)

Extract from `ReportsManager.tsx`:
- The `orderVolume` useMemo (lines ~163-200 approximately)
- The `exportOrderVolume` function
- The Order Volume detail panel JSX (renders when `activeReport === 'volume'`)

**Props interface:**
```typescript
interface OrderVolumeReportProps {
  filteredOrders: any[];
}
```

Export a named `exportOrderVolume` function: `exportOrderVolume(filteredOrders: any[]): void`.

Keep all imports inside this file.

<done>
`src/components/dashboard/reports/OrderVolumeReport.tsx` exists, exports the default `OrderVolumeReport` component and named `exportOrderVolume` function.
</done>
</task>

</tasks>

## Verification

```bash
cd /Users/luismiguel/Desktop/elis-dulce-tradicion && npm run build
```

Build must pass with zero TypeScript errors. (Note: `ReportsManager.tsx` is not yet slimmed at this stage — that happens in 09-02b. The new files must compile cleanly when imported.)

**Spot check:**
- `src/components/dashboard/reports/` directory exists with 3 files: `reportUtils.ts`, `RevenueReport.tsx`, `OrderVolumeReport.tsx`
- `reportUtils.ts` exports `DatePreset`, `generateCSV`, `downloadCSV`, `getDateRange`
- `RevenueReport.tsx` and `OrderVolumeReport.tsx` each export a default component and a named export function

## must_haves

- [ ] `src/components/dashboard/reports/reportUtils.ts` created with `generateCSV`, `downloadCSV`, `getDateRange`, `DatePreset`
- [ ] `RevenueReport.tsx` created in `reports/` directory — computes `revenueSummary` via internal `useMemo`, exports `exportRevenueSummary`
- [ ] `OrderVolumeReport.tsx` created in `reports/` directory — computes `orderVolume` via internal `useMemo`, exports `exportOrderVolume`
- [ ] Each component receives filtered data as props (no internal API calls)
- [ ] Build passes with zero TypeScript errors
