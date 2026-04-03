-- =====================================================
-- Universal Audit Log System
-- =====================================================
-- Tracks every change to critical business data
-- =====================================================

-- 1. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    table_name TEXT NOT NULL,
    record_id TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data JSONB,
    new_data JSONB,
    changed_by UUID REFERENCES auth.users(id),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast searching
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_at ON audit_logs(changed_at DESC);

-- 2. Generic Audit Trigger Function
CREATE OR REPLACE FUNCTION audit_table_change()
RETURNS TRIGGER AS $$
DECLARE
    v_old_data JSONB := NULL;
    v_new_data JSONB := NULL;
    v_record_id TEXT;
BEGIN
    -- Extract record ID (assumes a column named 'id' exists)
    IF TG_OP = 'DELETE' THEN
        v_record_id := OLD.id::TEXT;
        v_old_data := to_jsonb(OLD);
    ELSIF TG_OP = 'UPDATE' THEN
        v_record_id := NEW.id::TEXT;
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    ELSIF TG_OP = 'INSERT' THEN
        v_record_id := NEW.id::TEXT;
        v_new_data := to_jsonb(NEW);
    END IF;

    -- Insert into audit log
    INSERT INTO audit_logs (
        table_name,
        record_id,
        action,
        old_data,
        new_data,
        changed_by
    ) VALUES (
        TG_TABLE_NAME,
        v_record_id,
        TG_OP,
        v_old_data,
        v_new_data,
        auth.uid()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply Audit Triggers to Critical Tables
-- Orders
DROP TRIGGER IF EXISTS audit_orders_trigger ON public.orders;
CREATE TRIGGER audit_orders_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION audit_table_change();

-- Ingredients
DROP TRIGGER IF EXISTS audit_ingredients_trigger ON public.ingredients;
CREATE TRIGGER audit_ingredients_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.ingredients
    FOR EACH ROW EXECUTE FUNCTION audit_table_change();

-- Recipes
DROP TRIGGER IF EXISTS audit_product_recipes_trigger ON public.product_recipes;
CREATE TRIGGER audit_product_recipes_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.product_recipes
    FOR EACH ROW EXECUTE FUNCTION audit_table_change();

-- 4. RLS for Audit Logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs" ON audit_logs
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('owner', 'baker')
        )
    );
