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
                .select("id, order_number, customer_name, customer_email, customer_phone, customer_language, total_amount, status, payment_intent_id, expires_at, date_needed, time_needed, cake_size, filling, delivery_option, delivery_address, reference_image_path, image_review_status, price_revision")
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

            // Image-review gate (authoritative, server-side). When enforcement
            // is on, an order that carries a reference photo may only pay after
            // its photo review has passed (AI match) or been approved by staff.
            // Derived from image presence so a client that skips the review
            // call — or a crafted request straight at this endpoint — is still
            // blocked. 'off'/'shadow' modes never gate.
            const hasReferenceImage = typeof pending.reference_image_path === "string"
                && pending.reference_image_path.trim() !== "";
            if (hasReferenceImage) {
                const { data: settings } = await supabase
                    .from("business_settings")
                    .select("image_review_mode")
                    .limit(1)
                    .maybeSingle();
                const reviewMode = settings?.image_review_mode ?? "off";
                const reviewStatus = pending.image_review_status ?? "not_required";
                if (reviewMode === "enforce" && !["passed", "approved"].includes(reviewStatus)) {
                    return new Response(
                        JSON.stringify({
                            error: "This order's design photo is being reviewed by our bakers. We'll email you a secure payment link once it's confirmed.",
                            code: "image_review_required",
                        }),
                        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                    );
                }
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
                    // Only reuse a PI whose amount still matches the row. A staff
                    // price revision after review nulls payment_intent_id, but if
                    // a stale PI ever survives (race, partial failure) reusing it
                    // would charge the OLD amount — create a fresh one instead.
                    const amountMatches = existing.amount === Math.round(Number(pending.total_amount) * 100);
                    if (amountMatches
                        && (existing.status === "requires_payment_method"
                            || existing.status === "requires_confirmation"
                            || existing.status === "requires_action")) {
                        return new Response(
                            JSON.stringify({ clientSecret: existing.client_secret, id: existing.id }),
                            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                        );
                    }
                    if (!amountMatches && existing.status !== "succeeded" && existing.status !== "canceled") {
                        // Best-effort: cancel the stale-amount PI so it can never be confirmed
                        try {
                            await stripe.paymentIntents.cancel(existing.id);
                        } catch (cancelErr) {
                            console.warn("stale PI cancel failed (continuing):", cancelErr);
                        }
                    }
                } catch (retrieveErr) {
                    // PI gone or invalid — fall through and create a fresh one
                    console.warn("existing PI retrieve failed, creating new:", retrieveErr);
                }
            }

            // Belt-and-suspenders: even with pending_orders as the source of
            // truth, mirror core recovery fields into Stripe metadata. If the
            // pending row is ever lost, the Stripe charge still carries enough
            // information to contact the customer and reconstruct the order.
            // Stripe metadata limits: 50 keys, 500 chars per value.
            const truncate = (v: string | null | undefined, n = 500) =>
                v ? String(v).slice(0, n) : "";

            const paymentIntent = await stripe.paymentIntents.create(
                {
                    amount: Math.round(amount * 100),
                    currency: "usd",
                    // Respect whatever payment methods are enabled in the Stripe
                    // Dashboard (card, Link, Cash App Pay, Apple Pay, Google Pay,
                    // etc.). Tier A's save-before-pay model makes redirect-based
                    // methods safe — the order is already in pending_orders and
                    // the webhook promotes it independent of the browser.
                    automatic_payment_methods: { enabled: true },
                    metadata: {
                        pending_order_id: pending.id,
                        order_number: pending.order_number,
                        customer_name: truncate(pending.customer_name),
                        customer_email: truncate(pending.customer_email),
                        customer_phone: truncate(pending.customer_phone),
                        customer_language: truncate(pending.customer_language ?? "en"),
                        date_needed: truncate(pending.date_needed ? String(pending.date_needed) : null),
                        time_needed: truncate(pending.time_needed ? String(pending.time_needed) : null),
                        cake_size: truncate(pending.cake_size),
                        filling: truncate(pending.filling),
                        delivery_option: truncate(pending.delivery_option),
                        delivery_address: truncate(pending.delivery_address),
                        total_amount: String(pending.total_amount ?? ""),
                    },
                    receipt_email: pending.customer_email ?? undefined,
                },
                // Versioned by price_revision: a staff price change after review
                // must produce a NEW Stripe idempotency scope — reusing the old
                // key with a different amount would be rejected by Stripe (or
                // worse, replay the old-amount PI within the idempotency window).
                { idempotencyKey: `pending_${pending.id}_v${pending.price_revision ?? 0}` }
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
                automatic_payment_methods: { enabled: true },
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
