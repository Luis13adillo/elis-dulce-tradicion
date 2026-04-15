/**
 * Content Management System API
 * Functions for fetching and managing business configuration and content
 */

import { supabase } from './supabase';

// Business Settings
export interface BusinessSettings {
  id: number;
  business_name: string;
  business_name_es?: string;
  tagline?: string;
  tagline_es?: string;
  logo_url?: string;
  address_street: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  phone: string;
  email: string;
  minimum_lead_time_hours: number;
  maximum_advance_days: number;
  service_area_type: 'radius' | 'zipcodes';
  service_radius_miles?: number;
  service_zipcodes?: string[];
  about_us_content?: string;
  about_us_content_es?: string;
  max_daily_capacity?: number;
  session_timeout_minutes?: number;
  auto_confirm_enabled?: boolean;
  auto_confirm_prep_minutes?: number;
}

export interface BusinessHours {
  id: number;
  day_of_week: number; // 0 = Sunday, 6 = Saturday
  is_open: boolean;
  open_time?: string;
  close_time?: string;
  is_closed: boolean;
}

export interface HolidayClosure {
  id: number;
  name: string;
  closure_date: string;
  is_recurring: boolean;
}

export interface SocialMediaLink {
  id: number;
  platform: string;
  url: string;
  is_active: boolean;
  display_order: number;
}

export interface FAQ {
  id: number;
  question_en: string;
  question_es: string;
  answer_en: string;
  answer_es: string;
  display_order: number;
  is_active: boolean;
}

export interface ContentPage {
  id: number;
  page_slug: string;
  title_en: string;
  title_es: string;
  content_en?: string;
  content_es?: string;
  meta_title_en?: string;
  meta_title_es?: string;
  meta_description_en?: string;
  meta_description_es?: string;
}

export interface HomepageContent {
  id: number;
  section: string;
  title_en?: string;
  title_es?: string;
  subtitle_en?: string;
  subtitle_es?: string;
  content_en?: string;
  content_es?: string;
  image_url?: string;
  button_text_en?: string;
  button_text_es?: string;
  button_link?: string;
  display_order: number;
  is_active: boolean;
}

export interface GalleryItem {
  id: number;
  image_url: string;
  thumbnail_url?: string;
  category: string;
  category_en?: string;
  category_es?: string;
  caption_en?: string;
  caption_es?: string;
  description_en?: string;
  description_es?: string;
  display_order: number;
  is_active: boolean;
}

export interface Announcement {
  id: number;
  title_en: string;
  title_es: string;
  message_en: string;
  message_es: string;
  type: 'info' | 'warning' | 'success' | 'holiday';
  is_active: boolean;
  is_dismissible: boolean;
  start_date?: string;
  end_date?: string;
  display_order: number;
}

export interface SEOConfig {
  id: number;
  page_path: string;
  meta_title_en?: string;
  meta_title_es?: string;
  meta_description_en?: string;
  meta_description_es?: string;
  og_title_en?: string;
  og_title_es?: string;
  og_description_en?: string;
  og_description_es?: string;
  og_image_url?: string;
  structured_data?: Record<string, any>;
}

export interface FooterConfig {
  id: number;
  business_info_en?: string;
  business_info_es?: string;
  quick_links?: Array<{ label_en: string; label_es: string; url: string }>;
  show_newsletter: boolean;
  newsletter_text_en?: string;
  newsletter_text_es?: string;
  copyright_text_en?: string;
  copyright_text_es?: string;
}

/**
 * Fetch business settings
 */
export async function getBusinessSettings(): Promise<BusinessSettings | null> {
  if (!supabase) {
    console.warn('Supabase not configured, returning null for business settings');
    return null;
  }

  try {
    const { data, error } = await supabase
      .from('business_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) {
      // Table might not exist yet, return null gracefully
      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.warn('Business settings table does not exist yet. Run the CMS migration.');
        return null;
      }
      console.error('Error fetching business settings:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Exception fetching business settings:', error);
    return null;
  }
}

/**
 * Update business settings (owner only)
 */
export async function updateBusinessSettings(
  updates: Partial<BusinessSettings>
): Promise<BusinessSettings | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('business_settings')
    .update(updates)
    .eq('id', 1)
    .select()
    .single();

  if (error) {
    console.error('Error updating business settings:', error);
    return null;
  }

  return data;
}

/**
 * Fetch business hours
 */
export async function getBusinessHours(): Promise<BusinessHours[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('business_hours')
    .select('*')
    .order('day_of_week', { ascending: true });

  if (error) {
    console.error('Error fetching business hours:', error);
    return [];
  }

  return data || [];
}

/**
 * Update business hours (owner only)
 */
export async function updateBusinessHours(
  hours: BusinessHours[]
): Promise<BusinessHours[] | null> {
  if (!supabase) return null;

  // Delete all existing hours and insert new ones
  const { error: deleteError } = await supabase
    .from('business_hours')
    .delete()
    .neq('id', 0); // Delete all

  if (deleteError) {
    console.error('Error deleting business hours:', deleteError);
    return null;
  }

  const { data, error } = await supabase
    .from('business_hours')
    .insert(hours)
    .select();

  if (error) {
    console.error('Error inserting business hours:', error);
    return null;
  }

  return data;
}

/**
 * Fetch holiday closures
 */
export async function getHolidayClosures(): Promise<HolidayClosure[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('holiday_closures')
    .select('*')
    .order('closure_date', { ascending: true });

  if (error) {
    console.error('Error fetching holiday closures:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch active announcements
 */
export async function getActiveAnnouncements(): Promise<Announcement[]> {
  if (!supabase) {
    console.warn('Supabase not configured, returning empty announcements');
    return [];
  }

  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('display_order', { ascending: true });

    if (error) {
      // Table might not exist yet, return empty array gracefully
      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.warn('Announcements table does not exist yet. Run the CMS migration.');
        return [];
      }
      console.error('Error fetching announcements:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching announcements:', error);
    return [];
  }
}

/**
 * Fetch all FAQs
 */
export async function getFAQs(): Promise<FAQ[]> {
  if (!supabase) {
    console.warn('Supabase not configured, returning empty FAQs');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('faqs')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      // Table might not exist yet, return empty array gracefully
      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.warn('FAQs table does not exist yet. Run the CMS migration.');
        return [];
      }
      console.error('Error fetching FAQs:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Exception fetching FAQs:', error);
    return [];
  }
}

/**
 * Fetch content page by slug
 */
export async function getContentPage(slug: string): Promise<ContentPage | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('content_pages')
    .select('*')
    .eq('page_slug', slug)
    .single();

  if (error) {
    console.error('Error fetching content page:', error);
    return null;
  }

  return data;
}

/**
 * Fetch homepage content
 */
export async function getHomepageContent(): Promise<HomepageContent[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('homepage_content')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching homepage content:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch gallery items
 */
export async function getGalleryItems(category?: string): Promise<GalleryItem[]> {
  if (!supabase) return [];

  let query = supabase
    .from('gallery_items')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching gallery items:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch SEO config for a page
 */
export async function getSEOConfig(pagePath: string): Promise<SEOConfig | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('seo_config')
    .select('*')
    .eq('page_path', pagePath)
    .single();

  if (error) {
    // Not an error if no config exists
    if (error.code === 'PGRST116') return null;
    console.error('Error fetching SEO config:', error);
    return null;
  }

  return data;
}

/**
 * Fetch footer configuration
 */
export async function getFooterConfig(): Promise<FooterConfig | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('footer_config')
    .select('*')
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching footer config:', error);
    return null;
  }

  return data;
}

/**
 * Fetch social media links
 */
export async function getSocialMediaLinks(): Promise<SocialMediaLink[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('social_media_links')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching social media links:', error);
    return [];
  }

  return data || [];
}

// Admin functions (owner only)
export async function createFAQ(faq: Omit<FAQ, 'id'>): Promise<FAQ | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('faqs')
    .insert(faq)
    .select()
    .single();

  if (error) {
    console.error('Error creating FAQ:', error);
    return null;
  }

  return data;
}

export async function updateFAQ(id: number, updates: Partial<FAQ>): Promise<FAQ | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('faqs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating FAQ:', error);
    return null;
  }

  return data;
}

export async function deleteFAQ(id: number): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('faqs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting FAQ:', error);
    return false;
  }

  return true;
}

export async function createGalleryItem(
  item: Omit<GalleryItem, 'id'>
): Promise<GalleryItem | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('gallery_items')
    .insert(item)
    .select()
    .single();

  if (error) {
    console.error('Error creating gallery item:', error);
    return null;
  }

  return data;
}

export async function updateGalleryItem(
  id: number,
  updates: Partial<GalleryItem>
): Promise<GalleryItem | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('gallery_items')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating gallery item:', error);
    return null;
  }

  return data;
}

export async function deleteGalleryItem(id: number): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('gallery_items')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting gallery item:', error);
    return false;
  }

  return true;
}

export async function createAnnouncement(
  announcement: Omit<Announcement, 'id'>
): Promise<Announcement | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('announcements')
    .insert(announcement)
    .select()
    .single();

  if (error) {
    console.error('Error creating announcement:', error);
    return null;
  }

  return data;
}

export async function updateAnnouncement(
  id: number,
  updates: Partial<Announcement>
): Promise<Announcement | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('announcements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating announcement:', error);
    return null;
  }

  return data;
}

export async function deleteAnnouncement(id: number): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting announcement:', error);
    return false;
  }

  return true;
}
