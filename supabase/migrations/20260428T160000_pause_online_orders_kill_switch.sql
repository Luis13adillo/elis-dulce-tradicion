-- Server-side kill switch for online ordering.
--
-- Added 2026-04-28 after a real customer (Dawn Specht) placed an order
-- despite the /order route showing a maintenance page. Root cause:
-- the PWA service worker keeps serving cached /order chunks to returning
-- visitors until they explicitly accept an update prompt. The maintenance
-- page only protected new visitors. The Edge Function backend had no pause
-- check, so when a cached UI submitted, Supabase processed it.
--
-- This migration adds a database-level boolean that create_pending_order
-- checks at the very top of its body. When true, the RPC raises an
-- exception so no order can be created, regardless of which (cached or
-- fresh) frontend bundle made the call.
--
-- Toggle from the dashboard (or via SQL):
--   UPDATE business_settings SET online_orders_paused = false;  -- accept orders
--   UPDATE business_settings SET online_orders_paused = true;   -- pause orders

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS online_orders_paused boolean NOT NULL DEFAULT true;

-- Note: the create_pending_order RPC body that reads this flag is
-- defined / replaced in the later migration
-- 20260428_add_bread_type_servings_recipient.sql, which is the canonical
-- final version.
