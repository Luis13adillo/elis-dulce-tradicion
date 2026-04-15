ALTER TABLE business_settings
  ADD COLUMN IF NOT EXISTS auto_confirm_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_confirm_prep_minutes INTEGER NOT NULL DEFAULT 30;
