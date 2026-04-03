-- =====================================================
-- RLS Hardening for Eli's Bakery
-- =====================================================

-- 1. Hardening Orders Table
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage everything" ON public.orders;
CREATE POLICY "Admins manage everything" ON public.orders
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

-- 2. Hardening Recipe Tables (Secret Sauce)
ALTER TABLE public.product_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_component_recipes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins view recipes" ON public.product_recipes;
CREATE POLICY "Only admins view recipes" ON public.product_recipes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

DROP POLICY IF EXISTS "Only admins view component recipes" ON public.order_component_recipes;
CREATE POLICY "Only admins view component recipes" ON public.order_component_recipes
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('owner', 'baker')
        )
    );

-- 3. Hardening Ingredient Usage
ALTER TABLE public.ingredient_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can log usage" ON public.ingredient_usage;
CREATE POLICY "Staff can log usage" ON public.ingredient_usage
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.user_id = auth.uid()
            AND user_profiles.role IN ('owner', 'baker')
        )
    );
