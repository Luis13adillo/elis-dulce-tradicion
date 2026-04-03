# Phase 5: Dashboard & Front Desk Fixes - Research

**Researched:** 2026-04-02
**Domain:** React/TypeScript dashboard bug fixes, Supabase SQL, Express.js backend
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Calendar Month Grid (FIX-03)**
- Day cells show: date number + order count + capacity fill bar
- Capacity bar colors: green = under 50%, yellow = 50-80%, red = 80%+ (traffic light)
- Days with 0 orders: date number only, no bar shown
- Past days (earlier this month): dimmed/muted styling; today and future days full color
- Clicking a day expands to show full order cards (same card design as order feed)
- Month grid appears in BOTH dashboards (Owner Dashboard + Front Desk)

**Error States (FIX-08)**
- On load failure: skeleton placeholder stays visible + sonner toast notification appears
- Toast has a Retry button (not just informational)
- Triggers on BOTH initial data fetch failure AND real-time subscription disconnect
- Applies consistently to all 3 panels: order feed, inventory, delivery

**Settings Tab Layout (FIX-05)**
- 3 CMS managers exposed as sub-tabs within the existing Settings tab
- Sub-tab labels: "Business Hours" | "Contact Submissions" | "Order Issues"
- Default sub-tab: preserve whatever the current Settings default is — just append the 3 new sub-tabs
- Components wired in with light visual polish to match dashboard style (colors, fonts)
- English only — no bilingual requirement for these admin tools

**Capacity Setting UX (FIX-06)**
- Lives inside Business Settings (within the Settings tab)
- Interaction: number input field + explicit Save button (no auto-save)
- Single global value — applies uniformly to every day (not per-day-of-week)
- If new value < current day's order count: show a warning (non-blocking) but allow save
- Save success: sonner toast "Daily capacity updated"

### Claude's Discretion
- Exact visual layout of sub-tabs within Settings (pill tabs vs underline tabs vs bordered)
- Capacity warning message wording
- Exact skeleton design for loading states
- MISS-04, MISS-05, MISS-08 are direct bug fixes — implementation approach is straightforward

### Deferred Ideas (OUT OF SCOPE)
- Per-day-of-week capacity configuration — more complex, own phase when needed
- Bilingual Settings tab labels — can add in a translation pass later
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FIX-02 | Populate Most Ordered Items from `v_popular_items` analytics view | `api.getPopularItems()` queries non-existent `order_items` table; must switch to direct Supabase view query on `v_popular_items` |
| FIX-03 | Render month calendar view in FrontDesk (OwnerCalendar already has month view) | FrontDesk `renderContent()` has no `calendar` case; must add it with `OwnerCalendar` or a dedicated month grid component |
| FIX-04 | Remove stub 'New Order' buttons from Owner calendar views | `OrderScheduler.tsx` line 154-157 has a green "New Order" button; remove the button element |
| FIX-05 | Expose hidden CMS tools in Settings tab | **ALREADY DONE** in current `OwnerDashboard.tsx` (lines 641-644); verify it renders correctly in production |
| FIX-06 | Move maxDailyCapacity to `business_settings` table | `max_daily_capacity` field referenced in TypeScript but NOT in the database schema; needs Supabase migration to add column |
| FIX-07 | Fetch calendar hours dynamically from `business_hours` table | `TIME_OPTIONS` hardcoded in `Order.tsx`; `OrderScheduler.tsx` hardcoded 6-22; must fetch from `/api/capacity/business-hours` |
| FIX-08 | Add error states and retry buttons to order feed, inventory, delivery panels | Order feed error state already exists; verify inventory (`FrontDeskInventory`) and delivery (`DeliveryManagementPanel`) |
| MISS-04 | Fix `capacity.js` line 142 — queries `profiles` table | Change `'SELECT role FROM profiles'` to `'SELECT role FROM user_profiles'` |
| MISS-05 | Fix `analytics-views.sql` line 186/189 — `iu.used_at` to `iu.created_at` | Reference file only (not an applied migration); fix in reference file; verify `ingredient_usage` table has `created_at` not `used_at` |
| MISS-08 | Enable RLS policies on CMS tables | `cms-schema.sql` has RLS policies commented out; need a new Supabase migration file to enable them |
</phase_requirements>

---

## Summary

Phase 5 is a targeted bug-fix phase touching 10 specific issues across frontend, backend, and SQL. Research reveals that several issues are simpler than expected (FIX-05 is already done), while others have subtle root causes that must be understood before implementation.

The most important discovery: `api.getPopularItems()` (FIX-02) queries a non-existent `order_items` table instead of the `v_popular_items` analytics view. The fix requires rewriting the method to query `v_popular_items` via Supabase RPC or direct view query.

For FIX-06 (capacity), the `business_settings` TypeScript type already has `max_daily_capacity?: number` but the actual PostgreSQL table schema in `cms-schema.sql` does NOT have this column. A Supabase migration must add it before the UI can save/read the value. The backend `capacity.js` default of 10 (not 20) is confirmed.

FIX-03 (calendar in FrontDesk) requires adding a `calendar` case to `renderContent()`. The `OwnerCalendar` component already has a full month/week/day implementation that can be reused. However, the locked decision specifies a capacity fill bar in month cells — OwnerCalendar's month view currently shows an order count badge (color coded) but not a fill bar. The month grid logic needs to accept a `maxCapacity` prop to render the fill bar.

**Primary recommendation:** Fix issues in this order: backend bugs first (MISS-04, MISS-05), database migration (MISS-08, FIX-06), then frontend wiring (FIX-02, FIX-03, FIX-04, FIX-07, FIX-08).

---

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Relevance |
|---------|---------|---------|-----------|
| React + TypeScript | 18.3.1 | Component rendering | All UI changes |
| Supabase JS | 2.78.0 | Direct view queries, RLS | FIX-02, MISS-08 |
| Tailwind CSS | 3.4.17 | Styling | All visual changes |
| sonner | (via shadcn) | Toast notifications | FIX-08 error states |
| date-fns | (in project) | Calendar grid logic | FIX-03 month grid |
| framer-motion | 12.23.24 | Animations | Calendar day expand |

### No new dependencies needed
All fixes use existing project stack.

---

## Architecture Patterns

### Pattern 1: Supabase View Query
**What:** Query a Supabase view directly like a table
**When to use:** FIX-02 — `v_popular_items` is a view, not an RPC function
```typescript
// Source: verified from existing api/modules/analytics.ts pattern
const { data, error } = await sb
  .from('v_popular_items')
  .select('item_type, item_name, order_count, total_revenue')
  .order('order_count', { ascending: false })
  .limit(5);
```

### Pattern 2: Supabase Migration for Column Addition
**What:** Add column to existing table via migration file
**When to use:** FIX-06 — `business_settings` needs `max_daily_capacity` column
```sql
-- New migration: supabase/migrations/YYYYMMDD_add_max_daily_capacity.sql
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS max_daily_capacity INTEGER NOT NULL DEFAULT 10;
```

### Pattern 3: FrontDesk renderContent() Case Addition
**What:** Add a new `activeView` case in FrontDesk.tsx
**When to use:** FIX-03 — add `calendar` view
```typescript
// In renderContent() function in FrontDesk.tsx
if (activeView === 'calendar') {
  return (
    <OwnerCalendar
      orders={orders}
      onOrderClick={(order) => setSelectedOrder(order)}
      maxDailyCapacity={maxDailyCapacity}
    />
  );
}
```

### Pattern 4: Toast Error with Retry (sonner)
**What:** Show a sonner toast with an action button
**When to use:** FIX-08 error states
```typescript
// Source: existing toast pattern in project
import { toast } from 'sonner';
toast.error(t('Error al cargar', 'Failed to load'), {
  action: {
    label: t('Reintentar', 'Retry'),
    onClick: () => retryFetch(),
  },
});
```

### Pattern 5: Dynamic TIME_OPTIONS from Business Hours
**What:** Convert `business_hours` API response to time slots array
**When to use:** FIX-07 — replace hardcoded TIME_OPTIONS
```typescript
// Derive time slots from business hours for the selected day
const getTimeOptions = (businessHours: BusinessHours[], dayOfWeek: number): string[] => {
  const day = businessHours.find(h => h.day_of_week === dayOfWeek);
  if (!day || day.is_closed) return [];
  const open = parseInt(day.open_time.split(':')[0]);
  const close = parseInt(day.close_time.split(':')[0]);
  const slots: string[] = [];
  for (let h = open; h <= close; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
  }
  return slots;
};
```

### Anti-Patterns to Avoid
- **Querying `order_items`:** This table does not exist in this project. Cake orders store attributes on the `orders` row directly (cake_size, filling, theme). The `v_popular_items` view already aggregates these correctly.
- **Hardcoding capacity default in frontend:** The default should come from `business_settings.max_daily_capacity`; the frontend should never hardcode 10 or 20.
- **Creating a new calendar component for FrontDesk:** Reuse `OwnerCalendar` which already has the full month/week/day implementation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Popular items aggregation | Custom SQL/JS aggregation | `v_popular_items` view | View already handles 30-day window, cancelled order exclusion, and three item_types |
| Toast with retry | Custom toast UI | `sonner` action button | Already in project, pattern exists |
| Calendar grid | New calendar component | `OwnerCalendar` (already built) | Full month/week/day already implemented |
| Capacity warning | Complex validation | Simple count comparison + non-blocking toast warning | Decision says non-blocking |

---

## Common Pitfalls

### Pitfall 1: FIX-02 — Wrong Table Name
**What goes wrong:** `getPopularItems()` calls `sb.from('order_items')` — this table does not exist in the schema. The method silently returns `[]` on every call, causing "Most Ordered" to always show empty.
**Why it happens:** The analytics module was written assuming a normalized order_items table, but this project stores order details on the `orders` row.
**How to avoid:** Query `v_popular_items` view directly, or query `orders` with GROUP BY on `cake_size`, `filling`, `theme`. The `v_popular_items` view already handles this correctly.
**Warning signs:** `popular` array is always empty even when orders exist; Supabase query returns `{ data: null, error: { code: '42P01' } }` (table doesn't exist).

### Pitfall 2: FIX-05 — Already Implemented
**What goes wrong:** Spending time implementing FIX-05 when it's already done.
**Why it matters:** `OwnerDashboard.tsx` lines 619-645 already have the 4-tab Settings implementation including BusinessHoursManager, ContactSubmissionsManager, and OrderIssuesManager. The state variable `settingsSubTab` with values `'business' | 'hours' | 'contacts' | 'issues'` is already defined at line 106.
**Correct action:** Verify the UI renders and functions correctly. If it works, mark FIX-05 as done and skip implementation.

### Pitfall 3: FIX-06 — Missing Database Column
**What goes wrong:** `businessSettings?.max_daily_capacity` returns undefined because the column doesn't exist in the `business_settings` table yet (it's only defined in the TypeScript interface).
**Why it happens:** `cms-schema.sql` defines `business_settings` without a `max_daily_capacity` column. The TypeScript type in `cms.ts` has `max_daily_capacity?: number` but this is ahead of the actual schema.
**How to avoid:** Write a migration (`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS max_daily_capacity INTEGER NOT NULL DEFAULT 10`) before wiring up the UI save functionality.
**Verification:** After migration, `useBusinessSettings()` hook will return the field with value 10.

### Pitfall 4: FIX-03 — Month Calendar Capacity Bar
**What goes wrong:** The OwnerCalendar month view currently shows order count with color-coded badges (red/orange/blue based on order count thresholds 5+/3+/other), NOT a capacity fill bar as specified in locked decisions.
**What's needed:** The month grid cells need a progress bar showing `(order_count / max_daily_capacity) * 100%` with traffic light colors (green < 50%, yellow 50-80%, red 80%+).
**How to avoid:** Pass `maxDailyCapacity` as a prop to `OwnerCalendar` and update the month view cells to render the capacity bar. The existing `orderCountByDate` map already has the order counts.

### Pitfall 5: FIX-07 — Time Slots for Order.tsx
**What goes wrong:** `Order.tsx` hardcodes `TIME_OPTIONS` as a module-level constant. The `useBusinessHours` hook (from `useCMS`) should be called inside the component and used to derive slots dynamically. But the hook requires Supabase auth context; make sure it's called at the component level, not in a nested function.
**How to avoid:** Use `useBusinessHours()` from `@/lib/hooks/useCMS` (already imported in OwnerDashboard.tsx and available). Show all hardcoded slots as fallback if the hook returns empty.

### Pitfall 6: MISS-05 — Reference File vs Applied Migration
**What goes wrong:** `backend/db/analytics-views.sql` is a REFERENCE file, not an applied Supabase migration. Editing it won't fix the production database.
**What's needed:** Check if `v_inventory_usage` view exists in Supabase. If it does, run a corrected `CREATE OR REPLACE VIEW` SQL directly in Supabase SQL editor. Also create a `supabase/migrations/` file for the fix so it's tracked.
**Root cause of bug:** Line 186 references `iu.used_at` in the WHERE clause, but the `ingredient_usage` table schema shows only `created_at` (not `used_at`). The view will fail if this filter is evaluated.

### Pitfall 7: MISS-08 — CMS RLS Policies
**What goes wrong:** `business_settings`, `gallery_items`, `faqs`, `announcements`, `business_hours` tables may have RLS enabled but with no policies (which blocks all access), OR RLS disabled (which allows public access). Both are wrong.
**What's needed:** A Supabase migration that: (1) enables RLS on each CMS table, (2) adds a public-read policy for tables the frontend needs anonymously, (3) adds owner-only write policy. The policies are already written in `cms-schema.sql` lines 226-230 (commented out) — just need to be applied.

### Pitfall 8: FIX-04 — OrderScheduler Used in TWO Contexts
**What goes wrong:** `OrderScheduler` is used in BOTH FrontDesk (`upcoming` view) AND potentially Owner calendar. The "New Order" button should be removed in both usages.
**Correct action:** Remove the button from `OrderScheduler.tsx` entirely (line 154-157). The `Plus` import from lucide-react becomes unused and should also be removed.

---

## Code Examples

Verified patterns from official sources and project code:

### Fix getPopularItems() to Query v_popular_items
```typescript
// File: src/lib/api/modules/analytics.ts
async getPopularItems() {
    const sb = this.ensureSupabase();
    if (!sb) return [];

    try {
        const { data, error } = await sb
            .from('v_popular_items')
            .select('item_type, item_name, order_count, total_revenue')
            .order('order_count', { ascending: false })
            .limit(10);

        if (error) throw error;
        if (!data || data.length === 0) return [];

        return data.map((item: any) => ({
            name: item.item_name,
            count: item.order_count,
            revenue: item.total_revenue,
            type: item.item_type,  // 'size' | 'filling' | 'theme'
        }));
    } catch (err) {
        console.warn('Could not fetch popular items:', err);
        return [];
    }
}
```

### Migration: Add max_daily_capacity Column
```sql
-- File: supabase/migrations/YYYYMMDD_add_max_daily_capacity.sql
ALTER TABLE business_settings
    ADD COLUMN IF NOT EXISTS max_daily_capacity INTEGER NOT NULL DEFAULT 10;

-- Update the trigger (already exists, no change needed)
-- Update existing row to set the value
UPDATE business_settings SET max_daily_capacity = 10 WHERE max_daily_capacity IS NULL;
```

### Migration: Enable CMS RLS Policies
```sql
-- File: supabase/migrations/YYYYMMDD_cms_rls_policies.sql

-- business_settings: public read, owner write
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read business settings" ON business_settings;
CREATE POLICY "Public can read business settings" ON business_settings
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owner can manage business settings" ON business_settings;
CREATE POLICY "Owner can manage business settings" ON business_settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );

-- gallery_items: public read active, owner write
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active gallery items" ON gallery_items;
CREATE POLICY "Public can view active gallery items" ON gallery_items
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Owner can manage gallery items" ON gallery_items;
CREATE POLICY "Owner can manage gallery items" ON gallery_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );

-- faqs: public read active, owner write
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active faqs" ON faqs;
CREATE POLICY "Public can view active faqs" ON faqs
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Owner can manage faqs" ON faqs;
CREATE POLICY "Owner can manage faqs" ON faqs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );

-- business_hours: public read, owner/baker write
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view business hours" ON business_hours;
CREATE POLICY "Public can view business hours" ON business_hours
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage business hours" ON business_hours;
CREATE POLICY "Admins can manage business hours" ON business_hours
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role IN ('owner', 'baker'))
    );

-- announcements: public read active, owner write
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active announcements" ON announcements;
CREATE POLICY "Public can view active announcements" ON announcements
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Owner can manage announcements" ON announcements;
CREATE POLICY "Owner can manage announcements" ON announcements
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );
```

### Fix capacity.js MISS-04
```javascript
// File: backend/routes/capacity.js, line 141-144
// BEFORE (broken):
const userResult = await pool.query(
    'SELECT role FROM profiles WHERE id = $1',
    [req.user?.id]
);
// AFTER (fixed):
const userResult = await pool.query(
    'SELECT role FROM user_profiles WHERE user_id = $1',
    [req.user?.id]
);
```

### Fix analytics-views.sql MISS-05
```sql
-- File: backend/db/analytics-views.sql, line 186-189
-- BEFORE (broken): WHERE iu.used_at >= CURRENT_DATE - INTERVAL '30 days' OR iu.used_at IS NULL
-- AFTER (fixed):
WHERE iu.created_at >= CURRENT_DATE - INTERVAL '30 days' OR iu.created_at IS NULL
-- Also fix line 186: COALESCE(MAX(iu.used_at), i.last_updated) as last_used
-- AFTER:
COALESCE(MAX(iu.created_at), i.last_updated) as last_used
```

### Add Calendar Case to FrontDesk renderContent()
```typescript
// File: src/pages/FrontDesk.tsx — add after the 'upcoming' case
if (activeView === 'calendar') {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <OwnerCalendar
        orders={orders}
        onOrderClick={(order) => setSelectedOrder(order)}
        maxDailyCapacity={maxDailyCapacity}
      />
    </div>
  );
}
```

### OwnerCalendar: Month Cell Capacity Bar
```typescript
// In OwnerCalendar.tsx month view — replace existing badge with capacity bar
// Requires new prop: maxDailyCapacity?: number
const fillPct = maxDailyCapacity ? Math.min(100, (counts.total / maxDailyCapacity) * 100) : 0;
const barColor = fillPct >= 80 ? 'bg-red-500' : fillPct >= 50 ? 'bg-yellow-500' : 'bg-green-500';

// In the month cell render:
{counts && counts.total > 0 && (
  <div className="mt-1 space-y-0.5">
    <span className="text-xs font-bold text-gray-600">
      {counts.total} {counts.total === 1 ? t('pedido', 'order') : t('pedidos', 'orders')}
    </span>
    {maxDailyCapacity && (
      <div className="w-full bg-gray-200 rounded-full h-1.5">
        <div
          className={cn('h-1.5 rounded-full transition-all', barColor)}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    )}
  </div>
)}
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `order_items` table query | `v_popular_items` view query | View exists, handles 30-day window correctly |
| Hardcoded TIME_OPTIONS constant | Dynamic slots from `business_hours` API | Order form adapts to actual business hours |
| `profiles` table in capacity.js | `user_profiles` table | Matches actual production schema |
| CMS tables without RLS | CMS tables with proper RLS policies | Prevents unauthorized write access |

**Deprecated/outdated:**
- `order_items` reference in analytics module — table does not exist in this project's schema

---

## Critical Pre-Implementation Audit

### FIX-05 Status: ALREADY IMPLEMENTED
Verified in `OwnerDashboard.tsx` lines 106, 619-645:
- `settingsSubTab` state: `'business' | 'hours' | 'contacts' | 'issues'`
- 4 sub-tabs rendered in the Settings tab UI
- `BusinessSettingsManager`, `BusinessHoursManager`, `ContactSubmissionsManager`, `OrderIssuesManager` all imported and conditionally rendered

**The only work needed for FIX-05:** Add the capacity input field inside `BusinessSettingsManager` (FIX-06 integration) and verify the components function correctly.

### FIX-03 Status: PARTIAL
- `OwnerCalendar.tsx`: Month/Week/Day views fully implemented, INCLUDING a month grid at lines 183-245
- `FrontDesk.tsx renderContent()`: Has `upcoming` (uses OrderScheduler), but NO `calendar` case
- The `KitchenRedesignedLayout` / navigation already has a `calendar` option in `activeView` type (defined line 76 as `'queue' | 'upcoming' | 'calendar' | 'inventory' | 'deliveries' | 'reports'`)
- **Work needed:** Add `calendar` case to `renderContent()`, update `OwnerCalendar` to accept/use `maxDailyCapacity` for capacity bars

### FIX-06 Status: PARTIAL
- TypeScript type `BusinessSettings` in `cms.ts` already has `max_daily_capacity?: number`
- `OwnerDashboard.tsx` line 415 already reads `businessSettings?.max_daily_capacity || 20`
- **Gap:** The `business_settings` PostgreSQL table does NOT have this column (not in `cms-schema.sql`)
- **Gap:** `BusinessSettingsManager.tsx` does not have a capacity input field
- **Work needed:** (1) Migration to add column, (2) Add number input + Save to BusinessSettingsManager

### FIX-02 Status: BROKEN (root cause identified)
- `api.getPopularItems()` exists and is called in OwnerDashboard
- Method queries `order_items` table — this table does NOT exist in the schema
- `v_popular_items` view exists in `analytics-views.sql` and queries `orders` columns directly
- **Work needed:** Rewrite `getPopularItems()` to query `v_popular_items`
- **Note:** `backend/db/` files are reference-only per STATE.md. The view may or may not be applied in production. If `v_popular_items` doesn't exist, fallback to querying `orders` directly with GROUP BY.

---

## Open Questions

1. **Does `v_popular_items` view actually exist in the production Supabase database?**
   - What we know: It's defined in `backend/db/analytics-views.sql` (reference file)
   - What's unclear: Whether this was applied to production during initial setup
   - Recommendation: Write `getPopularItems()` to try `v_popular_items` first, fallback to direct `orders` GROUP BY query if the view doesn't exist (handle the `42P01` error code)

2. **Does `business_settings` table exist in production with any rows?**
   - What we know: `cms.ts` gracefully handles missing table (`PGRST116` / `42P01` error codes)
   - What's unclear: Whether the CMS migration was ever applied to production
   - Recommendation: Migration for `max_daily_capacity` column should use `ADD COLUMN IF NOT EXISTS`; UI should always show a fallback value of 10

3. **Does `contact_submissions` table exist?**
   - The `ContactSubmissionsManager` component exists but the table schema was not found in reviewed files
   - Recommendation: Verify at implementation time; the component likely handles the missing-table case

4. **What does `KitchenRedesignedLayout` show for the `calendar` nav item?**
   - `activeView === 'calendar'` is in the type definition but `renderContent()` has no case for it
   - The nav item likely exists and is clickable but shows nothing
   - Recommendation: Verify the nav item is visible in FrontDesk and add the `calendar` case

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/pages/OwnerDashboard.tsx` — Settings tab already wired (FIX-05 done)
- Direct code inspection: `src/lib/api/modules/analytics.ts` — confirms `order_items` bug (FIX-02)
- Direct code inspection: `src/pages/FrontDesk.tsx` — confirms no `calendar` case in renderContent (FIX-03)
- Direct code inspection: `src/components/dashboard/OwnerCalendar.tsx` — confirms month grid exists
- Direct code inspection: `src/components/dashboard/OrderScheduler.tsx` line 154-157 — confirms stub button (FIX-04)
- Direct code inspection: `backend/routes/capacity.js` line 141-144 — confirms `profiles` bug (MISS-04)
- Direct code inspection: `backend/db/analytics-views.sql` lines 186-189 — confirms `used_at` bug (MISS-05)
- Direct code inspection: `backend/db/cms-schema.sql` lines 226-230 — confirms RLS commented out (MISS-08)
- Direct code inspection: `src/lib/cms.ts` — confirms `max_daily_capacity?: number` in TypeScript type
- Direct code inspection: `backend/db/cms-schema.sql` — confirms `max_daily_capacity` NOT in SQL schema (FIX-06 gap)

### Secondary (MEDIUM confidence)
- Project STATE.md confirms: "backend/db/ files are reference library only — NOT applied migrations"
- Project CONTEXT.md confirms: "Default capacity is 10 (not 20)" — verified in capacity.js line 102

---

## Metadata

**Confidence breakdown:**
- Bug locations: HIGH — all verified by direct code inspection
- Fix implementations: HIGH — standard patterns, all building on existing code
- Database migration approach: HIGH — uses standard Supabase `ADD COLUMN IF NOT EXISTS` pattern
- FIX-02 fallback strategy (v_popular_items existence): MEDIUM — view may not exist in production

**Research date:** 2026-04-02
**Valid until:** 2026-05-02 (stable codebase, 30-day window)
