import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import { buildEmailHtml } from "../_shared/emailTemplates.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "owner@elisbakery.com";

// CORS headers for browser requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// XSS protection: escape HTML special characters in user input
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

interface OrderIssue {
    id: number;
    order_id: number;
    order_number: string;
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    issue_category: string;
    issue_description: string;
    photo_urls?: string[];
    priority: string;
    created_at: string;
}

Deno.serve(async (req) => {
    // Handle CORS preflight request
             if (req.method === 'OPTIONS') {
                   return new Response('ok', { headers: corsHeaders })
             }

             try {
                   if (!RESEND_API_KEY) {
                           throw new Error("RESEND_API_KEY is not set");
                   }

      const { issue } = await req.json() as { issue: OrderIssue };

      if (!issue || !issue.customer_email) {
              return new Response(
                        JSON.stringify({ error: "Issue data and customer email are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                      );
      }

      const resend = new Resend(RESEND_API_KEY);

      // Priority badge color
      const priorityColors: Record<string, string> = {
              low: '#28a745',
              medium: '#ffc107',
              high: '#fd7e14',
              urgent: '#dc3545',
      };

      // 1. Send notification to owner
      const ownerSubject = `🚨 Order Issue Reported: ${issue.order_number} - ${issue.issue_category}`;
      const ownerBodyContent = `
        <div style="background:#fff3cd;padding:14px 18px;border-left:4px solid #ffc107;margin:0 0 20px;border-radius:6px;">
          <p style="margin:0;font-size:14px;"><strong>Priority:</strong>
            <span style="background:${priorityColors[issue.priority] || '#6c757d'};color:#fff;padding:3px 10px;border-radius:12px;font-size:11px;text-transform:uppercase;margin-left:6px;">${escapeHtml(issue.priority)}</span>
          </p>
        </div>

        <div style="background:#faf8f4;border-radius:10px;padding:24px 28px;margin:0 0 20px;border-left:4px solid #b03030;">
          <h2 style="color:#7b1a1a;font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:700;margin:0 0 14px;">Issue Details</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;width:44%;border-bottom:1px solid #f0ead8;">Order Number:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:700;border-bottom:1px solid #f0ead8;">${escapeHtml(issue.order_number)}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Customer:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(issue.customer_name)}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Email:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(issue.customer_email)}</td>
            </tr>
            ${issue.customer_phone ? `
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Phone:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(issue.customer_phone)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Category:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(issue.issue_category)}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;">Reported:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;">${new Date(issue.created_at).toLocaleString()}</td>
            </tr>
          </table>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e8dcc8;">
            <p style="color:#777;font-size:13px;margin:0 0 8px;"><strong>Description:</strong></p>
            <div style="background:#fff;padding:12px 16px;border-left:3px solid #b03030;border-radius:4px;font-size:14px;color:#333;line-height:1.6;">
              ${escapeHtml(issue.issue_description).replace(/\n/g, '<br>')}
            </div>
          </div>
          ${issue.photo_urls && issue.photo_urls.length > 0 ? `
          <div style="margin-top:14px;">
            <p style="color:#777;font-size:13px;margin:0 0 8px;"><strong>Photos:</strong></p>
            <div>${issue.photo_urls.map(url => `<a href="${url}" style="display:inline-block;margin:4px;"><img src="${url}" width="90" height="90" style="border-radius:6px;border:1px solid #e8dcc8;object-fit:cover;" /></a>`).join('')}</div>
          </div>` : ''}
        </div>

        <div style="text-align:center;margin:24px 0 0;">
          <a href="${FRONTEND_URL}/owner-dashboard" style="background:linear-gradient(135deg,#b03030 0%,#c0392b 100%);color:#fff;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;">
            View in Dashboard &rarr;
          </a>
        </div>
      `;

      const ownerHtml = buildEmailHtml({
        titleEmoji: '🚨',
        title: 'Order Issue Reported',
        titleBandStyle: 'alert',
        bodyContent: ownerBodyContent,
        frontendUrl: FRONTEND_URL,
      });

      await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: ownerSubject,
        html: ownerHtml,
      });

      // 2. Send confirmation to customer
      const customerSubject = `We've received your issue report - Order ${issue.order_number}`;
      const customerBodyContent = `
        <p style="font-size:16px;color:#333;margin:0 0 8px;">Dear <strong>${escapeHtml(issue.customer_name)}</strong>,</p>
        <p style="font-size:15px;color:#555;margin:0 0 24px;">
          We've received your issue report regarding order <strong>#${escapeHtml(issue.order_number)}</strong>.
          We take all customer concerns seriously and will investigate this matter promptly.
        </p>

        <div style="background:#faf8f4;border-radius:10px;padding:24px 28px;margin:0 0 24px;border-left:4px solid #C6A649;">
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;width:44%;border-bottom:1px solid #f0ead8;">Issue Category:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(issue.issue_category)}</td>
            </tr>
            <tr>
              <td colspan="2" style="padding:10px 0 0;">
                <p style="color:#777;font-size:13px;margin:0 0 8px;"><strong>Your Description:</strong></p>
                <p style="color:#333;font-size:14px;margin:0;line-height:1.6;">${escapeHtml(issue.issue_description)}</p>
              </td>
            </tr>
          </table>
        </div>

        <p style="font-size:14px;color:#888;margin:0 0 24px;">
          Our team will review your report and contact you within 24 hours to discuss the next steps and resolution.
        </p>

        <div style="text-align:center;margin:0;">
          <a href="${FRONTEND_URL}/order-tracking?orderNumber=${encodeURIComponent(issue.order_number)}" style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);color:#1A1A2E;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;">
            Track Your Order &rarr;
          </a>
        </div>
      `;

      const customerHtml = buildEmailHtml({
        titleEmoji: '📋',
        title: 'Issue Report Received',
        titleBandStyle: 'gold',
        bodyContent: customerBodyContent,
        frontendUrl: FRONTEND_URL,
      });

      await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: issue.customer_email,
        subject: customerSubject,
        html: customerHtml,
      });

      return new Response(
              JSON.stringify({ success: true, message: "Notifications sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
             } catch (error) {
                   console.error("Error in send-order-issue-notification:", error);
                   return new Response(
                           JSON.stringify({ error: error.message }),
                     { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                         );
             }
});
