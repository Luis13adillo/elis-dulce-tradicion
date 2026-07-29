// resolve-delivery-quote — staff enters the final delivery fee for a
// "Delivery Quote Required" order.
//
// Mirrors review-resolve's architecture: authenticate the staff JWT (or a
// service-role caller), run the transactional DB work through the
// service_role-only resolve_delivery_quote RPC, then own the side effects
// here: cancel any stale-amount PaymentIntent at Stripe and email the
// customer their payment link for the updated total. The "payment link"
// is the existing site checkout (/payment-checkout?pendingId=…) — no
// second Stripe payment path.
//
// The handler lives here (not in index.ts) so unit tests can import it and
// exercise the real code with fetch mocked; index.ts only calls Deno.serve.
// Stripe uses its fetch-based HTTP client — the documented transport for
// edge runtimes — so every outbound call (Stripe + PostgREST) rides fetch.

import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import { buildEmailHtml, formatDate } from "../_shared/emailTemplates.ts";
import { requireStaffOrService, isDenied, corsHeaders } from "../_shared/authz.ts";

const cors = {
    ...corsHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
    });
}

export async function handler(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !STRIPE_SECRET_KEY) {
        return json({ error: "Server misconfiguration" }, 500);
    }

    const caller = await requireStaffOrService(req);
    if (isDenied(caller)) return caller;

    let body: { pending_order_id?: string; delivery_fee?: unknown; notes?: string; staff_id?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    const pendingId = body.pending_order_id;
    if (!pendingId || typeof pendingId !== "string") {
        return json({ error: "pending_order_id required" }, 400);
    }
    const fee = Number(body.delivery_fee);
    if (!Number.isFinite(fee) || fee < 0 || fee > 500) {
        return json({ error: "delivery_fee must be a number between 0 and 500" }, 400);
    }
    // Staff callers act as themselves; service callers (tests, automations)
    // must say which staff member the quote is attributed to.
    const staffId = caller.kind === "staff" ? caller.userId : body.staff_id;
    if (!staffId) return json({ error: "staff_id required for service callers" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: result, error: rpcErr } = await supabase.rpc("resolve_delivery_quote", {
        p_pending_id: pendingId,
        p_staff_id: staffId,
        p_fee: fee,
        p_notes: body.notes ?? null,
    });
    if (rpcErr) return json({ error: rpcErr.message }, 500);
    if (!result?.success) {
        return json({ error: result?.error ?? "quote failed", details: result }, 409);
    }

    // ---------- side effects (best-effort; quote already committed) ----------
    // A revised total invalidated the old PaymentIntent — cancel it at Stripe
    // so it can never be confirmed. create-payment-intent also refuses
    // amount-mismatched reuse, so this is defense in depth, not load-bearing.
    if (result.old_payment_intent_id) {
        try {
            const stripe = new Stripe(STRIPE_SECRET_KEY, {
                apiVersion: "2023-10-16",
                httpClient: Stripe.createFetchHttpClient(),
            });
            await stripe.paymentIntents.cancel(String(result.old_payment_intent_id));
        } catch (cancelErr) {
            console.warn("stale PI cancel failed (gate still blocks reuse):", cancelErr);
        }
    }

    try {
        await sendQuoteEmail(result);
        return json({ ...result, email_sent: true });
    } catch (emailErr) {
        console.error("quote email failed:", emailErr);
        return json({ ...result, email_sent: false });
    }
}

// ---------------------------------------------------------------------------
// Customer email: your delivery quote is ready — pay to confirm
// ---------------------------------------------------------------------------
// deno-lint-ignore no-explicit-any
async function sendQuoteEmail(result: any): Promise<void> {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
        console.warn("RESEND_API_KEY not set — skipping customer email");
        return;
    }
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
    const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";

    const lang = String(result.customer_language ?? "en").toLowerCase();
    const isSpanish = lang === "es" || lang === "spanish";
    const payUrl = `${frontendUrl}/payment-checkout?pendingId=${encodeURIComponent(result.pending_order_id)}`;
    const total = Number(result.total_amount).toFixed(2);
    const feeStr = Number(result.delivery_fee).toFixed(2);
    const linkHours = Number(result.payment_link_hours) || 48;
    const dateStr = formatDate(String(result.date_needed), isSpanish ? "es" : "en");

    const bodyContent = isSpanish
        ? `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hola ${escapeHtml(result.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Ya tenemos el costo de entrega para tu pedido <strong>${escapeHtml(result.order_number)}</strong>
        (${escapeHtml(dateStr)}) a ${escapeHtml(result.delivery_address)}:
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Tarifa de entrega: <strong>$${feeStr}</strong><br/>
        Total del pedido: <strong>$${total}</strong>
      </p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${payUrl}" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Completar pago seguro</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#888;">
        Este enlace es válido por ${linkHours} horas. El pago completo confirma tu pedido y tu entrega.
      </p>
      <p style="margin:0;font-size:14px;color:#666;">¿Preguntas? Llámanos al (610) 279-6200.</p>`
        : `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hi ${escapeHtml(result.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        We've confirmed the delivery cost for your order <strong>${escapeHtml(result.order_number)}</strong>
        (${escapeHtml(dateStr)}) to ${escapeHtml(result.delivery_address)}:
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Delivery fee: <strong>$${feeStr}</strong><br/>
        Order total: <strong>$${total}</strong>
      </p>
      <p style="margin:24px 0;text-align:center;">
        <a href="${payUrl}" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:16px;">Complete secure payment</a>
      </p>
      <p style="margin:0 0 16px;font-size:13px;color:#888;">
        This link is valid for ${linkHours} hours. Full payment confirms your order and delivery.
      </p>
      <p style="margin:0;font-size:14px;color:#666;">Questions? Call us at (610) 279-6200.</p>`;

    const resend = new Resend(key);
    await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: result.customer_email,
        subject: isSpanish
            ? `Tu costo de entrega está listo — completa tu pago (${result.order_number})`
            : `Your delivery quote is ready — complete your payment (${result.order_number})`,
        html: buildEmailHtml({
            titleEmoji: "🚗",
            title: isSpanish ? "¡Entrega confirmada!" : "Delivery confirmed!",
            titleBandStyle: "success",
            bodyContent,
            frontendUrl,
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
