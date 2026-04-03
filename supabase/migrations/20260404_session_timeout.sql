-- Phase 10 AUTH-02: Add session_timeout_minutes to business_settings
ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER NOT NULL DEFAULT 30;

-- Update existing row with default (30 minutes)
UPDATE business_settings SET session_timeout_minutes = 30 WHERE session_timeout_minutes IS NULL;
