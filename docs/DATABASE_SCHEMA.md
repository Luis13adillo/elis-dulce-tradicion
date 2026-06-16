# DATABASE_SCHEMA.md

The PostgreSQL (Supabase) schema, reconstructed from `supabase/migrations/*.sql`
(27 migration files) and the codebase. Verified on 2026-06-15. The database is
**authoritative** for order logic — the RPCs below enforce rules the frontend
only mirrors. **Do not run writes against production** (see
[docs/AI_CONTEXT.md](AI_CONTEXT.md)).

Where a column/table is ALTERed across migrations, the consolidated final shape
is shown with the migration noted. Items the migrations do not fully reveal are
marked **UNKNOWN**.

## Order status state machine

Enforced in `transition_order_status` (migration
`20260525120100_enforce_state_machine_and_audit.sql`):

```
pending → confirmed | cancelled
confirmed → in_progress | cancelled
in_progress → ready | cancelled
ready → out_for_delivery | delivered | completed | cancelled
out_for_delivery → delivered | cancelled
delivered → completed
completed → (terminal)   cancelled → (terminal)
```

`pending_orders.status`: `awaiting_payment | payment_failed | promoted | expired`.
`orders.delivery_status` (free VARCHAR): `pending | assigned | in_transit |
delivered | failed`.

## Core tables

### orders
Primary order record. Key columns: `id` (SERIAL PK), `order_number` (unique),
customer fields (`customer_name/email/phone`, `customer_language`), `user_id`
(→ auth.users, nullable for guests), schedule (`date_needed`, `time_needed`,
`estimated_ready_at`), cake config (`cake_size`, `bread_type`,
`bread_type_value`, `filling`, `theme`, `dedication`, `servings` [1-500],
`recipient_name`, `allergies`, `reference_image_path`), delivery
(`delivery_option`, `delivery_address`, `delivery_apartment`, `delivery_zone`,
`delivery_fee`, `delivery_status`, `delivery_instructions`,
`estimated_delivery_time`), status (`status` default `pending`,
`payment_status`, `payment_method`, `payment_id`, `stripe_payment_id`,
`payment_intent_id`, `idempotency_key` [unique], `pending_order_id` →
pending_orders), money (`subtotal`, `tax_amount`, `discount_amount`,
`total_amount`, `premium_filling_upcharge`), refund (`refund_amount`,
`refund_status`, `refund_processed_at`, `cancellation_reason`, `cancelled_at`),
timestamps (`created_at`, `updated_at`, `ready_at`, `dispatched_at`,
`delivered_at`, `completed_at`), metrics (`time_to_confirm`, `time_to_ready`,
`time_to_complete`).
**RLS:** enabled; admins (owner/baker) manage all. Audited by
`audit_orders_trigger`. Capacity + customer-stats + status-notification triggers
fire on it (see Triggers).
Migrations: base `schema.sql`, then `20260206171327`, `20260414`, `20260422`,
`20260423`, `20260428_add_bread_type_servings_recipient.sql`, `20260211_rls_hardening.sql`.

### pending_orders
Holds an order between submission and confirmed payment (Tier A). `id` (UUID PK,
the unguessable access token), `order_number` (unique), `status`
(awaiting_payment | payment_failed | promoted | expired), `payment_intent_id`
(unique), error fields, full snapshot of customer + cake + delivery + pricing
fields (mirrors `orders`), `filling_values` (JSONB), `consent_given/timestamp`,
`raw_payload` (JSONB), `client_idempotency_key` (unique when not null),
`expires_at` (now + 24h), `promoted_at`, `promoted_order_id` → orders.
**RLS:** enabled; customers view own, staff view all. Trigger:
`pending_orders_updated_at`.
Migration: `20260422_tier_a_bulletproof_payments.sql` (+ `20260423`, `20260428`).

### payments
`id`, `order_id` → orders (cascade), `square_payment_id` (unique — legacy
naming), `amount`, `currency` (default USD), `status`, `payment_method`,
timestamps. Trigger `update_payments_updated_at`. (Base `schema.sql`.)

### stripe_webhook_events
Idempotency ledger: `event_id` (PK), `event_type`, `received_at`, `payload`
(JSONB). **RLS** enabled, service-role only. (`20260422`.)

### order_status_history
Audit of status changes: `id`, `order_id` → orders (cascade), `status`,
`new_status`, `previous_status`, `changed_by` → auth.users, `notes`, `reason`,
`metadata` (JSONB), plus cancellation fields, `created_at`. **RLS** enabled
(admins view). (`schema.sql` + `20260428_fix_transition_order_status_column.sql`
+ `20260525120100`.)

## Menu / pricing

- **cake_sizes** — `value` (slug, unique), `label_en/es`, `price`, `serves`,
  `featured`, `active`, `sort_order`. Seeded with 8 sizes. RLS: public reads
  active. (`20260402_order_form_options.sql`.)
- **cake_fillings** — `value`, `label_en`, `sub_label`, `is_premium`, `active`,
  `sort_order`. Seeded ~14 fillings. RLS: public reads active.
- **bread_types** — `value`, `label_en`, `description`, `active`, `sort_order`.
  Seeded: tres-leches, chocolate, vanilla.
- **premium_filling_upcharges** — `size_value` (unique), `label_en/es`,
  `upcharge`, `active`. Seeded: 10-round=$5, full-sheet=$20.
- **business_settings** — singleton config: business identity/address/contact,
  `minimum_lead_time_hours`, `maximum_advance_days`, service area,
  `max_daily_capacity` (default 10), `session_timeout_minutes` (default 30),
  `auto_confirm_enabled` + `auto_confirm_prep_minutes`, **`online_orders_paused`
  (default true — kill switch)**. RLS: public read, owner write. Migrations:
  `cms-seed-data.sql`, `20260402_add_max_daily_capacity.sql`, `20260404`,
  `20260414`, `20260428T160000`.

## Capacity / scheduling

- **daily_capacity** — `date` (PK), `max_orders` (default 10), `current_orders`,
  `notes`. Auto-incremented/decremented by order triggers.
- **business_hours** — `day_of_week` (0-6, unique), `open_time`, `close_time`,
  `is_open`, `is_closed`. RLS public read / admin manage.
- **holiday_closures** — referenced by capacity checks; exact columns
  **UNKNOWN** (assumed `closure_date`, recurrence, description).

## Inventory / recipes

- **ingredients** — `id`, `name` (unique), `quantity`, `unit`,
  `low_stock_threshold`, `category`, `supplier`, `updated_by`. RLS admin. Audited.
- **ingredient_usage** — `ingredient_id` → ingredients, `quantity_used`,
  `order_id` → orders, `notes`, `used_by`. RLS admin.
- **product_recipes** — `product_id` → products, `ingredient_id`,
  `quantity_required`, unique(product_id, ingredient_id). Audited.
  (`20260211_recipe_engine.sql`.)
- **order_component_recipes** — `component_type`, `component_value`,
  `ingredient_id`, `quantity_required`, unique triple. (Maps cake
  size/filling → ingredient quantities.)
- **products** — referenced by recipes, but a `CREATE TABLE products` is **not
  in the readable migrations** (may exist via a backend script). Marked UNKNOWN.

## Customers / users

- **user_profiles** — `id`/`user_id` (UUID → auth.users), `role` (enum
  customer | baker | owner), `full_name`, `phone`, default delivery fields,
  favorites, notification toggles, `total_orders`, `total_spent`,
  `loyalty_points`. RLS: own row + staff view; owners set roles. Created on
  signup by `handle_new_user` trigger (default `customer`). Indexed on
  `user_id` and `(user_id, role)`. (Some migrations call this table `profiles`.)
- **customer_addresses** — `user_id` → auth.users (cascade), `label` (unique per
  user), address fields, `is_default`. Trigger enforces single default. RLS own.
- **order_reviews** — `order_id`, `user_id`, `rating` (1-5), `comment`, unique
  (order_id, user_id). RLS own + admin.

## Cancellation / refunds

- **cancellation_policies** — `hours_before_needed` (unique),
  `refund_percentage` (0-100), `description`, `active`. Seeded 48h=100% /
  24h=50% / 0h=0%. RLS public reads active (`20260525200000`).
- **refunds** — `order_id` → orders, `payment_id`, refund amount/percentage/
  reason/status, `square_refund_id`, `processed_by`. RLS own + admin.

## Analytics / audit / support

- **analytics_events** — `event_name`, `event_properties` (JSONB), `page_path`.
  RLS: staff read; anon/auth can insert via `track_analytics_event`.
- **audit_logs** — `table_name`, `record_id`, `action` (INSERT/UPDATE/DELETE),
  `old_data`/`new_data` (JSONB), `changed_by`. RLS admin. Written by
  `audit_table_change` on orders, ingredients, product_recipes. (`20260211`.)
- **order_lookup_rate_limits** — `ip_address` (PK), `lookup_count`,
  `window_start`. Backs public-tracking rate limiting (10/min/IP).
- **order_notes** — staff notes on orders. RLS staff.
- **error_logs** — backend error log; columns **UNKNOWN** (partitioned).
- **contact_submissions**, **failed_payments**, **order_issues** — referenced;
  full schema **UNKNOWN**.

## CMS tables (`cms-seed-data.sql`, `20260402_cms_rls_policies.sql`)

`faqs`, `gallery_items`, `announcements`, `content_pages`, `homepage_content`,
`footer_config`, `seo_config`, `social_media_links`. Bilingual `*_en`/`*_es`
fields, `is_active`, `display_order`. RLS: public reads active, owner manages.
(Note: much of the public site still uses hardcoded content — see
[docs/KNOWN_BUGS.md](KNOWN_BUGS.md).)

## Delivery tables

`delivery_zones`, `delivery_assignments`, `delivery_tracking` are referenced in
code/triggers; full column definitions are **UNKNOWN** from the readable
migrations. `delivery_zones` likely has fee/per-mile/max-distance/name fields.

## RPC functions (the live data API)

| Function | Purpose | Granted to |
|---|---|---|
| `create_pending_order(payload jsonb)` | Validate + create a pending order (price recompute, lead time, capacity, holidays, kill switch, idempotency) | anon, authenticated |
| `promote_pending_order(pending_id, payment_intent_id, idempotency_key?)` | Atomically copy pending→orders on payment success | service_role |
| `mark_pending_order_failed(pending_id, payment_intent_id, msg, code?)` | Mark pending failed, extend expiry for retry | service_role |
| `get_pending_order(pending_id)` | Read own pending order (UUID = token) | anon, authenticated |
| `create_new_order(payload jsonb)` | Direct order creation (walk-in/cash) | authenticated |
| `transition_order_status(order_id, new_status, user_id?, reason?, metadata?)` | State-machine transition + timestamps + history | authenticated |
| `get_public_order(order_number)` | Sanitized public tracking, rate-limited | anon, authenticated |
| `check_order_lookup_rate_limit(ip)` | 10/min sliding window | anon, authenticated |
| `cleanup_order_lookup_rate_limits()` | Purge old rate-limit rows | (definer) |
| `get_cancellation_policy(hours_before)` | Refund % for window | anon, authenticated |
| `calculate_refund_amount(total, hours_before)` | Refund $ | anon, authenticated |
| `track_analytics_event(name, properties?)` | Fire-and-forget analytics insert | anon, authenticated |
| `get_orders_by_status()` | Dashboard: count + revenue by status | authenticated |
| `get_low_stock_ingredients()` | Below-threshold ingredients | authenticated |
| `is_date_available(date)` / `get_available_dates(days_ahead?)` | Order date availability | (used by ordering) |
| `prune_expired_pending_orders()` | Expire/clean pending orders + old webhook events | cron |
| `_random_order_number_token(length?)` | Generate ORD-XXXX tokens | (helper) |

All are `SECURITY DEFINER`. View `v_popular_items` exists for dashboards
(`20260417_dashboard_performance.sql`).

## Triggers (selected)

- `update_*_updated_at` — timestamp maintenance on many tables.
- `order_capacity_increment` / `order_capacity_decrement` — keep
  `daily_capacity.current_orders` in sync.
- `update_customer_stats` / `revert_customer_stats` — maintain
  `user_profiles.total_orders/total_spent/loyalty_points`.
- `ensure_single_default_address` — one default address per user.
- `audit_orders_trigger` / `audit_ingredients_trigger` /
  `audit_product_recipes_trigger` → `audit_table_change`.
- `on_order_status_change` → `handle_status_notification` (calls Edge Function
  via `net.http_post`: `send-ready-notification` or `send-status-update`).
- `on_auth_user_created` → `handle_new_user` (create `user_profiles` row).

## Cron jobs (pg_cron)

| Job | Schedule (UTC) | Action |
|---|---|---|
| daily-sales-report | `0 13 * * *` | POST → `send-daily-report` Edge Function |
| prune-expired-pending-orders | `5 * * * *` | `prune_expired_pending_orders()` |

## Storage buckets

- `reference-images` (or similar) — customer-uploaded cake reference images.
- Gallery images are referenced by path/URL in `gallery_items`.

## Notes for migrations

Migrations apply **separately** from the frontend deploy: Supabase dashboard or
`supabase db push`. A `git push` does not run them. Some early migration names
(e.g. `schema.sql`, `capacity-inventory-schema.sql`, `cancellation-schema.sql`,
`customer-management-schema.sql`) are referenced by the schema reconstruction
but may live in `backend/migrations/` or `backend/db/` rather than
`supabase/migrations/`; confirm location before editing.
