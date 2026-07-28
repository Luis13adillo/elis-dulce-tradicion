// review-resolve — staff resolution of held photo reviews.
//
// Mirrors order-cancel's architecture: authenticate the staff JWT, check the
// owner/baker role, run the transactional DB work through a service_role-only
// RPC (resolve_image_review), then own the side effects here: cancel any
// stale-amount PaymentIntent at Stripe and email the customer.
//
// Actions: approve (as-is or with revised details + full final price),
// decline, expire, reopen. Server-side enforcement of the locked rule that
// staff must confirm they contacted the customer before changing details,
// date, or price. The "payment link" is the existing site checkout
// (/payment-checkout?pendingId=…) — no second Stripe payment path.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import { buildEmailHtml, formatDate } from "../_shared/emailTemplates.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ResolveRequest {
    pending_order_id: string;
    action: "approve" | "decline" | "expire" | "reopen";
    updates?: Record<string, unknown>;
    final_total?: number;
    notes?: string;
    contacted_customer?: boolean;
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY || !STRIPE_SECRET_KEY) {
        return json({ error: "Server misconfiguration" }, 500);
    }

    let body: ResolveRequest;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
    const { pending_order_id, action, updates, final_total, notes, contacted_customer } = body;
    if (!pending_order_id || typeof pending_order_id !== "string") {
        return json({ error: "pending_order_id required" }, 400);
    }
    if (!["approve", "decline", "expire", "reopen"].includes(action)) {
        return json({ error: "invalid action" }, 400);
    }

    // ---------- auth: logged-in staff only ----------
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").replace("bearer ", "");
    if (!token) return json({ error: "Authorization header required" }, 401);

    const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userResp, error: authErr } = await supabaseAnon.auth.getUser(token);
    if (authErr || !userResp?.user) return json({ error: "Invalid auth token" }, 401);
    const staffId = userResp.user.id;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", staffId)
        .maybeSingle();
    if (profile?.role !== "owner" && profile?.role !== "baker") {
        return json({ error: "Forbidden: staff role required" }, 403);
    }

    // ---------- locked rule: contact before changing anything ----------
    const hasChanges = (updates && Object.keys(updates).length > 0) || final_total !== undefined;
    if (action === "approve" && hasChanges && contacted_customer !== true) {
        return json({
            error: "Confirm you contacted the customer before changing details, date, or price.",
            code: "contact_confirmation_required",
        }, 400);
    }
    if (action === "decline" && (!notes || !String(notes).trim())) {
        return json({ error: "A reason is required to decline.", code: "reason_required" }, 400);
    }

    // ---------- transactional resolution ----------
    const { data: result, error: rpcErr } = await supabase.rpc("resolve_image_review", {
        p_pending_id: pending_order_id,
        p_action: action,
        p_staff_id: staffId,
        p_updates: updates ?? null,
        p_final_total: final_total ?? null,
        p_notes: notes ?? null,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 500);
    if (!result?.success) {
        return json({ error: result?.error ?? "resolution failed", details: result }, 409);
    }

    // ---------- side effects (best-effort; resolution already committed) ----
    // A revised price invalidated the old PaymentIntent — cancel it at Stripe
    // so it can never be confirmed. create-payment-intent also refuses
    // amount-mismatched reuse, so this is defense in depth, not load-bearing.
    if (result.old_payment_intent_id) {
        try {
            const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
            await stripe.paymentIntents.cancel(String(result.old_payment_intent_id));
        } catch (cancelErr) {
            console.warn("stale PI cancel failed (gate still blocks reuse):", cancelErr);
        }
    }

    try {
        if (result.action === "approve") await sendPaymentLinkEmail(result);
        if (result.action === "decline") await sendDeclineEmail(result, notes ?? "");
    } catch (emailErr) {
        console.error("review-resolve email failed:", emailErr);
        return json({ ...result, email_sent: false });
    }

    return json({ ...result, email_sent: result.action === "approve" || result.action === "decline" });
});

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

function resendClient(): { resend: Resend; from: string; frontendUrl: string } | null {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
        console.error("RESEND_API_KEY not set — skipping customer email");
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

// deno-lint-ignore no-explicit-any
async function sendPaymentLinkEmail(result: any): Promise<void> {
    const ctx = resendClient();
    if (!ctx) return;
    const lang = String(result.customer_language ?? "en").toLowerCase();
    const isSpanish = lang === "es" || lang === "spanish";
    const payUrl = `${ctx.frontendUrl}/payment-checkout?pendingId=${encodeURIComponent(result.pending_order_id)}`;
    const total = Number(result.total_amount).toFixed(2);
    const linkHours = Number(result.payment_link_hours) || 48;
    const dateStr = formatDate(String(result.date_needed), isSpanish ? "es" : "en");
    const priceChanged = Boolean(result.price_changed);

    const bodyContent = isSpanish
        ? `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hola ${escapeHtml(result.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        ¡Buenas noticias! Tu pedido <strong>${escapeHtml(result.order_number)}</strong> para el
        ${escapeHtml(dateStr)} está confirmado por nuestros reposteros.
      </p>
      ${priceChanged ? `<p style="margin:0 0 16px;font-size:15px;color:#333;">Como conversamos, el precio final de tu pastel es <strong>$${total}</strong>.</p>` : ""}
      <p style="margin:0 0 8px;font-size:15px;color:#333;">
        Para reservar tu fecha, completa el pago de <strong>$${total}</strong>:
      </p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${payUrl}" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Completar pago seguro</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#888;">
        Este enlace es válido por ${linkHours} horas. El pago completo confirma tu pedido.
      </p>
      <p style="margin:0;font-size:14px;color:#666;">¿Preguntas? Llámanos al (610) 279-6200.</p>`
        : `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hi ${escapeHtml(result.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Good news! Your order <strong>${escapeHtml(result.order_number)}</strong> for
        ${escapeHtml(dateStr)} has been confirmed by our bakers.
      </p>
      ${priceChanged ? `<p style="margin:0 0 16px;font-size:15px;color:#333;">As discussed, the final price for your cake is <strong>$${total}</strong>.</p>` : ""}
      <p style="margin:0 0 8px;font-size:15px;color:#333;">
        To reserve your date, complete your payment of <strong>$${total}</strong>:
      </p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${payUrl}" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Complete secure payment</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#888;">
        This link is valid for ${linkHours} hours. Full payment confirms your order.
      </p>
      <p style="margin:0;font-size:14px;color:#666;">Questions? Call us at (610) 279-6200.</p>`;

    await ctx.resend.emails.send({
        from: ctx.from,
        to: result.customer_email,
        subject: isSpanish
            ? `Tu pedido está confirmado — completa tu pago (${result.order_number})`
            : `Your order is confirmed — complete your payment (${result.order_number})`,
        html: buildEmailHtml({
            titleEmoji: "✅",
            title: isSpanish ? "¡Diseño aprobado!" : "Design approved!",
            titleBandStyle: "success",
            bodyContent,
            frontendUrl: ctx.frontendUrl,
        }),
    });
}

// deno-lint-ignore no-explicit-any
async function sendDeclineEmail(result: any, reason: string): Promise<void> {
    const ctx = resendClient();
    if (!ctx) return;
    const lang = String(result.customer_language ?? "en").toLowerCase();
    const isSpanish = lang === "es" || lang === "spanish";

    const bodyContent = isSpanish
        ? `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hola ${escapeHtml(result.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Lamentablemente no podremos realizar el pedido <strong>${escapeHtml(result.order_number)}</strong>
        tal como fue solicitado. <strong>No se realizó ningún cargo a tu tarjeta.</strong>
      </p>
      ${reason ? `<p style="margin:0 0 16px;font-size:14px;color:#666;">${escapeHtml(reason)}</p>` : ""}
      <p style="margin:0;font-size:14px;color:#666;">
        Nos encantaría ayudarte con un diseño alternativo — llámanos al (610) 279-6200.
      </p>`
        : `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hi ${escapeHtml(result.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Unfortunately we won't be able to make order <strong>${escapeHtml(result.order_number)}</strong>
        as requested. <strong>Your card was not charged.</strong>
      </p>
      ${reason ? `<p style="margin:0 0 16px;font-size:14px;color:#666;">${escapeHtml(reason)}</p>` : ""}
      <p style="margin:0;font-size:14px;color:#666;">
        We'd love to help with an alternative design — call us at (610) 279-6200.
      </p>`;

    await ctx.resend.emails.send({
        from: ctx.from,
        to: result.customer_email,
        subject: isSpanish
            ? `Sobre tu pedido ${result.order_number} — Eli's Bakery`
            : `About your order ${result.order_number} — Eli's Bakery`,
        html: buildEmailHtml({
            titleEmoji: "🎂",
            title: isSpanish ? "Sobre tu pedido" : "About your order",
            titleBandStyle: "gold",
            bodyContent,
            frontendUrl: ctx.frontendUrl,
        }),
    });
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
