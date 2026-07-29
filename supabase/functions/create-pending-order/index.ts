// create-pending-order — the order wizard's submit endpoint.
//
// Wraps create_pending_order_secure with the server-side delivery verdict:
//   1. Resolves the caller's JWT (if any) so signed-in customers keep
//      their user_id linkage — the RPC runs as service_role where
//      auth.uid() is NULL.
//   2. For delivery orders, computes the driving distance from the
//      Norristown origin (shared module; Google if a key is configured,
//      OpenStreetMap otherwise) and derives the ONLY fee the database
//      will accept: flat $5 within 5 miles, otherwise $0 + quote_required.
//   3. Rewrites delivery_fee / total_amount / subtotal with the server
//      numbers before calling the RPC, so a client that displayed a stale
//      fee still produces a consistent order instead of a rejection.
//   4. On quote_required, emails the bakery so staff can quote promptly
//      (best-effort; the Front Desk queue is the reliable surface).
//
// The public create_pending_order RPC still exists for cached bundles but
// can never mint a flat fee (NULL verdict -> quote_required). This EF is
// the only path to a verified $5 delivery order.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";
import { computeDeliveryVerdict, FLAT_RADIUS_MILES } from "../_shared/delivery.ts";
import { buildEmailHtml } from "../_shared/emailTemplates.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

const round2 = (n: number) => Math.round(n * 100) / 100;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfiguration" }, 500);
    const supabase = createClient(supabaseUrl, serviceKey);

    // ---- IP rate limit (same table/pattern as create-payment-intent) ----
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";
    const scopedIp = `cpo:${clientIp}`.slice(0, 100);
    const windowStart = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000).toISOString();
    const { count } = await supabase
        .from("payment_rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", scopedIp)
        .gte("created_at", windowStart);
    if (count !== null && count >= RATE_LIMIT) {
        return json({ error: "Too many requests. Please wait a minute." }, 429);
    }
    await supabase.from("payment_rate_limits").insert({ ip_address: scopedIp, created_at: new Date().toISOString() });
    supabase.from("payment_rate_limits").delete().lt("created_at", windowStart).then(() => { });

    let payload: Record<string, unknown>;
    try {
        payload = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
    if (!payload || typeof payload !== "object") return json({ error: "Invalid payload" }, 400);

    // ---- Resolve the caller's identity (guests stay anonymous) ----
    // The RPC runs as service_role, so auth.uid() is NULL there; pass the
    // VERIFIED user id through the payload field the public wrapper strips.
    delete (payload as Record<string, unknown>).verified_user_id;
    const token = req.headers.get("Authorization")?.replace(/^[Bb]earer\s+/, "");
    if (token) {
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user?.id) payload.verified_user_id = userData.user.id;
    }
    delete (payload as Record<string, unknown>).user_id; // never trust the client's claim

    // ---- Server-side delivery verdict ----
    const isDelivery = payload.delivery_option === "delivery";
    let verdict: Awaited<ReturnType<typeof computeDeliveryVerdict>> | null = null;
    if (isDelivery) {
        const address = [payload.delivery_address, payload.delivery_apartment]
            .filter((p) => typeof p === "string" && p.trim() !== "")
            .join(", ");
        verdict = await computeDeliveryVerdict(String(payload.delivery_address ?? "") ? address : "");
    }

    // ---- Rewrite money fields with the server's numbers ----
    // cake total = whatever the client sent minus the fee IT displayed;
    // the RPC still validates that cake total against cake_sizes pricing.
    const clientTotal = Number(payload.total_amount ?? 0);
    const clientFee = Number(payload.delivery_fee ?? 0);
    if (!Number.isFinite(clientTotal) || !Number.isFinite(clientFee)) {
        return json({ error: "Invalid total_amount or delivery_fee" }, 400);
    }
    const serverFee = verdict?.fee ?? 0;
    const cakeTotal = round2(clientTotal - clientFee);
    payload.delivery_fee = serverFee;
    payload.total_amount = round2(cakeTotal + serverFee);
    payload.subtotal = cakeTotal;

    // ---- Transactional creation ----
    const { data, error } = await supabase.rpc("create_pending_order_secure", {
        payload,
        p_verdict: verdict
            ? {
                status: verdict.status,
                fee: verdict.fee,
                distance_miles: verdict.distance_miles,
                method: verdict.method,
                reason: verdict.reason,
            }
            : null,
    });
    if (error) {
        // Surface the RPC's validation message (capacity full, pricing
        // mismatch, holiday closure…) — the wizard shows it verbatim.
        return json({ error: error.message }, 400);
    }

    const quoteRequired = data?.delivery_quote_status === "quote_required";
    if (quoteRequired && !data?.idempotent_hit) {
        try {
            await notifyOwnerQuoteNeeded(data, payload, verdict);
        } catch (mailErr) {
            console.error("owner quote notification failed (non-fatal):", mailErr);
        }
    }

    return json({
        ...data,
        delivery_distance_miles: verdict?.distance_miles ?? null,
        flat_radius_miles: FLAT_RADIUS_MILES,
    });
});

// ---------------------------------------------------------------------------
// Owner notification — a quote-required order is waiting
// ---------------------------------------------------------------------------
async function notifyOwnerQuoteNeeded(
    // deno-lint-ignore no-explicit-any
    rpcResult: any,
    payload: Record<string, unknown>,
    verdict: { distance_miles: number | null; reason: string | null } | null,
): Promise<void> {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) {
        console.warn("RESEND_API_KEY not set — skipping owner quote notification");
        return;
    }
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
    const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
    const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "owner@elisbakery.com";
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";

    const esc = (v: unknown) => String(v ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

    const distanceLine = verdict?.distance_miles != null
        ? `${verdict.distance_miles} miles from the bakery (beyond the ${FLAT_RADIUS_MILES}-mile flat-fee radius)`
        : `distance could not be verified (${esc(verdict?.reason ?? "unknown")})`;

    const bodyContent = `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        A delivery order needs a <strong>delivery quote</strong> before the customer can pay.
      </p>
      <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#888;">Order</td><td style="padding:6px 0;font-weight:600;">${esc(rpcResult.order_number)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Customer</td><td style="padding:6px 0;font-weight:600;">${esc(payload.customer_name)} — ${esc(payload.customer_phone)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Deliver to</td><td style="padding:6px 0;font-weight:600;">${esc(payload.delivery_address)}${payload.delivery_apartment ? `, ${esc(payload.delivery_apartment)}` : ""}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Distance</td><td style="padding:6px 0;font-weight:600;">${distanceLine}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Needed</td><td style="padding:6px 0;font-weight:600;">${esc(payload.date_needed)} ${esc(payload.time_needed)}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Cake total</td><td style="padding:6px 0;font-weight:600;">$${Number(rpcResult.total_amount).toFixed(2)} (delivery fee not yet included)</td></tr>
      </table>
      <p style="margin:20px 0 0;font-size:14px;color:#333;">
        Enter the delivery fee from the Front Desk &rarr; <strong>Delivery Quotes</strong> panel —
        the customer automatically gets a payment link for the updated total.
      </p>`;

    const resend = new Resend(key);
    await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `Delivery quote needed — ${rpcResult.order_number}`,
        html: buildEmailHtml({
            titleEmoji: "🚗",
            title: "Delivery quote needed",
            titleBandStyle: "gold",
            bodyContent,
            frontendUrl,
        }),
    });
}
