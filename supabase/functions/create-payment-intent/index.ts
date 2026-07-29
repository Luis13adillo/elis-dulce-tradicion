// create-payment-intent — Tier A version.
//
// Input: { pending_order_id }  — REQUIRED. There is no other accepted shape.
//
// We read the pending_order row server-side, take the amount from that row
// (never from the request), and put the pending_order_id in PaymentIntent
// metadata so the webhook knows exactly which row to promote. The idempotency
// key is the pending_order_id plus its price_revision — if the frontend
// retries, Stripe returns the same PaymentIntent instead of creating a second,
// and a staff price change forces a fresh one.
//
// The legacy { amount, metadata } path was REMOVED on 2026-07-28. It let any
// anonymous caller mint a PaymentIntent for an arbitrary amount against the
// live Stripe account. See the comment at the rejection branch below.

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
                .select("id, order_number, customer_name, customer_email, customer_phone, customer_language, total_amount, status, payment_intent_id, expires_at, date_needed, time_needed, cake_size, filling, delivery_option, delivery_address, delivery_fee, delivery_quote_status, reference_image_path, image_review_status, price_revision")
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

            // Delivery-quote gate (authoritative, server-side). An order
            // flagged "Delivery Quote Required" (beyond the 5-mile flat-fee
            // radius, or the address/distance could not be verified) may not
            // pay until staff entered the final delivery fee — its stored
            // total does not include delivery yet, so charging it would be
            // charging the wrong amount. resolve_delivery_quote flips the
            // status to 'quoted', bumps price_revision and re-opens payment.
            if (pending.delivery_option === "delivery"
                && pending.delivery_quote_status === "quote_required") {
                return new Response(
                    JSON.stringify({
                        error: "We're confirming your delivery cost. We'll email you a secure payment link as soon as it's ready.",
                        code: "delivery_quote_required",
                    }),
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
                        delivery_fee: String(pending.delivery_fee ?? ""),
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

        // ---- Legacy caller-supplied-amount path: REMOVED 2026-07-28 ----
        //
        // This branch used to accept { amount, metadata } and create a
        // PaymentIntent for whatever the caller asked for, with no link to a
        // pending_order and no server-side price lookup. The audit on
        // 2026-07-28 found it still live three months after its own "remove
        // after 24h" comment, and reachable by anyone holding the public anon
        // key. Two proven abuses:
        //   1. Card testing against the LIVE Stripe account ($0.50 loops),
        //      which gets a real bakery's Stripe account restricted.
        //   2. Passing metadata.order_number for a REAL order, paying 50c, and
        //      having the webhook's matching legacy branch stamp that order
        //      "paid" and overwrite stripe_payment_id — which then breaks the
        //      genuine customer's refund.
        //
        // Every payment must now be tied to a pending_order whose total the
        // server computed and re-verified. There is deliberately no fallback.
        return new Response(
            JSON.stringify({
                error: "pending_order_id is required",
                code: "PENDING_ORDER_REQUIRED",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
