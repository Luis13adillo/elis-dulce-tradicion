-- Business Configuration and Content Management System Schema

-- Business Settings Table
CREATE TABLE IF NOT EXISTS business_settings (
    id SERIAL PRIMARY KEY,
    business_name VARCHAR(255) NOT NULL DEFAULT 'Eli''s Dulce Tradición',
    business_name_es VARCHAR(255),
    tagline TEXT,
    tagline_es TEXT,
    logo_url TEXT,
    address_street VARCHAR(255) NOT NULL DEFAULT '846 Street Rd.',
    address_city VARCHAR(100) NOT NULL DEFAULT 'Bensalem',
    address_state VARCHAR(50) NOT NULL DEFAULT 'PA',
    address_zip VARCHAR(20) NOT NULL DEFAULT '19020',
    phone VARCHAR(50) NOT NULL DEFAULT '610-910-9067',
    email VARCHAR(255) NOT NULL DEFAULT 'info@elisdulcetradicion.com',
    minimum_lead_time_hours INTEGER NOT NULL DEFAULT 24,
    maximum_advance_days INTEGER NOT NULL DEFAULT 90,
    service_area_type VARCHAR(20) NOT NULL DEFAULT 'radius', -- 'radius' or 'zipcodes'
    service_radius_miles INTEGER DEFAULT 10,
    service_zipcodes TEXT[], -- Array of zip codes
    about_us_content TEXT,
    about_us_content_es TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id)
);

-- Business Hours Table
CREATE TABLE IF NOT EXISTS business_hours (
    id SERIAL PRIMARY KEY,
    day_of_week INTEGER NOT NULL, -- 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    is_open BOOLEAN NOT NULL DEFAULT true,
    open_time TIME,
    close_time TIME,
    is_closed BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(day_of_week)
);

-- Holiday Closures Table
CREATE TABLE IF NOT EXISTS holiday_closures (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    closure_date DATE NOT NULL,
    is_recurring BOOLEAN NOT NULL DEFAULT false, -- If true, applies every year
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Social Media Links Table
CREATE TABLE IF NOT EXISTS social_media_links (
    id SERIAL PRIMARY KEY,
    platform VARCHAR(50) NOT NULL, -- 'facebook', 'instagram', 'twitter', 'youtube', 'tiktok', etc.
    url TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform)
);

-- FAQs Table (for admin CRUD)
CREATE TABLE IF NOT EXISTS faqs (
    id SERIAL PRIMARY KEY,
    question_en TEXT NOT NULL,
    question_es TEXT NOT NULL,
    answer_en TEXT NOT NULL,
    answer_es TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Content Pages Table (for About, Contact, etc.)
CREATE TABLE IF NOT EXISTS content_pages (
    id SERIAL PRIMARY KEY,
    page_slug VARCHAR(100) NOT NULL UNIQUE, -- 'about', 'contact', etc.
    title_en VARCHAR(255) NOT NULL,
    title_es VARCHAR(255) NOT NULL,
    content_en TEXT,
    content_es TEXT,
    meta_title_en VARCHAR(255),
    meta_title_es VARCHAR(255),
    meta_description_en TEXT,
    meta_description_es TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Homepage Content Table
CREATE TABLE IF NOT EXISTS homepage_content (
    id SERIAL PRIMARY KEY,
    section VARCHAR(100) NOT NULL UNIQUE, -- 'hero', 'featured_products', 'testimonials', 'cta'
    title_en VARCHAR(255),
    title_es VARCHAR(255),
    subtitle_en TEXT,
    subtitle_es TEXT,
    content_en TEXT,
    content_es TEXT,
    image_url TEXT,
    button_text_en VARCHAR(100),
    button_text_es VARCHAR(100),
    button_link VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gallery Items Table
CREATE TABLE IF NOT EXISTS gallery_items (
    id SERIAL PRIMARY KEY,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    category VARCHAR(100) NOT NULL, -- 'birthday', 'wedding', 'custom', 'quinceanera', etc.
    category_en VARCHAR(100),
    category_es VARCHAR(100),
    caption_en TEXT,
    caption_es TEXT,
    description_en TEXT,
    description_es TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title_en VARCHAR(255) NOT NULL,
    title_es VARCHAR(255) NOT NULL,
    message_en TEXT NOT NULL,
    message_es TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'success', 'holiday'
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_dismissible BOOLEAN NOT NULL DEFAULT true,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SEO Configuration Table
CREATE TABLE IF NOT EXISTS seo_config (
    id SERIAL PRIMARY KEY,
    page_path VARCHAR(255) NOT NULL UNIQUE, -- '/', '/about', '/menu', etc.
    meta_title_en VARCHAR(255),
    meta_title_es VARCHAR(255),
    meta_description_en TEXT,
    meta_description_es TEXT,
    og_title_en VARCHAR(255),
    og_title_es VARCHAR(255),
    og_description_en TEXT,
    og_description_es TEXT,
    og_image_url TEXT,
    structured_data JSONB, -- For LocalBusiness schema, etc.
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Footer Configuration Table
CREATE TABLE IF NOT EXISTS footer_config (
    id SERIAL PRIMARY KEY,
    business_info_en TEXT,
    business_info_es TEXT,
    quick_links JSONB, -- Array of {label_en, label_es, url}
    show_newsletter BOOLEAN NOT NULL DEFAULT true,
    newsletter_text_en TEXT,
    newsletter_text_es TEXT,
    copyright_text_en VARCHAR(255),
    copyright_text_es VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_faqs_display_order ON faqs(display_order, is_active);
CREATE INDEX IF NOT EXISTS idx_gallery_items_category ON gallery_items(category, is_active);
CREATE INDEX IF NOT EXISTS idx_gallery_items_display_order ON gallery_items(display_order);
CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_business_hours_day ON business_hours(day_of_week);
CREATE INDEX IF NOT EXISTS idx_holiday_closures_date ON holiday_closures(closure_date);

-- Triggers for updated_at
CREATE TRIGGER update_business_settings_updated_at BEFORE UPDATE ON business_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_business_hours_updated_at BEFORE UPDATE ON business_hours
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_holiday_closures_updated_at BEFORE UPDATE ON holiday_closures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_media_links_updated_at BEFORE UPDATE ON social_media_links
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faqs_updated_at BEFORE UPDATE ON faqs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_pages_updated_at BEFORE UPDATE ON content_pages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_homepage_content_updated_at BEFORE UPDATE ON homepage_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_gallery_items_updated_at BEFORE UPDATE ON gallery_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seo_config_updated_at BEFORE UPDATE ON seo_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_footer_config_updated_at BEFORE UPDATE ON footer_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies (if using Supabase)
-- Note: These should be added after enabling RLS on the tables
-- ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Public read access" ON business_settings FOR SELECT USING (true);
-- CREATE POLICY "Owner write access" ON business_settings FOR ALL USING (
--     EXISTS (SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'owner')
-- );
