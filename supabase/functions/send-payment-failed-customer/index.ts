// send-payment-failed-customer — bilingual email to the customer when
// their payment attempt fails (card declined, 3DS rejected, insufficient
// funds, etc.). Companion to send-failed-payment-notification, which only
// alerts the owner.
//
// The email contains a direct "Try again" link back to
// /payment-checkout?pendingId=X so they don't have to re-enter any cake
// details — the pending_order row is still alive for 24 hours from failure.
//
// Triggered by stripe-webhook on payment_intent.payment_failed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Resend } from "npm:resend@^4.0.0";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escapeHtml(t: string | undefined | null): string {
    if (!t) return "";
    return String(t)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}

// Brand tokens — match send-failed-payment-notification + send-order-confirmation
const BRAND = {
    charcoal: "#1A1A2E",
    charcoalDeep: "#0d0d1a",
    gold: "#C6A649",
    goldLight: "#d4af37",
    goldDark: "#b8902f",
    creamBorder: "#e8dcc8",
    white: "#ffffff",
};

type Lang = "en" | "es";

interface Copy {
    subject: string;
    title: string;
    heading: string;
    lead: string;
    orderLabel: string;
    amountLabel: string;
    reasonLabel: string;
    ctaNote: string;
    ctaButton: string;
    supportNote: string;
    signOff: string;
}

const COPY: Record<Lang, Copy> = {
    en: {
        subject: "Your payment couldn't be processed — please try again",
        title: "Payment Not Completed",
        heading: "We couldn't process your payment",
        lead:
            "Your cake order hasn't been placed yet — your card was declined by your bank. Your order details are saved and waiting for you.",
        orderLabel: "Order Number",
        amountLabel: "Amount",
        reasonLabel: "What the bank said",
        ctaNote:
            "Click the button below to try again. You won't need to re-enter your cake details — just a different card or the same card after checking with your bank.",
        ctaButton: "Retry Payment",
        supportNote:
            "If you keep having trouble, reply to this email or call us at (610) 279-6200. We're here to help.",
        signOff: "— Eli's Dulce Tradicion",
    },
    es: {
        subject: "No pudimos procesar tu pago — inténtalo de nuevo",
        title: "Pago No Completado",
        heading: "No pudimos procesar tu pago",
        lead:
            "Tu pedido de pastel aún no se ha realizado — tu tarjeta fue rechazada por tu banco. Los detalles de tu pedido están guardados y te esperan.",
        orderLabel: "Número de Pedido",
        amountLabel: "Monto",
        reasonLabel: "Lo que indicó el banco",
        ctaNote:
            "Haz clic en el botón de abajo para intentarlo de nuevo. No tendrás que volver a ingresar los detalles de tu pastel — solo necesitas otra tarjeta o la misma tarjeta después de comunicarte con tu banco.",
        ctaButton: "Reintentar Pago",
        supportNote:
            "Si sigues teniendo problemas, responde a este correo o llámanos al (610) 279-6200. Estamos aquí para ayudarte.",
        signOff: "— Eli's Dulce Tradicion",
    },
};

function buildHtml(lang: Lang, args: {
    orderNumber: string;
    amount: string;
    reason: string;
    retryUrl: string;
}): string {
    const c = COPY[lang];
    const logoUrl = `${FRONTEND_URL}/logo.png`;
    const alertBg = `linear-gradient(135deg,#7b1a1a 0%,#b03030 100%)`;

    return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><style>body{margin:0;padding:0;background:#f0ebe0;}@media only screen and (max-width:600px){.eb{padding:24px 20px!important;}}</style></head><body style="margin:0;padding:20px 0;background:#f0ebe0;font-family:'Nunito',Arial,sans-serif;"><div style="max-width:600px;margin:0 auto;border-radius:14px;overflow:hidden;box-shadow:0 6px 32px rgba(0,0,0,0.18);">
<div style="background:linear-gradient(160deg,${BRAND.charcoal} 0%,${BRAND.charcoalDeep} 100%);padding:30px 40px 24px;text-align:center;border-bottom:3px solid ${BRAND.gold};">
    <img src="${logoUrl}" alt="Eli's" width="80" height="80" style="display:block;margin:0 auto 12px;border-radius:50%;border:2px solid ${BRAND.gold};" />
    <div style="color:${BRAND.gold};font-family:'Playfair Display',Georgia,serif;font-size:22px;font-weight:700;letter-spacing:1px;">Eli's Dulce Tradici&oacute;n</div>
    <div style="color:rgba(198,166,73,0.6);font-size:11px;letter-spacing:3px;text-transform:uppercase;margin-top:5px;">Custom Cakes &bull; Norristown, PA</div>
</div>
<div style="background:${alertBg};padding:20px 40px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-family:'Playfair Display',Georgia,serif;font-size:23px;font-weight:700;">${c.title}</h1>
</div>
<div class="eb" style="background:${BRAND.white};padding:36px 40px;border-left:1px solid ${BRAND.creamBorder};border-right:1px solid ${BRAND.creamBorder};">
    <h2 style="color:${BRAND.charcoal};font-family:'Playfair Display',Georgia,serif;font-size:20px;font-weight:700;margin:0 0 14px;">${c.heading}</h2>
    <p style="color:#444;font-size:15px;line-height:1.6;margin:0 0 22px;">${c.lead}</p>

    <div style="background:#faf8f4;border-radius:10px;padding:22px 26px;margin:0 0 22px;border-left:4px solid #b03030;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr><td style="padding:7px 0;color:#777;font-size:13px;width:44%;border-bottom:1px solid #f0ead8;">${c.orderLabel}:</td><td style="padding:7px 0;color:${BRAND.charcoal};font-size:14px;font-weight:700;border-bottom:1px solid #f0ead8;">${escapeHtml(args.orderNumber)}</td></tr>
            <tr><td style="padding:7px 0;color:#777;font-size:13px;border-bottom:1px solid #f0ead8;">${c.amountLabel}:</td><td style="padding:7px 0;color:${BRAND.charcoal};font-size:14px;font-weight:700;border-bottom:1px solid #f0ead8;">${escapeHtml(args.amount)}</td></tr>
            <tr><td style="padding:7px 0;color:#777;font-size:13px;vertical-align:top;">${c.reasonLabel}:</td><td style="padding:7px 0;color:#7b1a1a;font-size:13px;">${escapeHtml(args.reason)}</td></tr>
        </table>
    </div>

    <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 22px;">${c.ctaNote}</p>

    <div style="text-align:center;margin:26px 0 10px;">
        <a href="${args.retryUrl}" style="background:linear-gradient(135deg,${BRAND.gold} 0%,${BRAND.goldLight} 100%);color:${BRAND.charcoal};padding:14px 36px;text-decoration:none;border-radius:7px;display:inline-block;font-weight:700;font-size:15px;">${c.ctaButton} &rarr;</a>
    </div>

    <p style="color:#888;font-size:12px;line-height:1.6;text-align:center;margin:24px 0 0;">${c.supportNote}</p>
    <p style="color:${BRAND.gold};font-family:'Playfair Display',Georgia,serif;font-style:italic;font-size:14px;text-align:center;margin:16px 0 0;">${c.signOff}</p>
</div>
<div style="background:linear-gradient(160deg,${BRAND.charcoal} 0%,${BRAND.charcoalDeep} 100%);padding:26px 40px;text-align:center;border-top:3px solid ${BRAND.gold};border-radius:0 0 14px 14px;">
    <div style="color:rgba(255,255,255,0.65);font-size:12px;line-height:2;margin-bottom:6px;">&#128222; (610) 279-6200 &nbsp;&bull;&nbsp; &#9993;&#65039; orders@elisbakery.com</div>
    <div style="color:rgba(255,255,255,0.4);font-size:11px;margin-bottom:14px;">324 W Marshall St, Norristown, PA 19401</div>
    <div style="border-top:1px solid rgba(198,166,73,0.25);padding-top:12px;"><a href="${FRONTEND_URL}" style="color:${BRAND.gold};text-decoration:none;font-size:12px;">elisbakery.com</a></div>
</div>
</div></body></html>`;
}

interface Body {
    pending_order_id: string;
    customer_name: string;
    customer_email: string;
    customer_language?: string;
    order_number: string;
    amount: number;
    error_message: string;
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

        const body = await req.json() as Body;
        if (!body.customer_email || !body.order_number || !body.pending_order_id) {
            return new Response(
                JSON.stringify({ error: "Missing required fields" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const lang: Lang = body.customer_language === "es" ? "es" : "en";
        const c = COPY[lang];
        const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(body.amount || 0);
        const retryUrl = `${FRONTEND_URL}/payment-checkout?pendingId=${encodeURIComponent(body.pending_order_id)}`;

        const resend = new Resend(RESEND_API_KEY);
        await resend.emails.send({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: body.customer_email,
            subject: c.subject,
            html: buildHtml(lang, {
                orderNumber: body.order_number,
                amount,
                reason: body.error_message || "Card declined",
                retryUrl,
            }),
        });

        return new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("send-payment-failed-customer error:", error);
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
