# Eli's Dulce Tradicion — Owner Dashboard Blueprint

> A comprehensive spec for what the owner of a custom cake bakery needs to see and manage, organized by **navigation sections, pages, and key widgets**. Each section is annotated with current implementation status.

---

## Business Context

Eli's Dulce Tradicion is a custom cake bakery in Norristown, PA. Customers place orders through the website (5-step order wizard), pay via Stripe, and pick up or receive delivery. The **Owner Dashboard** (`/owner-dashboard`) is the bakery owner's command center — the single place to:

- Monitor incoming orders and daily revenue
- Manage the product menu (cakes, bread, pastries)
- Track ingredient inventory and low stock alerts
- View business analytics and export reports
- Configure business settings, hours, and website content

The owner (`owner@elisbakery.com`, role=`owner`) logs into `/owner-dashboard` and never leaves it. All management tools should be embedded within this dashboard.

**What the Owner Dashboard is NOT:**
- NOT an order processing station (that's Front Desk's job — the owner can view orders but doesn't need to accept/prepare/mark ready)
- NOT a customer-facing page
- NOT a POS/cashier system

---

## Design Principles

| Principle | Rule |
|-----------|------|
| **Single-page tabbed** | Owner logs into `/owner-dashboard` and stays on that one page — all tools are sidebar tabs, not separate routes |
| **Bilingual** | All labels support English/Spanish via `useLanguage()` — `t('Spanish', 'English')` pattern |
| **Real-time** | Orders update via Supabase Realtime subscriptions — new orders trigger toast notifications and automatic data refresh |
| **Light theme** | Light background (`#F5F6FA`), dark sidebar (`#1a1a1a`), gold accent (`#C6A649`) for brand identity |
| **Glassmorphism cards** | Metric cards use `bg-white/70 backdrop-blur-xl` with shadow hover effects |
| **Mobile-responsive sidebar** | Sidebar collapses to icon-only (w-20) on mobile, full labels (w-64) on desktop |
| **Overview-first** | Overview tab is the default — shows today's snapshot so the owner can assess the business at a glance |

---

## Sidebar Navigation

### Current State (6 items)

The sidebar (`OwnerSidebar.tsx`) currently renders:

```
Overview        LayoutDashboard
Orders          ShoppingBag
Calendar        Calendar
Products        Package
Inventory       Boxes
Reports         FileText
```

Settings is accessed via a **gear icon in the header** (DashboardHeader.tsx), which opens a Sheet modal with `BusinessSettingsManager`.

### Target State

```
── OPERATIONS ──────────────────────────────
Overview                  (default tab)
Orders
Calendar

── MANAGEMENT ─────────────────────────────
Products
Inventory
Recipes                   ❌ Not built (Phase 7)

── INSIGHTS ───────────────────────────────
Reports

── SYSTEM ─────────────────────────────────
Settings                  (currently header gear icon — consider promoting to sidebar)
Website Content           ❌ Not accessible (orphaned CMS managers)
```

> **Key navigation gap:** 3 admin CMS managers (BusinessHoursManager, ContactSubmissionsManager, OrderIssuesManager) are built but have **no sidebar link** and no way to reach them from the dashboard. The Settings gear icon only opens BusinessSettingsManager.

---

## Page-by-Page Breakdown

### 1. Overview — Default Tab

The "command center" — one glance tells the owner how the bakery is doing **right now**.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Revenue Today Card** | Today's revenue from `getDashboardMetrics()`, formatted as currency | ✅ Built |
| **Orders Today Card** | Today's order count + pending count | ✅ Built |
| **Avg Ticket Card** | Average order value | ✅ Built |
| **Today's Deliveries Card** | Delivery orders count + total customers | ✅ Built |
| **Revenue Trend Indicator** | Percentage change vs previous period | ❌ **Hardcoded `↑ 12%`** — not calculated from real data (FIX-01) |
| **Today's Schedule Summary** | Urgent orders (due <1hr), upcoming (1-3hr), delivery/pickup counts, capacity bar, hourly timeline | ✅ Built |
| **Revenue Trend Chart** | Line chart (Recharts) with 7D/30D toggle, computed from all orders | ✅ Built |
| **Order Status Pie Chart** | Donut chart showing order distribution by status | ✅ Built |
| **Most Ordered Items** | Ranked list of popular items with progress bars | ❌ **Always empty** — `popularItems` state is never populated from API (FIX-02) |
| **Stock Alerts** | Low stock ingredients with red/green indicator | ✅ Built (real data from `getLowStockItems()`) |
| **Recent Orders Table** | Last 5 orders with name, order #, cake size, amount, status badge — click to view | ✅ Built |

**Data Sources:**
- `api.getDashboardMetrics(revenuePeriod)` → DashboardMetrics via Supabase RPC
- `api.getAllOrders()` → Full order array (single source of truth for all tabs)
- `api.getOrdersByStatus()` → Status breakdown for pie chart
- `api.getLowStockItems()` → Low stock ingredients

**Key State:**
- `revenuePeriod`: `'today' | 'week' | 'month'` — toggles revenue chart lookback (7, 30, or 90 days)
- Revenue chart data is computed client-side from `allOrders` by date bucketing

**Capacity Bar:**
- Shows `activeOrders / maxDailyCapacity` as a progress bar
- Color-coded: green (<50%), yellow (50-80%), red (>80%)
- `maxDailyCapacity` is **hardcoded to 20** (FIX-06 — should come from `business_settings` table)

---

### 2. Orders — Full Order List

The complete order management view with search, filters, and export.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **OrderListWithSearch** | Full order table with columns: order #, customer, date needed, status, amount | ✅ Built |
| **Search** | Filter by customer name, order number, email | ✅ Built |
| **Status Filters** | Filter by order status | ✅ Built |
| **CSV Export** | Export filtered orders to CSV | ✅ Built |
| **Click to View** | Opens PrintPreviewModal with full order details | ✅ Built |
| **Order Notes** | Internal notes per order | ✅ API exists (`getOrderNotes`) — accessible via PrintPreviewModal |

**This tab is 100% functional.**

---

### 3. Calendar — Order Schedule View

Visual timeline of orders by date and time.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Week View** | 7-day columns with orders positioned by `time_needed` on a time axis | ✅ Built |
| **Day View** | Single day with hourly time slots | ✅ Built |
| **Month View** | Grid showing order counts per day | ❌ **Not implemented** (FIX-03) |
| **Navigation** | Previous/Next/Today buttons with date display | ✅ Built |
| **Order Blocks** | Color-coded blocks by status (orange=pending, green=ready, gray=completed) — click to view | ✅ Built |
| **Time Axis** | Left column showing hours from 6 AM to 10 PM | ✅ Built — but hours are **hardcoded** (FIX-07 — should use `business_hours` table) |
| **"+ New Order" Button** | Button in calendar header | ❌ **Non-functional stub** — owners don't create orders, button does nothing (FIX-04) |

**Key Issue:** The `OwnerCalendar` component (217 LOC) renders Week and Day views correctly, but the Month view that would show order density across the month is missing. The time axis hours (6 AM–10 PM) should be fetched from the `business_hours` database table rather than hardcoded.

---

### 4. Products — Menu Management

Full CRUD for the bakery's product catalog.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Product Table** | All products with name (EN/ES), category, price, status (active/inactive) | ✅ Built |
| **Add Product** | Form with bilingual names, category dropdown, price, description, image upload | ✅ Built |
| **Edit Product** | Same form pre-populated with existing data | ✅ Built |
| **Delete Product** | Confirmation dialog + soft delete | ✅ Built |
| **Category Filter** | 7 categories: cakes, bread, cookies, pastries, beverages, specialty, other | ✅ Built |
| **Search** | Filter by product name (searches both EN and ES) | ✅ Built |
| **Sort** | By name, category, price, or status | ✅ Built |
| **Image Upload** | Drag-drop with preview, uploads to Supabase Storage | ✅ Built |
| **Active/Inactive Toggle** | Quick status toggle per product | ✅ Built |

**Data Sources:** `api.getAllProducts()`, `api.createProduct()`, `api.updateProduct()`, `api.deleteProduct()`

**This tab is ~95% complete.** The one gap is that product pricing here doesn't connect to the order wizard pricing in `Order.tsx` (which is hardcoded — see Phase 8 in roadmap).

---

### 5. Inventory — Ingredient Management

Track ingredients, quantities, and low stock alerts.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Ingredient List** | All ingredients with name, quantity, unit, threshold, category, supplier, last updated | ✅ Built |
| **All Items / Low Stock Tabs** | Toggle between full list and below-threshold items | ✅ Built |
| **Edit Quantity** | Inline edit field per ingredient — save/cancel | ✅ Built |
| **Low Stock Alerts** | Red highlighting for items below threshold | ✅ Built |
| **Search** | Filter by ingredient name | ✅ Built |
| **Add Ingredient** | Add new ingredient to inventory | ✅ Built |
| **Ingredient Usage Log** | Track usage over time | ✅ API exists (`logIngredientUsage`) — UI integration present |
| **Recipe Linkage** | Connect ingredients to cake recipes | ❌ **Not built** — database tables exist (`product_recipes`, `order_component_recipes`) but no UI (Phase 7) |

**Data Sources:** `api.getInventory()`, `api.updateIngredient()`, `api.getLowStockItems()`, `api.logIngredientUsage()`

**This tab is ~85% complete.** The missing piece is recipe management — connecting ingredients to specific cake recipes so the owner can see cost per recipe and forecast ingredient needs.

---

### 6. Reports — Business Analytics

Exportable business summaries and data visualizations.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Revenue Report** | Line chart showing revenue over selected period | ✅ Built |
| **Order Volume Report** | Bar chart showing order counts by period | ✅ Built |
| **Customer Report** | Table of customers with order counts and total spend | ✅ Built |
| **Inventory Report** | Table of ingredients with stock levels and usage | ✅ Built |
| **Date Range Presets** | Today, This Week, This Month, Last 30 Days, Last 90 Days, All Time | ✅ Built |
| **CSV Export** | One-click download per report type | ✅ Built |
| **Email Report** | Send report via email | ✅ Built |

**Data Sources:** All computed from `api.getAllOrders()` and `api.getInventory()` — client-side processing.

**This tab is ~90% complete.** The component is 854 LOC and is flagged for refactoring in Phase 9 (split into RevenueReport, OrderVolumeReport, CustomerReport, InventoryReport sub-components).

---

### 7. Settings — Business Configuration

Currently accessed via the **gear icon** in the DashboardHeader (not a sidebar tab). Opens as a Sheet modal.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **BusinessSettingsManager** | Business info (name, phone, address), location settings, order settings, about us — all bilingual | ✅ Built (in header gear icon) |
| **BusinessHoursManager** | Operating hours per day of week | ✅ Built — but **orphaned** (no way to access from dashboard) (FIX-05) |
| **FAQManager** | FAQ content management | ✅ Built — accessible from website admin but not from Owner Dashboard |
| **GalleryManager** | Image gallery management | ✅ Built — same as above |
| **AnnouncementManager** | Banner/announcement management | ✅ Built — same as above |
| **OrderIssuesManager** | Customer-reported order issues | ✅ Built — but **orphaned** (FIX-05) |
| **ContactSubmissionsManager** | Contact form submission viewer | ✅ Built — but **orphaned** (FIX-05) |

**Key Gap:** Seven admin components exist in `src/components/admin/`, but only `BusinessSettingsManager` is accessible from the Owner Dashboard. The remaining 6 are either orphaned or only reachable through non-obvious paths. For an owner managing a bakery, the ability to:
- Set business hours (BusinessHoursManager)
- View customer contact submissions (ContactSubmissionsManager)
- Review order issues reported by customers (OrderIssuesManager)

...should all be accessible from the dashboard. These are core operational needs.

---

## Global Features

### Header (DashboardHeader)
| Feature | Status |
|---------|--------|
| Welcome message with owner's first name | ✅ |
| Global search (orders, products, ingredients) with debounced dropdown | ✅ |
| Settings gear icon → BusinessSettingsManager Sheet | ✅ |
| User avatar with role badge + logout popover | ✅ |

### Real-Time Updates
| Feature | Status |
|---------|--------|
| Supabase Realtime subscription on `orders` table | ✅ |
| Toast notification on new order | ✅ |
| Auto-refresh all dashboard data on INSERT/UPDATE/DELETE | ✅ |
| Debounced (300ms) to prevent rapid-fire updates | ✅ |

### Search
| Feature | Status |
|---------|--------|
| Search orders by name, order #, email | ✅ |
| Search products by bilingual name, price | ✅ |
| Search ingredients by name, category | ✅ |
| Lazy-load products/ingredients on first search | ✅ |
| Navigate to relevant tab on result click | ✅ |

---

## What's Missing — Gaps Analysis

### Bugs & Hardcoded Values (from Roadmap Phase 5)

| ID | Gap | Impact | Component |
|----|-----|--------|-----------|
| FIX-01 | Revenue trend `↑ 12%` is hardcoded | Owner sees fake growth indicator | `OwnerDashboard.tsx:294` |
| FIX-02 | Most Ordered Items always empty | Valuable analytics widget is useless | `OwnerDashboard.tsx:79` (popularItems never populated) |
| FIX-03 | Month calendar view not implemented | Can't see order density across the month | `OwnerCalendar.tsx` |
| FIX-04 | Stub "New Order" button in calendar | Confusing non-functional UI element | `OwnerCalendar.tsx` |
| FIX-05 | 3 orphaned CMS managers | Can't manage business hours, contact submissions, or order issues | `src/components/admin/` |
| FIX-06 | maxDailyCapacity hardcoded to 20 | Can't adjust capacity as business grows | `TodayScheduleSummary.tsx:22` |
| FIX-07 | Calendar hours hardcoded 6 AM–10 PM | Doesn't reflect actual business hours | `OwnerCalendar.tsx`, `OrderScheduler.tsx` |
| FIX-08 | No error states or retry buttons | If data fetch fails, user sees nothing and has no recourse | Multiple components |

### Missing Features (from Roadmap Phases 6-8)

| Gap | Why It's Needed | Phase |
|-----|----------------|-------|
| **Recipe Management UI** | Owner needs to see ingredient cost per cake recipe and forecast inventory needs based on orders | Phase 7 |
| **Walk-in order visibility** | Walk-in orders (created by Front Desk) should appear in the Owner's order list with a `source: 'walk-in'` indicator | Phase 6 |
| **Database-driven menu pricing** | Prices are hardcoded in `Order.tsx` — owner can't change prices from the dashboard without a code deployment | Phase 8 |

### Operational Gaps (not in roadmap but needed for business)

| Gap | Why It's Needed |
|-----|----------------|
| **Customer list/management** | Database has customer data from orders but the owner has no view to see repeat customers, customer history, or contact info — data exists in `user_profiles` and orders but is not surfaced |
| **Order source indicator** | When walk-in orders are built (Phase 6), the owner needs to distinguish website orders from walk-in/phone orders at a glance |
| **Delivery zone visibility** | `delivery_zones` table exists with zone definitions and fees — owner should be able to see/manage delivery zones from Settings |
| **Audit log** | `audit_logs` table exists in the database — owner has no visibility into system events (logins, order changes, settings modifications) |

---

## Integration Points

### Order Flow (Website → Dashboard)
```
Customer places order on website
  → Stripe payment processed
    → Order created in Supabase `orders` table
      → Supabase Realtime broadcasts INSERT
        → Owner Dashboard receives toast notification
        → allOrders state refreshed
        → All tabs update with new data
```

### Email Notifications (triggered from Front Desk, visible to Owner)
```
Front Desk accepts order → send-order-confirmation email
Front Desk marks ready → send-ready-notification email
Front Desk dispatches delivery → send-status-update email
```

### Data Refresh Cycle
```
Page load → loadDashboardData() fetches metrics, orders, status breakdown, low stock
Realtime event → loadDashboardData() re-fetches everything
Revenue period toggle → recomputes chart data client-side from cached allOrders
```

---

## Summary: Sections At a Glance

### Core Operations (must work for launch)

| # | Section | Completeness | Key Remaining Work |
|---|---------|-------------|-------------------|
| 1 | **Overview** | 75% | Fix hardcoded trend (FIX-01), populate popular items (FIX-02), fix hardcoded capacity (FIX-06) |
| 2 | **Orders** | 100% | Fully functional |
| 3 | **Calendar** | 60% | Build Month view (FIX-03), remove stub button (FIX-04), dynamic hours (FIX-07) |
| 4 | **Products** | 95% | Connect pricing to order wizard (Phase 8) |
| 5 | **Inventory** | 85% | Add recipe linkage UI (Phase 7) |
| 6 | **Reports** | 90% | Refactor for maintainability (Phase 9 — not blocking launch) |
| 7 | **Settings** | 40% | Expose orphaned CMS managers (FIX-05), add business hours/delivery zones management |
| — | **Global Search** | 100% | Fully functional |
| — | **Real-Time** | 100% | Fully functional |
| — | **Error Handling** | 20% | Add error states and retry buttons across all data panels (FIX-08) |

### Post-Launch Improvements

| # | Section | Completeness | Notes |
|---|---------|-------------|-------|
| 8 | **Recipes** | 0% | Database exists, UI not built (Phase 7) |
| 9 | **Customer Management** | 0% | Data exists in orders, no dedicated view |
| 10 | **Audit Log** | 0% | Database table exists, no UI |
| 11 | **DB-Driven Pricing** | 0% | Phase 8 — enables menu changes without code deploys |

---

## Overall Assessment: ~78% Complete

The Owner Dashboard's core operational pages (Orders, Products, Inventory, Reports) are all wired to real APIs and functional. The Overview tab works but has 3 hardcoded values that undermine trust in the data. The Calendar is usable but incomplete. The biggest operational gap is **Settings/CMS access** — the owner has no way to manage business hours, view contact form submissions, or review customer-reported order issues from the dashboard, despite all three components being fully built.

The highest-impact work remaining is:

1. **Fix hardcoded values** (FIX-01, FIX-02, FIX-06) — makes Overview trustworthy
2. **Expose orphaned CMS managers** (FIX-05) — unlocks 3 built-but-hidden tools
3. **Calendar Month view** (FIX-03) — gives weekly planning capability
4. **Error states** (FIX-08) — prevents silent failures
5. **Recipe management UI** (Phase 7) — connects inventory to production

Everything else (customer management, audit log, DB-driven pricing) can follow after launch.

---

*Based on CLAUDE.md + full code verification of all dashboard page files, Feb 17, 2026.*
