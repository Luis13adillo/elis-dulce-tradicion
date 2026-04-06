import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
};

// XSS protection: escape HTML special characters
function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

interface FailedPaymentData {
  amount: number;
  customer_name: string;
  customer_email: string;
  error_message: string;
  idempotency_key?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }

    const { payment } = await req.json() as { payment: FailedPaymentData };

    if (!payment) {
      return new Response(
        JSON.stringify({ error: "Payment data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resend = new Resend(RESEND_API_KEY);

    const formattedAmount = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(payment.amount);

    const timestamp = new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const ownerSubject = `Payment Failed: ${formattedAmount} - ${escapeHtml(payment.customer_name)}`;
    const ownerBodyContent = `
      <div style="background:#fdecea;padding:14px 18px;border-left:4px solid #b03030;margin:0 0 20px;border-radius:6px;">
        <p style="margin:0;color:#7b1a1a;font-size:14px;font-weight:600;">A payment attempt has failed and requires your attention.</p>
      </div>

      <div style="background:#faf8f4;border-radius:10px;padding:24px 28px;margin:0 0 20px;border-left:4px solid #b03030;">
        <h2 style="color:#7b1a1a;font-family:'Playfair Display',Georgia,serif;font-size:16px;font-weight:700;margin:0 0 14px;">Payment Details</h2>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="padding:7px 0;color:#777;font-size:13px;width:44%;border-bottom:1px solid #f0ead8;">Amount:</td>
            <td style="padding:7px 0;color:#1A1A2E;font-size:15px;font-weight:700;border-bottom:1px solid #f0ead8;">${formattedAmount}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Customer:</td>
            <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(payment.customer_name)}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">Email:</td>
            <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;border-bottom:1px solid #f0ead8;">${escapeHtml(payment.customer_email)}</td>
          </tr>
          <tr>
            <td style="padding:7px 0;color:#777;font-size:13px;${payment.idempotency_key ? 'border-bottom:1px solid #f0ead8;' : ''}">Time:</td>
            <td style="padding:7px 0;color:#1A1A2E;font-size:13px;font-weight:600;${payment.idempotency_key ? 'border-bottom:1px solid #f0ead8;' : ''}">${timestamp}</td>
          </tr>
          ${payment.idempotency_key ? `
          <tr>
            <td style="padding:7px 0;color:#777;font-size:13px;">Reference ID:</td>
            <td style="padding:7px 0;font-size:12px;"><code style="background:#e8dcc8;padding:3px 8px;border-radius:4px;color:#1A1A2E;">${escapeHtml(payment.idempotency_key)}</code></td>
          </tr>` : ''}
        </table>
      </div>

      <div style="background:#faf8f4;border-radius:10px;padding:20px 24px;margin:0 0 24px;border-left:4px solid #ffc107;">
        <p style="color:#777;font-size:13px;margin:0 0 8px;font-weight:700;">Error Message</p>
        <div style="background:#fff;padding:12px 14px;border-radius:4px;border:1px solid #e8dcc8;">
          <code style="font-size:12px;color:#7b1a1a;word-break:break-all;line-height:1.6;">${escapeHtml(payment.error_message)}</code>
        </div>
      </div>

      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${FRONTEND_URL}/owner-dashboard" style="background:linear-gradient(135deg,#b03030 0%,#c0392b 100%);color:#fff;padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;letter-spacing:0.5px;">
          View Dashboard &rarr;
        </a>
      </div>
      <p style="font-size:12px;color:#aaa;text-align:center;margin:12px 0 0;">
        This payment has been logged to the failed_payments table for review.
      </p>
    `;
    const ownerHtml = buildEmailHtml({
      titleEmoji: '⚠️',
      title: 'Payment Failed',
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

    return new Response(
      JSON.stringify({ success: true, message: "Failed payment notification sent" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-failed-payment-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
