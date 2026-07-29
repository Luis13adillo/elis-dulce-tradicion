// delivery-quote — customer-facing pre-check for the order wizard.
//
// POST { address } -> { status: 'flat'|'quote_required', fee, distance_miles }
//
// This is DISPLAY ONLY. The wizard uses it to show "$5 delivery" or
// "we'll confirm your delivery cost" while the customer types. The
// authoritative verdict is recomputed inside the create-pending-order
// Edge Function at submit time and enforced by create_pending_order_secure
// and the create-payment-intent gate — nothing a caller does here can
// change what an order costs.
//
// Rate limited because each call fans out to external geocoding/routing
// APIs (reuses payment_rate_limits with a "dq:" scope prefix so the
// payment limiter's budget is untouched).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { computeDeliveryVerdict, FLAT_FEE_USD, FLAT_RADIUS_MILES } from "../_shared/delivery.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT = 20;
const RATE_WINDOW_SECONDS = 60;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfiguration" }, 500);

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";
    const scopedIp = `dq:${clientIp}`.slice(0, 100);

    const supabase = createClient(supabaseUrl, serviceKey);
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

    let body: { address?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
    const address = typeof body.address === "string" ? body.address.slice(0, 300) : "";

    const verdict = await computeDeliveryVerdict(address);
    return json({
        status: verdict.status,
        fee: verdict.fee,
        distance_miles: verdict.distance_miles,
        flat_fee: FLAT_FEE_USD,
        flat_radius_miles: FLAT_RADIUS_MILES,
    });
});
