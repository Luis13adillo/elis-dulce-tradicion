# API_ROUTES.md

Inventory of the Express backend in [backend/](../backend). Verified against the
repo on 2026-06-15.

> **Important:** This Express backend is **largely undeployed**. The production
> frontend talks to Supabase (PostgREST/RPC/Realtime/Storage) and Edge Functions
> directly; the most recent commit replaced an "undeployed backend route" with
> an Edge Function. The only Express endpoint the live frontend is known to call
> is delivery-fee calculation. Treat this doc as a reference to existing server
> code, not a description of the live API surface. For the live data API, see
> [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (RPCs) and
> [docs/ARCHITECTURE.md](ARCHITECTURE.md) (Edge Functions).

## Server setup (`backend/server.js`)

- Port `3001` (or `PORT`).
- Middleware order: Helmet (CSP + HSTS) → CORS → cookie-parser → body parse
  (10MB) → input sanitization → CSRF (double-submit; exempt for webhooks) →
  API versioning → general rate limit (100/15min/IP) → static `/uploads` →
  routes → 404 handler → error handler.
- Swagger UI at `GET /api-docs` (`backend/swagger.config.js`).
- Health at `GET /api/health`.
- CSRF token at `GET /api/v1/csrf-token`.
- Scheduled jobs from `backend/jobs/` start on boot unless `NODE_ENV=test`.

Every router is mounted **twice**: `/api/v1/<x>` (preferred) and `/api/<x>`
(legacy, sends deprecation headers).

## Routers

Auth legend: **none** = public; **auth** = `requireAuth` (Supabase JWT or
`x-api-key`); **admin** = owner/baker; **owner** = owner only.

### orders (`backend/routes/orders.js`) — `/api/v1/orders`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | auth | List orders (status/limit/offset filters) |
| GET | `/:id` | auth | One order (access-checked) |
| GET | `/number/:orderNumber` | none | Public tracking by order number |
| POST | `/` | none | Create order after payment (server-side price validation); rate-limited 10/min |
| PATCH | `/:id/status` | auth | Update status; sets timestamps; logs history |

### orderTransitions (`backend/routes/orderTransitions.js`) — `/api/v1/orders`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/:id/available-transitions` | auth | Valid next states for role |
| POST | `/:id/transition` | auth | Execute state-machine transition + side effects |
| GET | `/:id/transition-history` | auth | Status change history |

### orderSearch (`backend/routes/orderSearch.js`) — `/api/v1/orders`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/search` | auth | Full-text order search w/ filters, sort, pagination |

### cancellation (`backend/routes/cancellation.js`) — `/api/v1/orders`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/:id/cancellation-policy` | none | Refund policy for order |
| POST | `/:id/cancel` | auth | Customer cancel + Stripe refund (idempotency `refund-{id}`) |
| POST | `/:id/admin-cancel` | auth | Admin cancel w/ override refund |

### orders-reorder (`backend/routes/orders-reorder.js`) — `/api/v1/orders`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/:id/reorder` | auth | Pre-fill new order from a past one |

### customers (`backend/routes/customers.js`) — `/api/v1/customers`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/me` | auth | Own profile + stats |
| GET | `/me/orders` | auth | Own order history |
| GET/POST/PATCH/DELETE | `/me/addresses[/:id]` | auth | Saved addresses CRUD |
| PATCH | `/me/preferences` | auth | Notification + favorite preferences |

### products (`backend/routes/products.js`) — `/api/v1/products`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | List active products |
| POST | `/` | none | Create product |
| PATCH | `/:id` | none | Update product |
| DELETE | `/:id` | none | Soft delete (`is_active=0`) |

⚠️ No auth/validation on write endpoints, and backed by **SQLite**, not the
production Postgres. Likely dead in production.

### configurator (`backend/routes/configurator.js`) — `/api/v1/configurator`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/attributes` | none | Config rules (currently returns empty mock) |
| GET | `/capacity` | none | Time-slot capacity for a date |
| GET | `/ticket/:orderId` | none | Baker ticket data |

Partially implemented (mocked responses).

### pricing (`backend/routes/pricing.js`) — `/api/v1/pricing`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/current` | none | Active pricing (cached 1h) |
| POST | `/calculate` | none | Compute total (fillings, theme, delivery, tax, promo) |
| POST | `/promo-code/validate` | none | Validate promo code |
| PATCH | `/:type/:id` | owner | Update a pricing tier |

### capacity (`backend/routes/capacity.js`) — `/api/v1/capacity`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/available-dates` | none | Next-N-days availability (cached 5min) |
| GET | `/:date` | none | Capacity for a date |
| POST | `/set` | auth | Set max orders for a date |
| GET | `/business-hours` | none | Hours by weekday (cached 24h) |
| GET | `/holiday/:date` | none | Holiday/closed check |

### inventory (`backend/routes/inventory.js`) — `/api/v1/inventory`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | admin | All ingredients |
| GET | `/low-stock` | admin | Below-threshold items |
| PATCH | `/:id` | admin | Update quantity/notes |
| POST | `/usage` | admin | Log usage; decrement stock |
| GET | `/usage-report` | admin | Usage log over N days |

### delivery (`backend/routes/delivery.js`) — `/api/v1/delivery`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/validate-address` | none | Validate + zone lookup |
| GET | `/calculate-fee` | none | Fee by address/zip/latlng (Haversine, 4.5mi max) — **the one endpoint the live frontend calls** |
| GET | `/zones` | none | Active delivery zones |
| PATCH | `/orders/:id/delivery-status` | auth | Update delivery status (admin or assigned driver) |
| POST | `/assign` | admin | Assign order to driver |
| GET | `/today` | auth | Today's deliveries |

### analytics (`backend/routes/analytics.js`) — `/api/v1/analytics`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/dashboard` | owner | Dashboard KPIs |
| GET | `/revenue` | owner | Revenue by period |
| GET | `/popular-items` | owner | Top sizes/fillings |

### reports (`backend/routes/reports.js`) — `/api/v1/reports`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/daily-sales` | owner | CSV daily sales |
| GET | `/inventory` | owner | CSV inventory usage |

### webhooks (`backend/routes/webhooks.js`) — `/api/v1/webhooks`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/` | signature only (CSRF-exempt) | Stripe/Square webhook → emails (Resend, Nodemailer fallback) |
| * | `/make-com/*` | none | Make.com triggers |

### upload (`backend/routes/upload.js`) — `/api/v1/upload`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/` | none | Image upload (multer, 5MB, images only) → `backend/uploads/` |

### health (`backend/routes/health.js`) — `/api/health`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | none | Status, uptime, DB latency, service config flags |

### newsletter (`backend/routes/newsletter.js`)
**NOT mounted** in `server.js` — unreachable. SQLite-backed.

## Middleware (`backend/middleware/`)

- `auth.js` — `requireAuth` / `requireAdmin` / `requireOwner`; `x-api-key`
  (→ owner) or Supabase JWT (→ role from `user_profiles`).
- `cors.js` — allowlist (localhost:5173-5176 + `FRONTEND_URL`), credentials on.
- `csrf.js` — double-submit cookie; GET/HEAD/OPTIONS ignored.
- `rateLimit.js` — `generalLimiter` 100/15min (global), `orderCreationLimiter`
  10/min (order POST); `authLimiter`/`adminLimiter` defined but unused.
- `validateInput.js` — sanitizes body/query/params; field validators.
- `errorHandler.js` — `AppError`, JSON error shape, logs to `error_logs` +
  Sentry (if configured), `asyncHandler`, 404 handler.
- `versioning.js` — version headers + deprecation warnings on legacy routes.
- `cache.js` — in-memory GET cache (resets on restart; not distributed).

## Dead / alternate backend files

- `backend/sqlite-server.js` — alternate SQLite dev server (not prod).
- `backend/mock-server.js` — in-memory mock server (testing).
- `backend/orders-sqlite.js`, `backend/payments-sqlite.js` — SQLite variants.
- `backend/test-webhook.js` — manual webhook trigger utility.

## Standard response shapes

- Success/error from API modules: `{ success, data, error }`.
- Errors: `{ success: false, error: { code, message, details?, stack? } }`
  (stack in dev only).
