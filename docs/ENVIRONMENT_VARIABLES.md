# ENVIRONMENT_VARIABLES.md

Every environment variable the code reads, where it is used, and whether it is
required. **Names and purposes only — no secret values.** Verified against the
repo on 2026-06-15. Copy [.env.local.example](../.env.local.example) to `.env`
and fill in real values; `.env*` is gitignored (`.gitignore` lines 34-37, 62).

There are three surfaces:
1. **Frontend (Vite)** — `import.meta.env.VITE_*`, baked into the browser bundle.
2. **Backend (Express)** — `process.env.*`. Backend is largely undeployed in
   prod (see [docs/ARCHITECTURE.md](ARCHITECTURE.md)); these matter for local
   `npm run server`.
3. **Edge Functions (Supabase, Deno)** — `Deno.env.get(...)`, set with
   `supabase secrets set KEY=value`, NOT from a local `.env`.

> Production frontend values live in Vercel project settings. Production Edge
> Function secrets live in Supabase. Local `.env` should use test keys only.

## Frontend (Vite)

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | **Yes** | `src/lib/supabase.ts` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | `src/lib/supabase.ts` | Supabase public/anon key |
| `VITE_API_URL` | Optional (defaults `http://localhost:3001`) | `src/lib/api/index.ts`, `src/lib/api/modules/analytics.ts`, `src/lib/api-client.ts`, `src/lib/csrf.ts`, `src/components/order/OrderStatusFlow.tsx`, `src/components/dashboard/MenuManager.tsx` | Express backend base URL (delivery fee + some analytics) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Optional* | `src/pages/PaymentCheckout.tsx` | Stripe publishable key (*required for payments) |
| `VITE_GOOGLE_MAPS_API_KEY` | Optional | `src/components/order/AddressAutocomplete.tsx`, `src/lib/googleMaps.ts` | Maps Places + geocoding (delivery) |
| `VITE_SENTRY_DSN` | Optional | `src/main.tsx` | Sentry error tracking (frontend) |
| `VITE_ANALYTICS_ENDPOINT` | Optional | `src/lib/performance.ts` | Custom perf-metrics endpoint |
| `VITE_VAPID_PUBLIC_KEY` | Optional | `src/lib/pwa.ts` | Web push notifications |

## Backend (Express)

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `PORT` | Optional (default `3001`) | `backend/server.js` | Server port |
| `NODE_ENV` | Optional | `backend/server.js`, middleware, utils | `development`/`production`/`test` |
| `LOG_LEVEL` | Optional (default `info`) | `backend/utils/logger.js` | Log verbosity |
| `DATABASE_URL` | Yes (for DB) | `backend/db/connection.js`, `backend/scripts/*` | Postgres connection string |
| `SUPABASE_URL` | Yes (for auth) | `backend/middleware/auth.js`, `backend/utils/edgeFunctions.js`, scripts | Supabase URL (server) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (admin ops) | `backend/middleware/auth.js`, `backend/utils/edgeFunctions.js`, scripts | Admin Supabase key — **secret** |
| `SUPABASE_ANON_KEY` | Optional | `backend/middleware/auth.js`, `backend/utils/edgeFunctions.js` | Anon key (fallback) |
| `FRONTEND_URL` | Yes (CORS) | `backend/middleware/cors.js` | CORS allowlist + links |
| `ADMIN_API_KEY` | Yes in prod | `backend/middleware/auth.js` | `x-api-key` admin auth |
| `CSRF_SECRET` | Optional (dev default) | `backend/middleware/csrf.js` | CSRF token secret |
| `STRIPE_SECRET_KEY` | Optional* | `backend/routes/payments.js`, `backend/routes/cancellation.js` | Stripe server key (*for payments) |
| `RESEND_API_KEY` | Optional | `backend/sqlite-server.js` | Email (backend fallback path) |
| `RESEND_FROM_EMAIL` | Optional (default `orders@elisbakery.com`) | `backend/sqlite-server.js` | Email sender |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Optional | `backend/routes/webhooks.js` | Nodemailer fallback (port default 587) |
| `ORDER_WEBHOOK_URL` | Optional | `backend/utils/webhook.js`, `backend/test-webhook.js` | External order webhook (n8n/Zapier/Make) |
| `MAKE_COM_WEBHOOK_URL` | Optional | `backend/routes/webhooks.js`, `backend/routes/orders.js` | Make.com automation |
| `MAKE_COM_WHATSAPP_WEBHOOK` | Optional | `backend/routes/webhooks.js` | Make.com WhatsApp |
| `MERCHANT_EMAIL` | Optional (default `support@elisbakery.com`) | `backend/routes/payments-sqlite.js` | Merchant support email |
| `SENTRY_DSN` | Optional | `backend/middleware/errorHandler.js` | Backend Sentry (NOT currently wired — see KNOWN_BUGS) |
| `CRON_SECRET` | Yes (cron) | `backend/utils/edgeFunctions.js` | Cron auth (shared w/ Edge Functions) |

**Test-only** (set in `backend/__tests__/setup.js`): `SUPABASE_SERVICE_KEY`,
`JWT_SECRET`, `API_URL`, `SQUARE_APPLICATION_ID`.

**Square — DEAD CODE**, referenced only in unused files
(`backend/sqlite-server.js`, `backend/routes/webhooks.js`):
`SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT`,
`SQUARE_WEBHOOK_SECRET`. Do not configure for new work.

## Edge Functions (Supabase, Deno)

Set with `supabase secrets set KEY=value`. `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform.

| Variable | Required | Used in | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | auto | all functions | Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | auto | all functions | Admin DB access |
| `SUPABASE_ANON_KEY` | Optional | `order-cancel` | Anon fallback |
| `STRIPE_SECRET_KEY` | **Yes** | `create-payment-intent`, `stripe-webhook`, `verify-payment`, `order-cancel` | Stripe server key (`sk_live_` in prod) |
| `STRIPE_WEBHOOK_SECRET` | **Yes** | `stripe-webhook` | Webhook signature verification (`whsec_…`) |
| `RESEND_API_KEY` | Yes (email) | all `send-*` functions, `stripe-webhook` | Resend API key |
| `FROM_EMAIL` | Optional (default `orders@elisbakery.com`) | `send-*`, `stripe-webhook` | Email sender address |
| `FROM_NAME` | Optional (default `Eli's Bakery`) | `send-*`, `stripe-webhook` | Email sender name |
| `FRONTEND_URL` | Optional (default `https://elisbakery.com`) | `send-*`, `stripe-webhook` | Links in emails |
| `OWNER_EMAIL` | Optional (default `owner@elisbakery.com`) | issue/failed-payment/contact funcs, `stripe-webhook` | Owner alerts |
| `CRON_SECRET` | Yes (cron) | `scheduled-order-transitions`, `send-daily-report` | Scheduled-task auth |

## Documentation gaps / stale entries

Found in code but **not** in the existing `ENV_EXAMPLE_PRODUCTION` /
`ENV_SETUP.md` templates (now added to `.env.local.example`): `SMTP_*`,
`MAKE_COM_*`, `MERCHANT_EMAIL`, `SQUARE_WEBHOOK_SECRET`, `CRON_SECRET`,
`VITE_ANALYTICS_ENDPOINT`, `VITE_VAPID_PUBLIC_KEY`, `LOG_LEVEL`.

`ENV_EXAMPLE_PRODUCTION` references `VITE_DASHBOARD_PIN`. **No use of
`VITE_DASHBOARD_PIN` was found in the current `src/` code** — treat as stale /
legacy unless you find otherwise. (Marked UNKNOWN.)
