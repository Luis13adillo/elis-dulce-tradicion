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

interface ContactSubmission {
    id: number;
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
    attachment_url?: string;
    order_number?: string;
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

      const { submission } = await req.json() as { submission: ContactSubmission };

      if (!submission || !submission.email) {
              return new Response(
                        JSON.stringify({ error: "Submission data and email are required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                      );
      }

      const resend = new Resend(RESEND_API_KEY);

      // 1. Send notification to owner
      const ownerSubject = `New Contact Form Submission: ${submission.subject}`;
      const ownerBodyContent = `
        <div style="background:#faf8f4;border-radius:10px;padding:24px 28px;margin:0 0 20px;border-left:4px solid #C6A649;">
          <h2 style="color:#1A1A2E;font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:700;margin:0 0 14px;">Submission Details</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;width:40%;border-bottom:1px solid #f0ead8;">Name:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${submission.name}</td>
            </tr>
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Email:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${submission.email}</td>
            </tr>
            ${submission.phone ? `
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Phone:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${submission.phone}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Subject:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${submission.subject}</td>
            </tr>
            ${submission.order_number ? `
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Order Number:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${submission.order_number}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Submitted:</td>
              <td style="padding:7px 0;color:#1A1A2E;font-size:13px;border-bottom:1px solid #f0ead8;">${new Date(submission.created_at).toLocaleString()}</td>
            </tr>
          </table>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e8dcc8;">
            <p style="color:#777;font-size:13px;margin:0 0 8px;"><strong>Message:</strong></p>
            <div style="background:#fff;padding:12px 16px;border-left:3px solid #C6A649;border-radius:4px;font-size:14px;color:#333;line-height:1.6;">
              ${submission.message.replace(/\n/g, '<br>')}
            </div>
          </div>
          ${submission.attachment_url ? `
          <p style="margin:12px 0 0;font-size:13px;">
            <strong style="color:#777;">Attachment:</strong>
            <a href="${submission.attachment_url}" style="color:#C6A649;text-decoration:none;margin-left:6px;">View Attachment &rarr;</a>
          </p>` : ''}
        </div>

        <div style="text-align:center;margin:24px 0 0;">
          <a href="${FRONTEND_URL}/owner-dashboard" style="background:linear-gradient(135deg,#C6A649 0%,#d4af37 100%);color:#1A1A2E;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;">
            View in Dashboard &rarr;
          </a>
        </div>
      `;
      const ownerHtml = buildEmailHtml({
        titleEmoji: '📧',
        title: 'New Contact Form Submission',
        titleBandStyle: 'gold',
        bodyContent: ownerBodyContent,
        frontendUrl: FRONTEND_URL,
      });

      await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: ownerSubject,
        html: ownerHtml,
      });

      // 2. Send auto-reply to customer
      const customerSubject = `Thank you for contacting ${FROM_NAME}`;
      const customerBodyContent = `
        <p style="font-size:16px;color:#333;margin:0 0 8px;">Dear <strong>${submission.name}</strong>,</p>
        <p style="font-size:15px;color:#555;margin:0 0 24px;">
          Thank you for reaching out to us! We've received your message and will get back to you as soon as possible.
        </p>

        <div style="background:#faf8f4;border-radius:10px;padding:20px 24px;margin:0 0 20px;border-left:4px solid #C6A649;">
          <p style="color:#777;font-size:13px;margin:0 0 6px;"><strong>Your Subject:</strong></p>
          <p style="color:#1A1A2E;font-size:15px;font-weight:600;margin:0;">${submission.subject}</p>
        </div>

        <p style="font-size:14px;color:#888;text-align:center;margin:0;">
          We typically respond within 24 hours during business hours.
        </p>
      `;
      const customerHtml = buildEmailHtml({
        titleEmoji: '🎂',
        title: 'Thank You for Contacting Us!',
        titleBandStyle: 'gold',
        bodyContent: customerBodyContent,
        frontendUrl: FRONTEND_URL,
      });

      await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: submission.email,
        subject: customerSubject,
        html: customerHtml,
      });

      return new Response(
              JSON.stringify({ success: true, message: "Notifications sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
             } catch (error) {
                   console.error("Error in send-contact-notification:", error);
                   return new Response(
                           JSON.stringify({ error: error.message }),
                     { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                         );
             }
});
