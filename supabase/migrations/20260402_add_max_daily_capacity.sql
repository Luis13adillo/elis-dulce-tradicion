-- Phase 5 FIX-06: Add max_daily_capacity to business_settings
-- The TypeScript type BusinessSettings already has max_daily_capacity?: number
-- but the PostgreSQL table is missing this column.
-- Default is 10 (per audit: capacity.js line 102 uses 10, not 20).

ALTER TABLE business_settings
    ADD COLUMN IF NOT EXISTS max_daily_capacity INTEGER NOT NULL DEFAULT 10;

-- Ensure any existing rows have the default value set
UPDATE business_settings
    SET max_daily_capacity = 10
    WHERE max_daily_capacity IS NULL;
