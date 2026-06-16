# FEATURE_BUILD_WORKFLOW.md

How to add a feature to this codebase the way the existing code does it, and how
to ship it without breaking the live site. Verified on 2026-06-15. Read
[docs/AI_CONTEXT.md](AI_CONTEXT.md) and [docs/ARCHITECTURE.md](ARCHITECTURE.md)
first.

## Before you build

1. **Confirm scope.** Don't expand it. If the task is X and Y also looks broken,
   note Y and stop unless asked.
2. **Pick the layer.** Decide where the change belongs:
   - UI / behavior → React in `src/`.
   - New data read/write → usually a **Supabase RPC** (migration) +
     `src/lib/api/modules/*`, NOT a new Express route (the backend is largely
     undeployed).
   - Payments / email / anything needing a secret or service-role → **Edge
     Function** in `supabase/functions/`.
   - Schema change → **migration** in `supabase/migrations/`.
3. **Check it doesn't already exist.** Search `src/lib/api/`, the RPCs in
   [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md), and the Edge Functions.

## Conventions to match (from CLAUDE.md)

- **Imports:** `@/` alias → `src/`. e.g. `import { api } from '@/lib/api'`.
- **Components:** PascalCase files, props interface above the component,
  feature-based folders.
- **Server state:** TanStack React Query with the key factory from
  `@/lib/queryClient` (`queryKeys.orders.*`, etc.).
- **Data access:** the singleton `api` from `@/lib/api`. Supabase direct table /
  `supabase.rpc(...)` / `supabase.channel(...)` patterns.
- **Styling:** Tailwind + shadcn/ui; `cn()` from `@/lib/utils`; brand fonts
  Playfair Display / Nunito; gold `#C6A649`, charcoal `#1A1A2E`.
- **Bilingual:** every user-facing string must support EN/ES via
  `useLanguage()` — `t('key')` or `t('Spanish', 'English')`. No hardcoded
  user-facing copy.
- **Errors:** `toast` from `sonner`; wrap async in try/catch; API modules return
  `{ success, data, error }`.
- **Auth:** rely on `ProtectedRoute` for access control; never duplicate auth
  checks inside dashboards (causes redirect loops — see
  [docs/ARCHITECTURE.md](ARCHITECTURE.md#auth)).

## Typical recipes

### Add a UI-only feature
Add/extend a component under the right `src/components/<feature>/` folder, wire
it into the page, add EN/ES strings, use existing hooks/`api`. Done.

### Add a new data read
Prefer a Supabase RPC (`SECURITY DEFINER`, with a `GRANT EXECUTE` to the right
role) in a new migration, then a method in the matching `src/lib/api/modules/*`
file, then a React Query hook. Mirror an existing RPC (e.g. `get_orders_by_status`)
for shape and grants.

### Add a write that touches money/orders
Money and order-state writes go through **RPCs that validate server-side**
(`create_pending_order`, `transition_order_status`, `create_new_order`). Add
validation in the RPC, not just the client. Update the frontend state machine
[src/lib/orderStateMachine.ts](../src/lib/orderStateMachine.ts) AND the DB one
(`transition_order_status`) together if you change allowed transitions — the DB
is authoritative.

### Add an Edge Function
Create `supabase/functions/<name>/index.ts` (Deno). Reuse `_shared/` email
templates/helpers. Read secrets via `Deno.env.get(...)` and document the new
secret in [docs/ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md). Deploy with
`supabase functions deploy <name>` (separate from the frontend deploy).

### Add a schema change
New file in `supabase/migrations/` named `YYYYMMDD..._description.sql`. Enable
RLS and add explicit policies for any new table (the project hardens RLS — see
`20260211_rls_hardening.sql`). Apply via the Supabase dashboard or
`supabase db push` — **a git push does not run migrations.** Update
[docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Pre-ship checklist

1. `npm run lint`
2. `npm run build` — must pass; catches TS errors (do this before every push).
3. `npm run test` (Vitest) and, for order/payment/dashboard changes,
   `npm run test:e2e` (Playwright).
4. For UI changes, smoke-test in a real browser (`npm run dev`, port 5178).
5. For Stripe-related changes, dry-run against **test mode** first. Never deploy
   payment changes straight to live.

## Shipping

- Use the **`elis-bulletproof-ship`** skill. It enforces: branch workflow, scope
  audit, pre-commit parity (tsc + lint + build + smoke), commit-message style,
  and the separate deploy paths.
- **Every push to `main` auto-deploys the frontend to Vercel.** Branch first;
  commit/push only when the user asks.
- Three independent deploy targets — know which you're touching:
  - Frontend → `git push` (Vercel auto-deploy).
  - Edge Function → `supabase functions deploy <name>`.
  - Migration → Supabase dashboard / `supabase db push`.
- Verify the Vercel deploy (`npx vercel ls`). Note the project-memory caveat:
  confirm Vercel is connected to the current GitHub repo
  (`Luis13adillo/elis-dulce-tradicion`) before assuming a push reaches prod.

## Hard rules (do not violate)

- No production DB writes, `git push --force`, or `git reset --hard` on shared
  branches without explicit confirmation — even in auto mode.
- Don't reintroduce duplicate confirmation emails (the `stripe-webhook` function
  is the sole sender).
- Don't extend Square code (dead).
- Keep both dashboards simple — this is one small bakery, not an enterprise tool.
