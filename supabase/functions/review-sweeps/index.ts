// review-sweeps — hourly maintenance for the photo-review workflow.
//
// Invoked by pg_cron via net.http_post with the x-cron-secret header
// (see migration 20260728T170000_review_sweeps_cron.sql). Two sweeps:
//
//  A. Payment-link reminder: 'approved' rows still unpaid ~review_reminder_hours
//     after the link was sent get exactly ONE reminder email (guarded by
//     payment_reminder_sent_at, claimed row-by-row so concurrent sweeps can't
//     double-send).
//
//  B. Stuck reviews: rows whose review started (image_review_status='pending')
//     but never got a verdict (crashed function, dropped connection). In
//     enforce mode they become needs_review + staff email (fail-closed). In
//     off/shadow they resolve to passed/ANALYSIS_FAILED so the customer's
//     holding-page re-check releases them to checkout.
//
// The 7-day hold expiry itself is handled by prune_expired_pending_orders
// (status → expired, image_review_status → review_expired) — not here.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import { buildEmailHtml, formatDate } from "../_shared/emailTemplates.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STUCK_REVIEW_MINUTES = 15;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
        return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server misconfiguration" }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: settings } = await supabase
        .from("business_settings")
        .select("image_review_mode, review_reminder_hours")
        .limit(1)
        .maybeSingle();
    const mode: string = settings?.image_review_mode ?? "off";
    const reminderHours: number = Number(settings?.review_reminder_hours) || 24;

    const results = {
        mode,
        reminders_sent: 0,
        stuck_resolved: 0,
        errors: [] as string[],
    };

    // ---------------- Sweep A: one payment-link reminder --------------------
    const reminderCutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000).toISOString();
    const { data: dueReminders, error: remErr } = await supabase
        .from("pending_orders")
        .select("id, order_number, customer_name, customer_email, customer_language, date_needed, total_amount, expires_at, payment_link_sent_at")
        .eq("image_review_status", "approved")
        .eq("status", "awaiting_payment")
        .gt("expires_at", new Date().toISOString())
        .lt("payment_link_sent_at", reminderCutoff)
        .is("payment_reminder_sent_at", null)
        .limit(25);
    if (remErr) results.errors.push(`reminder query: ${remErr.message}`);

    for (const row of dueReminders ?? []) {
        // Claim the row first — the conditional update means a concurrent
        // sweep run can't send the same reminder twice.
        const { data: claimed } = await supabase
            .from("pending_orders")
            .update({ payment_reminder_sent_at: new Date().toISOString() })
            .eq("id", row.id)
            .is("payment_reminder_sent_at", null)
            .select("id")
            .maybeSingle();
        if (!claimed) continue;
        try {
            await sendReminderEmail(row);
            results.reminders_sent += 1;
        } catch (e) {
            results.errors.push(`reminder ${row.order_number}: ${(e as Error).message}`);
        }
    }

    // ---------------- Sweep B: stuck reviews ---------------------------------
    const stuckCutoff = new Date(Date.now() - STUCK_REVIEW_MINUTES * 60 * 1000).toISOString();
    const { data: stuck, error: stuckErr } = await supabase
        .from("pending_orders")
        .select("id, order_number, customer_name, customer_email, customer_phone, customer_language, date_needed, time_needed, cake_size, theme, total_amount")
        .eq("image_review_status", "pending")
        .eq("status", "awaiting_payment")
        .is("image_reviewed_at", null)
        .lt("updated_at", stuckCutoff)
        .limit(25);
    if (stuckErr) results.errors.push(`stuck query: ${stuckErr.message}`);

    for (const row of stuck ?? []) {
        const nowIso = new Date().toISOString();
        const failVerdict = {
            verdict: "ANALYSIS_FAILED",
            error: "review never completed (swept)",
            mode,
            reviewed_at: nowIso,
        };
        if (mode === "enforce") {
            const { data: claimed } = await supabase
                .from("pending_orders")
                .update({
                    image_review_status: "needs_review",
                    image_reviewed_at: nowIso,
                    image_review_result: failVerdict,
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                })
                .eq("id", row.id)
                .is("image_reviewed_at", null)
                .select("id")
                .maybeSingle();
            if (claimed) {
                results.stuck_resolved += 1;
                try {
                    await sendStuckStaffAlert(row);
                } catch (e) {
                    results.errors.push(`stuck alert ${row.order_number}: ${(e as Error).message}`);
                }
            }
        } else {
            // off/shadow: never hold a customer — release to checkout.
            const { data: claimed } = await supabase
                .from("pending_orders")
                .update({
                    image_review_status: "passed",
                    image_reviewed_at: nowIso,
                    image_review_result: { ...failVerdict, shadow: mode === "shadow", would_hold: true },
                })
                .eq("id", row.id)
                .is("image_reviewed_at", null)
                .select("id")
                .maybeSingle();
            if (claimed) results.stuck_resolved += 1;
        }
    }

    return json({ success: true, ...results });
});

// deno-lint-ignore no-explicit-any
async function sendReminderEmail(row: any): Promise<void> {
    const ctx = resendClient();
    if (!ctx) return;
    const lang = String(row.customer_language ?? "en").toLowerCase();
    const isSpanish = lang === "es" || lang === "spanish";
    const payUrl = `${ctx.frontendUrl}/payment-checkout?pendingId=${encodeURIComponent(row.id)}`;
    const total = Number(row.total_amount).toFixed(2);
    const dateStr = formatDate(String(row.date_needed), isSpanish ? "es" : "en");
    const expires = new Date(row.expires_at);
    const hoursLeft = Math.max(1, Math.round((expires.getTime() - Date.now()) / (60 * 60 * 1000)));

    const bodyContent = isSpanish
        ? `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hola ${escapeHtml(row.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Un recordatorio amistoso: tu pedido <strong>${escapeHtml(row.order_number)}</strong> para el
        ${escapeHtml(dateStr)} está confirmado y esperando tu pago de <strong>$${total}</strong>.
      </p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${payUrl}" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Completar pago seguro</a>
      </p>
      <p style="margin:0;font-size:13px;color:#888;">
        El enlace expira en aproximadamente ${hoursLeft} horas. Si necesitas más tiempo, llámanos al (610) 279-6200.
      </p>`
        : `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hi ${escapeHtml(row.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        A friendly reminder: your order <strong>${escapeHtml(row.order_number)}</strong> for
        ${escapeHtml(dateStr)} is confirmed and waiting for your payment of <strong>$${total}</strong>.
      </p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${payUrl}" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Complete secure payment</a>
      </p>
      <p style="margin:0;font-size:13px;color:#888;">
        The link expires in about ${hoursLeft} hours. Need more time? Call us at (610) 279-6200.
      </p>`;

    await ctx.resend.emails.send({
        from: ctx.from,
        to: row.customer_email,
        subject: isSpanish
            ? `Recordatorio: completa tu pago — ${row.order_number}`
            : `Reminder: complete your payment — ${row.order_number}`,
        html: buildEmailHtml({
            titleEmoji: "⏰",
            title: isSpanish ? "Tu pastel te espera" : "Your cake is waiting",
            titleBandStyle: "gold",
            bodyContent,
            frontendUrl: ctx.frontendUrl,
        }),
    });
}

// deno-lint-ignore no-explicit-any
async function sendStuckStaffAlert(row: any): Promise<void> {
    const ctx = resendClient();
    if (!ctx) return;
    const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "owner@elisbakery.com";
    const bodyContent = `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        A photo review never completed (function crash or dropped connection) and was swept into the
        manual queue. <strong>No payment has been taken.</strong> Contact the customer and resolve it
        from the Front Desk photo-review queue.
      </p>
      <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Order</td><td><strong>${escapeHtml(row.order_number)}</strong></td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Customer</td><td>${escapeHtml(row.customer_name)} — ${escapeHtml(row.customer_phone ?? "")} — ${escapeHtml(row.customer_email)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Needed</td><td>${escapeHtml(String(row.date_needed))} @ ${escapeHtml(String(row.time_needed))}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Cake</td><td>${escapeHtml(row.cake_size ?? "")} — ${escapeHtml(row.theme ?? "")}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Total</td><td>$${Number(row.total_amount).toFixed(2)} (unpaid)</td></tr>
      </table>
      <p style="margin:24px 0 0;text-align:center;">
        <a href="${ctx.frontendUrl}/front-desk" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Open photo review queue</a>
      </p>`;

    await ctx.resend.emails.send({
        from: ctx.from,
        to: OWNER_EMAIL,
        subject: `🖼️ Photo review swept to manual queue — Order ${row.order_number} (unpaid)`,
        html: buildEmailHtml({
            titleEmoji: "🖼️",
            title: "Review needs manual attention",
            titleBandStyle: "alert",
            bodyContent,
            frontendUrl: ctx.frontendUrl,
        }),
    });
}

function resendClient(): { resend: Resend; from: string; frontendUrl: string } | null {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
        console.error("RESEND_API_KEY not set — skipping email");
        return null;
    }
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
    const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
    return {
        resend: new Resend(key),
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        frontendUrl: Deno.env.get("FRONTEND_URL") || "https://elisbakery.com",
    };
}

function escapeHtml(text: string | undefined | null): string {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}
