-- Add estimated prep-time target to orders
-- Set by front desk when confirming an order; displayed as a countdown on order cards
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_ready_at TIMESTAMPTZ;
