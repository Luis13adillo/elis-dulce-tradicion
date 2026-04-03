# CLAUDE.md — Eli's Dulce Tradicion

## Project Overview

Custom cake ordering website for Eli's Dulce Tradicion bakery. Customers place orders through the website, the owner monitors/manages orders from the Owner Dashboard, and the front desk (kitchen display) receives and processes orders on a tablet.

**Live site:** [elisbakery.com](https://elisbakery.com) — deployed via Vercel, auto-deploys from `main`
**Order status:** NOT yet accepting orders — Stripe uses test keys (`pk_test_...`). Production credentials needed before payments go live.

**What this project IS:**
- A custom cake ordering website with a 5-step order wizard
- An Owner Dashboard for monitoring orders, managing the menu/inventory, viewing reports, and managing recipes
- A Kitchen Display / Front Desk for receiving and processing incoming orders on a tablet
- Bilingual (English/Spanish) throughout

**What this project is NOT:**
- NOT a POS/cashier system — no cash register, no barcode scanning, no cash drawer
- NOT an employee management platform — no payroll, no scheduling, no staff directory
- NOT a multi-store enterprise tool — keep both dashboards simple and focused

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React + TypeScript | 18.3.1 |
| Build | Vite + React SWC | 5.4.19 |
| Styling | Tailwind CSS + shadcn/ui | 3.4.17 |
| State (global) | React Context (Auth, Language) | — |
| State (server) | TanStack React Query | 5.83.0 |
| State machine | XState | 5.25.0 |
| Routing | React Router DOM | 6.30.1 |
| Backend | Express.js (Node) | — |
| Database | PostgreSQL via Supabase | — |
| Auth | Supabase Auth (JWT) | 2.78.0 |
| Payments | Stripe | 8.6.3 |
| Real-time | Supabase subscriptions | — |
| Email | Resend via Supabase Edge Functions | — |
| i18n | react-i18next | 16.5.0 |
| Validation | Zod | 3.25.76 |
| Animation | Framer Motion | 12.23.24 |
| Icons | Lucide React | 0.462.0 |
| Forms | React Hook Form | 7.61.1 |
| Charts | Recharts | 2.15.4 |
| Monitoring | Sentry | 10.38.0 |
| Deployment | Vercel (frontend) | — |

## Project Structure

```
src/
├── pages/                    # Route-level page components
│   ├── Index.tsx             # Home/landing
│   ├── Order.tsx             # 5-step cake ordering wizard
│   ├── PaymentCheckout.tsx   # Stripe payment flow
│   ├── OrderConfirmation.tsx # Post-payment confirmation
│   ├── FrontDesk.tsx         # Kitchen display (baker/owner role)
│   ├── OwnerDashboard.tsx    # Owner management (owner role)
│   ├── Login.tsx / Signup.tsx
│   ├── Gallery.tsx / Menu.tsx / FAQ.tsx / About.tsx / Contact.tsx
│   ├── OrderTracking.tsx     # Customer order status
│   ├── OrderIssue.tsx        # Report problems
│   └── Legal/                # Terms, Privacy, Refund, Cookie policies
├── components/
│   ├── ui/                   # shadcn/ui primitives (51 components)
│   ├── kitchen/              # Kitchen display components
│   ├── dashboard/            # Owner dashboard components
│   ├── admin/                # CMS management components
│   ├── order/                # Order-related components
│   ├── payment/              # Stripe/Square payment forms
│   ├── home/                 # Landing page sections
│   ├── mobile/               # Mobile-specific components
│   ├── print/                # Ticket printing
│   └── [other feature folders]
├── contexts/
│   ├── AuthContext.tsx        # Auth state, signIn/signUp/signOut, role checking
│   └── LanguageContext.tsx    # i18n language state
├── hooks/                    # Custom React hooks
├── lib/
│   ├── api/                  # Modular API client
│   │   ├── base.ts           # BaseApiClient with Supabase connection
│   │   ├── index.ts          # Composed ApiClient singleton (export as `api`)
│   │   └── modules/          # OrdersApi, ProductsApi, InventoryApi, etc.
│   ├── queries/              # React Query hook factories
│   ├── supabase.ts           # Supabase client init
│   ├── queryClient.ts        # React Query config + query key factory
│   ├── validation.ts         # Zod schemas
│   ├── pricing.ts            # Price calculation logic
│   ├── cms.ts                # Content management API
│   ├── orderStateMachine.ts  # XState order status transitions
│   ├── i18n.ts               # i18next setup
│   └── utils.ts              # cn() and utility functions
├── types/
│   ├── index.ts              # Shared types (ApiResponse, Product, etc.)
│   ├── order.ts              # Order, OrderStatus, DeliveryStatus, PaymentStatus
│   └── auth.ts               # UserRole, UserProfile, AuthUser
├── locales/
│   ├── en/translation.json
│   └── es/translation.json
├── App.tsx                   # Root with routing and providers
└── main.tsx                  # Vite entry + Sentry init

backend/
├── server.js                 # Express.js entry point (port 3001)
├── routes/                   # 22+ route modules
│   ├── orders.js / orderTransitions.js / orderSearch.js
│   ├── payments.js / webhooks.js
│   ├── products.js / inventory.js / pricing.js
│   ├── delivery.js / customers.js / analytics.js / reports.js
│   └── health.js
├── middleware/               # Auth, validation, rate limiting, CORS
└── utils/                    # Helpers

supabase/
├── migrations/               # Database migrations
└── functions/                # 11 Edge Functions (email, payments, etc.)
```

## Conventions & Patterns

### Imports
Always use the `@/` path alias (maps to `src/`):
```typescript
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import type { Order } from '@/types/order';
```

### Component Pattern
PascalCase filenames. Feature-based folder organization. Props interface above component:
```typescript
interface MyComponentProps {
  value: string;
  onChange?: (val: string) => void;
}

export const MyComponent = ({ value, onChange }: MyComponentProps) => {
  const { t } = useLanguage();
  // ...
};
```

### API Client
Modular class-based. Import the singleton:
```typescript
import { api } from '@/lib/api';
const orders = await api.getAllOrders();
```

### React Query
Use the query key factory from `@/lib/queryClient`:
```typescript
import { queryKeys } from '@/lib/queryClient';
// queryKeys.orders.all, queryKeys.orders.detail(id), etc.
```

Config: 5-min stale time, 30-min GC, retry once with exponential backoff.

### Supabase Access
Direct table: `supabase.from('table').select()`
RPC functions: `supabase.rpc('function_name', { params })`
Real-time: `supabase.channel('channel').on('postgres_changes', ...)`

### Styling
Tailwind CSS with CSS custom properties for theming. Use `cn()` from `@/lib/utils` for conditional classes:
```typescript
import { cn } from '@/lib/utils';
<div className={cn("base-class", condition && "conditional-class")} />
```

Brand fonts: Playfair Display (display), Nunito (sans). Brand colors: gold (#C6A649), charcoal (#1A1A2E), cherry.

### Bilingual Content
All user-facing text must support English and Spanish. Use the `useLanguage` hook:
```typescript
const { t, language } = useLanguage();
// Key-based: t('orders.title')
// Inline: t('Spanish text', 'English text')
```

### Error Handling
Use `toast` from `sonner` for user-facing errors. Wrap async operations in try-catch. API modules return `{ success, data, error }` objects.

### Order Status Flow
`pending` → `confirmed` → `in_progress` → `ready` → `out_for_delivery` → `delivered` → `completed`
Can be `cancelled` from any state. Transitions validated by XState state machine in `lib/orderStateMachine.ts`.

## Auth & Roles

Three roles: `customer`, `baker`, `owner`

| Role | Access |
|------|--------|
| customer | Website, order placement, order tracking |
| baker | Front Desk / Kitchen Display (`/front-desk`) |
| owner | Owner Dashboard (`/owner-dashboard`) + Front Desk |

Auth via Supabase JWT. ProtectedRoute component enforces role-based access.

## Accounts

| Dashboard | Email | Password | Route |
|-----------|-------|----------|-------|
| Owner | `owner@elisbakery.com` | `ElisBakery123` | `/owner-dashboard` |
| Front Desk | `orders@elisbakery.com` | `OrdersElisBakery123` | `/front-desk` |

## Database Tables

Core: `orders`, `user_profiles`, `products`, `inventory`, `payments`, `order_status_history`
CMS: `business_settings`, `business_hours`, `holiday_closures`, `gallery_items`, `faq_items`, `contact_submissions`
Delivery: `delivery_zones`, `customer_addresses`
Recipes: `product_recipes`, `order_component_recipes`
Analytics: `analytics_events`, `audit_logs`, `order_notes`, `order_lookup_rate_limits`

## Environment Variables

### Frontend (.env)
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_MAPS_API_KEY=
VITE_API_URL=http://localhost:3001
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_SENTRY_DSN=                    # Optional
```

### Backend (backend/.env)
```
PORT=3001
NODE_ENV=development
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_API_KEY=
DATABASE_URL=
STRIPE_SECRET_KEY=
FRONTEND_URL=
```

**CRITICAL:** Never commit .env files. Use Vercel environment variables for production.

## Commands

```bash
npm run dev          # Start Vite dev server (port 5178)
npm run server:dev   # Start Express backend with --watch (port 3001)
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run analyze      # Bundle size analysis
```

## Key Architecture Decisions

1. **Stripe is the active payment provider.** Square code exists but is dead code — do not use it.
2. **Order creation happens on the website and via walk-in form on Front Desk.** The Owner Dashboard does NOT create orders.
3. **Pricing is currently hardcoded in Order.tsx** (sizes, fillings, bread types). These should be moved to the database.
4. **Real-time updates** use Supabase subscriptions with batched processing (useOptimizedRealtime hook).
5. **PWA** is configured with Workbox. Service worker caches Supabase (24hr), API (5min), and images (30 days).
6. **Code splitting** is manual via Vite config — vendor chunks for React, UI, Query, Supabase, i18n, Motion, plus feature chunks for dashboard and order flow.

## Known Issues (See GSD Fix Plan)

Refer to `Elis-GSD-Implementation-Fix-Plan.docx` for the full list of 21 scoped fixes. Key issues:
- Auth loading race conditions (AuthContext.tsx)
- Payment verification endpoint missing (OrderConfirmation.tsx)
- Order confirmation email never sent
- Hardcoded trend indicator in dashboard
- Calendar view not rendered in Front Desk
- Walk-in order creation not yet built
- Max daily capacity hardcoded to 20
- Recipe management UI not built (database tables exist)
