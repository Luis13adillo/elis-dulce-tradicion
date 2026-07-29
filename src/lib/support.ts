/**
 * Customer Support API
 * Functions for contact form submissions, order issues, and support management
 */

import { supabase } from './supabase';
import { FunctionsHttpError, FunctionsRelayError, FunctionsFetchError } from '@supabase/supabase-js';

// Contact Submission Interfaces
export interface ContactSubmission {
  id: number;
  name: string;
  email: string;
  phone?: string;
  subject: 'General' | 'Order Issue' | 'Custom Request' | 'Feedback';
  message: string;
  attachment_url?: string;
  order_number?: string;
  status: 'new' | 'read' | 'responded' | 'resolved';
  ip_address?: string;
  user_agent?: string;
  is_spam: boolean;
  admin_notes?: string;
  responded_at?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderIssue {
  id: number;
  order_id: number;
  order_number: string;
  customer_id?: number;
  customer_name: string;
  customer_email: string;
  customer_phone?: string;
  issue_category: 'Wrong order' | 'Quality issue' | 'Late delivery' | 'Other';
  issue_description: string;
  photo_urls?: string[];
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  admin_response?: string;
  resolution_notes?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ResponseTemplate {
  id: number;
  name: string;
  category: 'contact' | 'order_issue' | 'general';
  subject_en: string;
  subject_es?: string;
  body_en: string;
  body_es?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FAQFeedback {
  id: number;
  faq_id: number;
  is_helpful: boolean;
  feedback_text?: string;
  ip_address?: string;
  created_at: string;
}

export interface SubmissionResult {
  success: boolean;
  id: number | null;
  deduped?: boolean;
  notification_sent?: boolean;
}

// Surface the Edge Function's JSON error body (validation details, 429, email
// mismatch) instead of supabase-js's generic "non-2xx status code" message.
async function invokeSubmissionFunction(
  functionName: string,
  body: Record<string, unknown>
): Promise<SubmissionResult> {
  if (!supabase) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    let status: number | undefined;
    let parsed: { error?: string } | null = null;
    if (error instanceof FunctionsHttpError) {
      status = error.context?.status;
      try {
        parsed = await error.context.json();
      } catch {
        /* body not JSON */
      }
    }
    if (status === 429 || parsed?.error === 'rate_limited') {
      throw new Error('rate_limited');
    }
    if (parsed?.error === 'order_not_found_or_email_mismatch') {
      throw new Error('order_not_found_or_email_mismatch');
    }
    if (parsed?.error === 'validation_failed') {
      throw new Error('validation_failed');
    }
    if (error instanceof FunctionsRelayError || error instanceof FunctionsFetchError) {
      throw new Error('network_error');
    }
    throw new Error(parsed?.error || error.message || 'submission_failed');
  }

  const result = data as SubmissionResult;
  if (!result?.success) {
    throw new Error('submission_failed');
  }
  return result;
}

// Contact Form Submission — goes through the submit-contact Edge Function.
// The browser has (deliberately) no write access to contact_submissions:
// the function validates, rate-limits by real IP, dedupes on client_token,
// inserts with the service role, and triggers the owner notification.
export async function submitContactForm(data: {
  name: string;
  email: string;
  phone?: string;
  subject: ContactSubmission['subject'];
  message: string;
  attachment_path?: string;
  order_number?: string;
  client_token: string; // idempotency token — reuse across retries of the same message
  honeypot?: string; // Spam protection
}): Promise<SubmissionResult> {
  return invokeSubmissionFunction('submit-contact', {
    name: data.name,
    email: data.email,
    phone: data.phone,
    subject: data.subject,
    message: data.message,
    attachment_path: data.attachment_path,
    order_number: data.order_number,
    client_token: data.client_token,
    honeypot: data.honeypot,
  });
}

// Submit Order Issue — goes through the submit-order-issue Edge Function.
// Authorization happens server-side: the order number AND the email the
// order was placed with must match. Customer identity fields on the stored
// issue come from the order row, never from the browser.
export async function submitOrderIssue(data: {
  order_number: string;
  email: string;
  issue_category: OrderIssue['issue_category'];
  issue_description: string;
  photo_paths?: string[];
  client_token: string; // idempotency token — reuse across retries of the same report
  honeypot?: string;
}): Promise<SubmissionResult> {
  return invokeSubmissionFunction('submit-order-issue', {
    order_number: data.order_number,
    email: data.email,
    issue_category: data.issue_category,
    issue_description: data.issue_description,
    photo_paths: data.photo_paths,
    client_token: data.client_token,
    honeypot: data.honeypot,
  });
}

// Admin Functions - Get Contact Submissions
export async function getContactSubmissions(filters?: {
  status?: ContactSubmission['status'];
  limit?: number;
}): Promise<ContactSubmission[]> {
  try {
    if (!supabase) {
      console.warn('Supabase client not configured');
      return [];
    }

    let query = supabase
      .from('contact_submissions')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching contact submissions:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getContactSubmissions:', error);
    return [];
  }
}

// Admin Functions - Get Order Issues
export async function getOrderIssues(filters?: {
  status?: OrderIssue['status'];
  limit?: number;
}): Promise<OrderIssue[]> {
  try {
    if (!supabase) {
      console.warn('Supabase client not configured');
      return [];
    }

    let query = supabase
      .from('order_issues')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching order issues:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getOrderIssues:', error);
    return [];
  }
}

// Admin Functions - Update Contact Submission Status
export async function updateContactSubmissionStatus(
  id: number,
  status: ContactSubmission['status'],
  admin_notes?: string
): Promise<boolean> {
  try {
    if (!supabase) return false;

    const updateData: Record<string, unknown> = { status };
    if (status === 'responded') {
      updateData.responded_at = new Date().toISOString();
    }
    if (status === 'resolved') {
      updateData.resolved_at = new Date().toISOString();
    }
    if (admin_notes) {
      updateData.admin_notes = admin_notes;
    }

    const { error } = await supabase
      .from('contact_submissions')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating contact submission:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateContactSubmissionStatus:', error);
    return false;
  }
}

// Admin Functions - Update Order Issue Status
export async function updateOrderIssueStatus(
  id: number,
  status: OrderIssue['status'],
  admin_response?: string,
  resolution_notes?: string
): Promise<boolean> {
  try {
    if (!supabase) return false;

    const updateData: Record<string, unknown> = { status };
    if (status === 'resolved' || status === 'closed') {
      updateData.resolved_at = new Date().toISOString();
    }
    if (admin_response) {
      updateData.admin_response = admin_response;
    }
    if (resolution_notes) {
      updateData.resolution_notes = resolution_notes;
    }

    const { error } = await supabase
      .from('order_issues')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Error updating order issue:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in updateOrderIssueStatus:', error);
    return false;
  }
}

// Response Templates
export async function getResponseTemplates(category?: string): Promise<ResponseTemplate[]> {
  try {
    if (!supabase) {
      console.warn('Supabase client not configured');
      return [];
    }

    let query = supabase
      .from('response_templates')
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching response templates:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error in getResponseTemplates:', error);
    return [];
  }
}

// FAQ Feedback
export async function submitFAQFeedback(
  faq_id: number,
  is_helpful: boolean,
  feedback_text?: string
): Promise<boolean> {
  try {
    if (!supabase) return false;

    const ipAddress = await getClientIP();

    const { error } = await supabase
      .from('faq_feedback')
      .insert({
        faq_id,
        is_helpful,
        feedback_text,
        ip_address: ipAddress,
      });

    if (error) {
      console.error('Error submitting FAQ feedback:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in submitFAQFeedback:', error);
    return false;
  }
}

