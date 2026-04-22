// create-payment-intent — Tier A version.
//
// Input: { pending_order_id }  (or legacy: { amount, metadata })
//
// Tier A path: we read the pending_order row server-side, recompute amount
// from that row, and put the pending_order_id in PaymentIntent metadata so
// the webhook knows exactly which row to promote. The idempotency key is
// the pending_order_id itself — if the frontend retries the create call,
// Stripe returns the same PaymentIntent instead of creating a second.
//
// Legacy path (backwards-compatible with pre-Tier-A calls): still honors
// { amount, metadata } so a deploy in flight doesn't break active sessions.
// Remove after 24h once no old frontend bundles are alive.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
        || req.headers.get("x-real-ip")
        || "unknown";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !STRIPE_SECRET_KEY) {
        return new Response(
            JSON.stringify({ error: "Server misconfiguration" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // IP rate limit — reuse existing payment_rate_limits table
    const windowStart = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000).toISOString();
    const { count } = await supabase
        .from("payment_rate_limits")
        .select("*", { count: "exact", head: true })
        .eq("ip_address", clientIp)
        .gte("created_at", windowStart);

    if (count !== null && count >= RATE_LIMIT) {
        return new Response(
            JSON.stringify({ error: "Too many requests. Please wait a minute.", retryAfter: RATE_WINDOW_SECONDS }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(RATE_WINDOW_SECONDS) } }
        );
    }

    await supabase.from("payment_rate_limits").insert({ ip_address: clientIp, created_at: new Date().toISOString() });
    supabase.from("payment_rate_limits").delete().lt("created_at", windowStart).then(() => { });

    try {
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
        const body = await req.json();

        // ---- Tier A path ----
        if (body.pending_order_id) {
            const { data: pending, error } = await supabase
                .from("pending_orders")
                .select("id, order_number, customer_name, customer_email, total_amount, status, payment_intent_id, expires_at")
                .eq("id", body.pending_order_id)
                .maybeSingle();

            if (error || !pending) {
                return new Response(
                    JSON.stringify({ error: "pending_order not found" }),
                    { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (new Date(pending.expires_at).getTime() < Date.now()) {
                return new Response(
                    JSON.stringify({ error: "This order has expired. Please start a new order." }),
                    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            if (pending.status === "promoted") {
                return new Response(
                    JSON.stringify({ error: "This order has already been paid." }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            const amount = Number(pending.total_amount);
            if (!amount || amount <= 0 || amount > 10000) {
                return new Response(
                    JSON.stringify({ error: "Invalid order amount" }),
                    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // If a PI already exists for this pending order, return its client_secret
            // instead of creating a new one (handles tab refresh, duplicate calls).
            if (pending.payment_intent_id) {
                try {
                    const existing = await stripe.paymentIntents.retrieve(pending.payment_intent_id);
                    if (existing.status === "requires_payment_method"
                        || existing.status === "requires_confirmation"
                        || existing.status === "requires_action") {
                        return new Response(
                            JSON.stringify({ clientSecret: existing.client_secret, id: existing.id }),
                            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                } catch (retrieveErr) {
                    // PI gone or invalid — fall through and create a fresh one
                    console.warn("existing PI retrieve failed, creating new:", retrieveErr);
                }
            }

            const paymentIntent = await stripe.paymentIntents.create(
                {
                    amount: Math.round(amount * 100),
                    currency: "usd",
                    // Restrict to card + link while Cash App redirect flow is under
                    // additional review (Tier A handles it safely, but Cash App is
                    // the highest-source-of-stranded-payment payment method).
                    payment_method_types: ["card", "link"],
                    metadata: {
                        pending_order_id: pending.id,
                        order_number: pending.order_number,
                        customer_name: pending.customer_name ?? "",
                        customer_email: pending.customer_email ?? "",
                    },
                    receipt_email: pending.customer_email ?? undefined,
                },
                { idempotencyKey: `pending_${pending.id}` }
            );

            // Store the PI id on the pending row so subsequent calls can reuse it
            await supabase
                .from("pending_orders")
                .update({ payment_intent_id: paymentIntent.id })
                .eq("id", pending.id);

            return new Response(
                JSON.stringify({ clientSecret: paymentIntent.client_secret, id: paymentIntent.id }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // ---- Legacy path (pre-Tier-A frontend bundle) ----
        const { amount, currency, metadata, idempotencyKey } = body;
        if (!amount) {
            return new Response(
                JSON.stringify({ error: "Missing amount or pending_order_id" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        if (amount > 10000) {
            return new Response(
                JSON.stringify({ error: "Amount exceeds maximum allowed" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const effectiveIdempotencyKey = idempotencyKey
            || `${metadata?.order_number || "order"}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        const paymentIntent = await stripe.paymentIntents.create(
            {
                amount: Math.round(amount * 100),
                currency: currency || "usd",
                payment_method_types: ["card", "link"],
                metadata: metadata || {},
            },
            { idempotencyKey: effectiveIdempotencyKey }
        );

        return new Response(
            JSON.stringify({ clientSecret: paymentIntent.client_secret, id: paymentIntent.id }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Payment intent error:", error);
        // deno-lint-ignore no-explicit-any
        if ((error as any).type === "StripeIdempotencyError") {
            return new Response(
                JSON.stringify({ error: "A payment with this request is already being processed. Please wait.", code: "IDEMPOTENCY_ERROR" }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
