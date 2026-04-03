# Phase 5: Dashboard & Front Desk Fixes - Context

**Gathered:** 2026-04-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix 9 identified bugs and wire up orphaned components across the Owner Dashboard and Front Desk. Includes: populating analytics data, implementing month calendar grid, removing stub buttons, exposing hidden CMS tools, making capacity configurable, fetching business hours dynamically, adding error states, and 3 backend/SQL bug fixes. No new capabilities — purely fixes and wiring of existing code.

</domain>

<decisions>
## Implementation Decisions

### Calendar Month Grid (FIX-03)
- Day cells show: date number + order count + capacity fill bar
- Capacity bar colors: green = under 50%, yellow = 50–80%, red = 80%+ (traffic light)
- Days with 0 orders: date number only, no bar shown
- Past days (earlier this month): dimmed/muted styling; today and future days full color
- Clicking a day expands to show full order cards (same card design as order feed)
- Month grid appears in BOTH dashboards (Owner Dashboard + Front Desk)

### Error States (FIX-08)
- On load failure: skeleton placeholder stays visible + sonner toast notification appears
- Toast has a Retry button (not just informational)
- Triggers on BOTH initial data fetch failure AND real-time subscription disconnect
- Applies consistently to all 3 panels: order feed, inventory, delivery

### Settings Tab Layout (FIX-05)
- 3 CMS managers exposed as sub-tabs within the existing Settings tab
- Sub-tab labels: "Business Hours" | "Contact Submissions" | "Order Issues"
- Default sub-tab: preserve whatever the current Settings default is — just append the 3 new sub-tabs
- Components wired in with light visual polish to match dashboard style (colors, fonts)
- English only — no bilingual requirement for these admin tools

### Capacity Setting UX (FIX-06)
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

</decisions>

<specifics>
## Specific Ideas

- Error toast pattern matches existing sonner usage in the app (see other fetch error handling)
- Calendar day card when expanded: reuse the existing ModernOrderCard component pattern from Kitchen display
- CMS managers (BusinessHoursManager, ContactSubmissionsManager, OrderIssuesManager) already exist in `src/components/admin/` — just import and render

</specifics>

<deferred>
## Deferred Ideas

- Per-day-of-week capacity configuration — more complex, own phase when needed
- Bilingual Settings tab labels — can add in a translation pass later

</deferred>

---

*Phase: 05-dashboard-and-front-desk-fixes*
*Context gathered: 2026-04-02*
