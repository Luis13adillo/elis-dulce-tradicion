# Eli's Dulce Tradicion — Front Desk Blueprint

> A comprehensive spec for what the front desk staff (kitchen/reception) needs to process orders efficiently, organized by **navigation views and key widgets**. Each section is annotated with current implementation status.

---

## Business Context

The **Front Desk** (`/front-desk`) is the bakery's operational workstation — used on a tablet or computer by the staff member managing incoming orders. When a customer places an order on the website, the Front Desk is where that order gets received, accepted, prepared, and marked as ready for pickup or delivery.

The front desk user (`orders@elisbakery.com`, role=`baker`) needs to:

- See new orders the moment they come in (real-time alerts with sound)
- Accept orders and update their status through the preparation pipeline
- Track which orders are due soon and which are overdue
- Manage delivery assignments and dispatch drivers
- Check ingredient stock levels at a glance
- Create walk-in orders for phone/in-person customers

**What the Front Desk is NOT:**
- NOT an analytics platform (basic reports are available, but deep analytics belong to the Owner Dashboard)
- NOT a product/menu management tool (that's the owner's job)
- NOT a business settings panel

---

## Design Principles

| Principle | Rule |
|-----------|------|
| **Dark mode default** | `isDarkMode` state defaults to `true` — kitchen/counter environments benefit from reduced glare |
| **Touch-first** | Designed for tablet use — large tap targets, card-based layout, minimal text input |
| **Real-time with alerts** | New orders trigger: full-screen modal alert + notification sound (`/notification.mp3`) + browser notification + badge update |
| **Bilingual** | All labels support English/Spanish via `useLanguage()` |
| **Status-driven actions** | Each order card shows only the contextually valid next action (Accept → Start Preparing → Mark Ready → Complete) |
| **Urgency visibility** | Overdue orders are visually separated with red dividers; urgent orders get banner alerts |
| **Sound control** | Staff can mute notification sounds with a toggle (useful during busy periods) |
| **Keyboard shortcuts** | Power users can process orders faster: `A` = Accept, `R` = Mark Ready, Arrow keys = navigate between orders |

---

## Sidebar Navigation

### Current State (5 views + Notifications)

The sidebar (`KitchenSidebar.tsx`) currently renders:

```
Orders          ClipboardList    (view: queue)
Calendar        CalendarDays     (view: upcoming)
Inventory       Boxes            (view: inventory)
Deliveries      Truck            (view: deliveries)
Reports         BarChart3        (view: reports)
──────────────────
Notifications   Bell             (panel overlay)
──────────────────
Log Out         LogOut
```

**Note:** The sidebar type definition includes `'calendar'` as a view option, but it maps to the same `'upcoming'` view (OrderScheduler). There is no separate calendar view — it's the same component.

### Target State

```
── ORDER PROCESSING ────────────────────────
Orders Queue              (default view)
Walk-In Order             ❌ Not built (Phase 6)

── SCHEDULE ───────────────────────────────
Calendar                  (OrderScheduler + TodayScheduleSummary)

── SUPPORT ────────────────────────────────
Inventory                 (read-only)
Deliveries

── INSIGHTS ───────────────────────────────
Reports                   (QuickStats + ReportsManager)

── SYSTEM ─────────────────────────────────
Notifications             (panel overlay with badge count)
──────────────────
Log Out
```

> **Key navigation gap:** The Walk-In Order creation button doesn't exist yet (Phase 6). When built, it should be prominently accessible — either in the sidebar or as a floating action button in the Queue view.

> **Sidebar labels are English-only.** The sidebar currently uses hardcoded English strings (`'Orders'`, `'Calendar'`, etc.) rather than the `t()` translation function. This needs to be fixed for bilingual support.

---

## View-by-View Breakdown

### 1. Queue — Default View (Order Processing)

The nerve center — all incoming and active orders displayed as a card grid, filterable by status.

#### Filter Tabs (KitchenNavTabs)

8 filter tabs with live badge counts:

| Tab | Filter Logic | Status |
|-----|-------------|--------|
| `all` | All orders | ✅ |
| `active` | pending + confirmed + in_progress + ready | ✅ |
| `today` | Active orders where `date_needed` = today | ✅ |
| `new` | pending only | ✅ |
| `preparing` | confirmed + in_progress | ✅ |
| `pickup` | ready + delivery_option = 'pickup' | ✅ |
| `delivery` | ready + delivery_option = 'delivery' | ✅ |
| `done` | delivered + completed + cancelled | ✅ |

#### Widgets

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Urgent Orders Banner** | Red banner at top showing orders due within 1 hour — click to view | ✅ Built |
| **Full Screen Order Alert** | Modal that pops up when a new order arrives — shows order summary with View/Dismiss buttons | ✅ Built |
| **Order Cards Grid** | Responsive grid (1/2/3/4 cols) of ModernOrderCard — shows customer name, order #, status badge, due time, cake size, delivery type | ✅ Built |
| **Overdue Section Divider** | Red separator bar between on-time and overdue orders with count | ✅ Built |
| **Pagination** | 12 orders per page with Prev/Next, page numbers, ellipsis for large sets, "Showing X-Y of Z" text | ✅ Built |
| **Empty State** | Package icon + "No orders in this view" message when no orders match filters | ✅ Built |

#### Order Card Actions (ModernOrderCard)

| Order Status | Action Button | What It Does | Status |
|-------------|---------------|-------------|--------|
| `pending` | "Accept Order" | Transitions to `confirmed` → sends confirmation email | ✅ |
| `confirmed` | "Start Preparing" | Transitions to `in_progress` | ✅ |
| `in_progress` | "Mark Ready" | Transitions to `ready` → sends ready notification email | ✅ |
| `ready` (pickup) | "Complete Pickup" | Transitions to `delivered` → sends status update email | ✅ |
| `ready` (delivery) | "Dispatch Driver" | Transitions to `out_for_delivery` → sends status update email | ✅ |
| Any | "View Order" | Opens PrintPreviewModal with full details | ✅ |
| Any | "Cancel" | Opens CancelOrderModal → sends cancellation email | ✅ |

#### Email Notifications (triggered by status changes)

| Action | Email Sent | Status |
|--------|-----------|--------|
| Accept Order | `send-order-confirmation` edge function | ✅ |
| Mark Ready | `send-ready-notification` edge function | ✅ |
| Dispatch/Complete | `send-status-update` via API | ✅ |
| Cancel | `send-status-update` (cancellation variant) | ✅ |

**Keyboard Shortcuts (when order modal is open):**
- `A` — Accept order (if status is pending)
- `R` — Mark ready (if status is confirmed or in_progress)
- `←` / `→` — Navigate to previous/next order in list

**This view is ~95% complete.** It is the strongest section of the Front Desk.

---

### 2. Calendar — Schedule View (Upcoming)

Visual timeline showing when orders are due, helping staff plan their production schedule.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Today's Schedule Summary** | Same widget as Owner Dashboard: urgent/upcoming counts, delivery/pickup breakdown, capacity bar, hourly timeline | ✅ Built |
| **OrderScheduler** | Week/Day view with orders positioned on a time axis — supports dark mode | ✅ Built |
| **Click to View** | Clicking an order block opens PrintPreviewModal | ✅ Built |
| **Month View** | Grid with order counts per day | ❌ **Not implemented** (FIX-03) |
| **Time Axis** | Hours from 6 AM to 10 PM | ✅ Built — but **hardcoded** (FIX-07) |

**Capacity Bar Issue:** `maxDailyCapacity` is hardcoded to 20 in `TodayScheduleSummary.tsx` (FIX-06). This should come from the `business_settings` table.

**This view is ~70% complete.** Week/Day views work. Month view and dynamic hours are missing.

---

### 3. Inventory — Read-Only Stock Check

Allows front desk staff to quickly check ingredient stock levels without leaving the order queue. **Intentionally read-only** — inventory edits are the owner's responsibility.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Ingredient Grid** | Two-column display of all ingredients with quantity, unit, threshold, last updated | ✅ Built |
| **All / Low Stock Toggle** | Switch between full inventory and below-threshold items only | ✅ Built |
| **Search** | Filter by ingredient name or category | ✅ Built |
| **Status Indicator** | Green "OK" or Red "Low" badge per ingredient | ✅ Built |
| **Refresh Button** | Manual refresh to re-fetch inventory data | ✅ Built |
| **Dark Mode** | Full dark variant support | ✅ Built |

**Data Source:** `api.getInventory()`, `api.getLowStockItems()`

**This view is 100% functional for its intended purpose** (read-only stock check). It correctly does NOT offer edit capabilities — that's the owner's domain.

---

### 4. Deliveries — Delivery Order Management

Manages today's delivery orders: assign drivers, track delivery status, view delivery details.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Summary Stats** | 4 cards: Pending, In Transit, Delivered, Failed — counts for today | ✅ Built |
| **Delivery Order Cards** | Today's delivery orders with customer info, due time, delivery address | ✅ Built |
| **Assign Driver** | Dropdown to assign a staff member as delivery driver | ✅ Built |
| **Status Change Buttons** | Advance delivery through: assigned → in_transit → delivered (or failed) | ✅ Built |
| **View Details** | Opens PrintPreviewModal for full order info | ✅ Built |
| **Dark Mode** | Full dark variant support | ✅ Built |

**Data Sources:**
- Orders filtered by `delivery_option='delivery'` and `date_needed=today`
- `api.getStaffMembers()` for driver dropdown
- `api.assignDelivery(orderId, driverId)` for assignment
- `api.updateDeliveryStatus()` for status changes

**Key Limitation:** Only shows TODAY's deliveries. There's no view for upcoming delivery orders (tomorrow, this week). For a bakery that takes orders days in advance, seeing tomorrow's delivery schedule would be useful.

**This view is ~85% complete.**

---

### 5. Reports — Quick Stats + Analytics

Basic business stats for front desk staff — less detailed than the Owner Dashboard's reports.

| Widget | What It Shows | Status |
|--------|--------------|--------|
| **Quick Stats Widget** | 3-column summary: Today / This Week / This Month — each shows revenue, order count, and AOV | ✅ Built |
| **ReportsManager** | Same full report suite as Owner Dashboard (revenue chart, order volume, customer report, inventory report, CSV export) | ✅ Built |
| **Dark Mode Wrapper** | Reports wrapped with dark mode class | ✅ Built |

**Question:** Does the front desk staff really need the full ReportsManager? The QuickStatsWidget alone may be sufficient for the front desk's needs. The full ReportsManager might be more complexity than the front desk role requires. However, since it's already built and working, there's no harm in leaving it — it gives the front desk visibility into business performance.

**This view is 100% functional.**

---

### 6. Walk-In Order Creation — NOT YET BUILT

**This is Phase 6 in the roadmap and represents the largest functional gap in the Front Desk.**

When a customer calls or walks in to place an order, the front desk staff currently has no way to create that order from the dashboard. They would have to go to the customer-facing website and place the order there — which is awkward, doesn't mark the order as walk-in, and requires navigating away from the Front Desk.

| Widget | What It Should Show | Status |
|--------|-------------------|--------|
| **Walk-In Order Button** | Prominent "+ New Walk-In Order" accessible from sidebar or header | ❌ Not built |
| **Walk-In Order Form** | Full-screen modal: customer name, phone, cake details, pickup date/time, notes | ❌ Not built |
| **Menu Options** | Sizes, fillings, bread types pulled from database (not hardcoded) | ❌ Not built |
| **Real-Time Pricing** | Price calculates as selections change | ❌ Not built |
| **Source Tag** | Orders created here tagged with `source: 'walk-in'` | ❌ Not built |
| **Instant Queue Update** | New walk-in order appears in Queue immediately via real-time subscription | ❌ Not built |

**Requirements (from Roadmap Phase 6):**
1. Opens as a full-screen modal (doesn't navigate away from order queue)
2. Self-contained component — does NOT reuse Order.tsx (which is 1,004 lines and website-specific)
3. Pull product data from `products` table via API
4. Bilingual support required (English/Spanish)
5. Order confirmation notification triggers through standard email flow

---

## Global Features

### Real-Time Order Feed

| Feature | Status |
|---------|--------|
| `useOrdersFeed()` hook manages order list (initial load + real-time updates) | ✅ |
| `useRealtimeOrders()` subscribes to Supabase Realtime `orders` table changes | ✅ |
| New orders trigger toast notification | ✅ |
| New orders trigger full-screen modal alert | ✅ |
| New orders play `/notification.mp3` sound (if enabled) | ✅ |
| New orders trigger browser notification (if permitted) | ✅ |
| Reconnection with exponential backoff | ✅ |
| 300ms debounce to prevent rapid-fire updates | ✅ |

### Notification System

| Feature | Status |
|---------|--------|
| `useNotificationState()` tracks read/unread orders | ✅ |
| Sidebar bell icon with unread count badge | ✅ |
| NotificationPanel slide-out with order list | ✅ |
| Mark individual or all as read | ✅ |
| Click notification to open order details | ✅ |
| Dark mode support | ✅ |

### Theme System

| Feature | Status |
|---------|--------|
| Toggle between dark and light mode (header Sun/Moon icon) | ✅ |
| Dark mode state (`isDarkMode`) propagated to all child components | ✅ |
| All kitchen components support `variant='dark'` or `darkMode` prop | ✅ |
| Tailwind `dark:` variants used throughout | ✅ |

### Search & Filter

| Feature | Status |
|---------|--------|
| Search by customer name, order #, phone, email | ✅ |
| Real-time filter across visible orders in Queue view | ✅ |
| Search bar in header (hidden on mobile) | ✅ |

### Header Actions

| Feature | Status |
|---------|--------|
| Page title display | ✅ |
| Search bar | ✅ |
| Theme toggle (Sun/Moon) | ✅ |
| Sound toggle (Speaker/Mute) | ✅ |
| Refresh button with loading spinner | ✅ |
| Notifications bell with badge | ✅ |
| User avatar + name display | ✅ |

---

## What's Missing — Gaps Analysis

### Bugs & Issues (from Roadmap Phase 5)

| ID | Gap | Impact | Component |
|----|-----|--------|-----------|
| FIX-03 | Month calendar view not implemented | Can't see order density for the month ahead | `OrderScheduler.tsx` |
| FIX-06 | maxDailyCapacity hardcoded to 20 | Capacity bar in TodayScheduleSummary may be inaccurate | `TodayScheduleSummary.tsx:22` |
| FIX-07 | Calendar hours hardcoded 6 AM–10 PM | Time axis doesn't reflect actual business hours | `OrderScheduler.tsx` |
| FIX-08 | No error states or retry buttons | If real-time connection drops or API fails, staff sees stale data with no indication | Multiple components |

### Missing Features (from Roadmap)

| Gap | Why It's Needed | Phase |
|-----|----------------|-------|
| **Walk-In Order Creation** | Front desk can't create orders for phone/walk-in customers — this is the single biggest operational gap | Phase 6 |

### Operational Gaps (not in roadmap but needed for business)

| Gap | Why It's Needed |
|-----|----------------|
| **Sidebar labels not bilingual** | KitchenSidebar uses hardcoded English strings (`'Orders'`, `'Calendar'`, etc.) — should use `t()` for Spanish support |
| **Delivery schedule for future dates** | DeliveryManagementPanel only shows TODAY's deliveries — staff can't see tomorrow's delivery schedule to plan ahead |
| **Print from order card** | Currently must open PrintPreviewModal first, then print — a direct "Print Ticket" action on the card would save a click for busy staff |
| **Order count on sidebar** | The Queue sidebar item shows a badge for `new` orders only — should also indicate total active orders |
| **Connection status indicator** | If the Supabase real-time connection drops, staff has no visual indicator — they could miss new orders without knowing the feed is disconnected |

---

## Order Processing Flow

The core workflow the Front Desk supports:

```
New Order arrives (website)
  │
  ├──→ FullScreenOrderAlert pops up + sound plays
  │     Staff clicks "View Order" or "Dismiss"
  │
  ├──→ Order appears in Queue as "New" (pending)
  │     Status badge: orange
  │
  ▼
Staff clicks "Accept Order"
  │  → Status: pending → confirmed
  │  → Email: order confirmation sent to customer
  │
  ▼
Staff clicks "Start Preparing"
  │  → Status: confirmed → in_progress
  │
  ▼
Staff clicks "Mark Ready"
  │  → Status: in_progress → ready
  │  → Email: ready notification sent to customer
  │
  ├──→ [If Pickup]
  │     Staff clicks "Complete Pickup"
  │     → Status: ready → delivered
  │     → Email: completion notification
  │
  └──→ [If Delivery]
        Staff assigns driver (Deliveries view)
        Staff clicks "Dispatch Driver"
        → Status: ready → out_for_delivery
        → Email: dispatch notification
        │
        ▼
        Driver delivers
        Staff clicks "Complete"
        → Status: out_for_delivery → delivered
```

At any point, staff can click "Cancel" to open the CancelOrderModal, which sends a cancellation email to the customer.

---

## Summary: Views At a Glance

### Core Operations (must work for launch)

| # | View | Completeness | Key Remaining Work |
|---|------|-------------|-------------------|
| 1 | **Queue** | 95% | Add error states (FIX-08) |
| 2 | **Calendar** | 70% | Month view (FIX-03), dynamic hours (FIX-07), dynamic capacity (FIX-06) |
| 3 | **Inventory** | 100% | Fully functional (read-only by design) |
| 4 | **Deliveries** | 85% | Consider future-date delivery view |
| 5 | **Reports** | 100% | Fully functional |
| — | **Real-Time Alerts** | 100% | Fully functional |
| — | **Notifications** | 100% | Fully functional |
| — | **Theme System** | 100% | Fully functional |
| — | **Error Handling** | 20% | Add error states and retry buttons across all views (FIX-08) |
| — | **Sidebar Bilingual** | 0% | Labels are English-only — need `t()` translation |

### Post-Launch (operational improvement)

| # | Feature | Completeness | Notes |
|---|---------|-------------|-------|
| 6 | **Walk-In Orders** | 0% | Phase 6 — the single biggest operational gap |
| 7 | **Future Delivery View** | 0% | See tomorrow/this week deliveries |
| 8 | **Connection Indicator** | 0% | Show when real-time feed is disconnected |
| 9 | **Direct Print** | 0% | Print ticket button on order card |

---

## Overall Assessment: ~85% Complete

The Front Desk is the strongest part of the application. The Queue view is production-ready with real-time alerts, status-driven actions, email notifications, keyboard shortcuts, pagination, and urgent order highlighting. The notification system, theme toggling, and search all work correctly.

The highest-impact work remaining is:

1. **Walk-In Order Creation** (Phase 6) — without this, the front desk can't handle phone/in-person orders
2. **Error states and retry buttons** (FIX-08) — prevents silent failures when the connection drops
3. **Sidebar bilingual labels** — quick fix that maintains language consistency
4. **Calendar Month view** (FIX-03) — helps staff plan production for the week ahead
5. **Dynamic hours/capacity** (FIX-06, FIX-07) — ensures calendar and capacity reflect actual business settings

Everything else (future delivery view, connection indicator, direct print) are quality-of-life improvements that can follow after launch.

---

*Based on CLAUDE.md + full code verification of all Front Desk page files, Feb 17, 2026.*
