-- Phase 5: Enable RLS on CMS tables
-- These policies were defined in backend/db/cms-schema.sql but not applied.

-- business_settings: public read, owner write
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can read business settings" ON business_settings;
CREATE POLICY "Public can read business settings" ON business_settings
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owner can manage business settings" ON business_settings;
CREATE POLICY "Owner can manage business settings" ON business_settings
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );

-- gallery_items: public read active items, owner write
ALTER TABLE gallery_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active gallery items" ON gallery_items;
CREATE POLICY "Public can view active gallery items" ON gallery_items
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Owner can manage gallery items" ON gallery_items;
CREATE POLICY "Owner can manage gallery items" ON gallery_items
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );

-- faqs: public read active, owner write
ALTER TABLE faqs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active faqs" ON faqs;
CREATE POLICY "Public can view active faqs" ON faqs
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Owner can manage faqs" ON faqs;
CREATE POLICY "Owner can manage faqs" ON faqs
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );

-- business_hours: public read, owner and baker write
ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view business hours" ON business_hours;
CREATE POLICY "Public can view business hours" ON business_hours
    FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage business hours" ON business_hours;
CREATE POLICY "Admins can manage business hours" ON business_hours
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role IN ('owner', 'baker'))
    );

-- announcements: public read active, owner write
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can view active announcements" ON announcements;
CREATE POLICY "Public can view active announcements" ON announcements
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Owner can manage announcements" ON announcements;
CREATE POLICY "Owner can manage announcements" ON announcements
    FOR ALL USING (
        EXISTS (SELECT 1 FROM user_profiles
                WHERE user_id = auth.uid() AND role = 'owner')
    );
