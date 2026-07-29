// verify-payment — actually verifies a payment against Stripe's API.
//
// Called by OrderConfirmation.tsx via polling after the customer returns
// from Stripe. Returns { verified: true, order } only when BOTH
//   (a) Stripe confirms paymentIntent.status === 'succeeded'
//   (b) the promoted orders row actually exists in our DB
// so the success page never shows a fake green checkmark.
//
// HARDENED 2026-07-28: this endpoint is unauthenticated (the pending-order
// UUID is the capability), so the response is a strict whitelist of
// payment-confirmation fields. It previously returned the ENTIRE orders row
// (select *) — customer PII, delivery address, internal pricing and staff
// fields — to anyone holding a pending id or any payment_intent id. The raw
// payment_intent_id input path was removed with it: no production caller
// ever used it, and it widened the capability from "knows this order's
// pending UUID" to "knows any Stripe PI id".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { isUuid, maskEmail } from "../_shared/submissionValidation.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Everything the confirmation page needs, nothing an attacker can use:
// no name/phone/full email, no address, no internal pricing or staff fields.
const SAFE_ORDER_COLUMNS =
    "order_number, status, payment_status, date_needed, time_needed, cake_size, filling, theme, dedication, delivery_option, total_amount, customer_email";

function toSafeOrder(order: Record<string, unknown>): Record<string, unknown> {
    return {
        order_number: order.order_number,
        status: order.status,
        payment_status: order.payment_status,
        date_needed: order.date_needed,
        time_needed: order.time_needed,
        cake_size: order.cake_size,
        filling: order.filling,
        theme: order.theme,
        dedication: order.dedication,
        delivery_option: order.delivery_option,
        total_amount: order.total_amount,
        customer_email_masked: maskEmail(order.customer_email as string | null),
    };
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        return new Response(
            JSON.stringify({ error: "Server misconfiguration" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    try {
        const body = await req.json();
        const pendingOrderId: unknown = body.pending_order_id;

        if (!isUuid(pendingOrderId)) {
            return new Response(
                JSON.stringify({ error: "pending_order_id (uuid) required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

        const { data: pending } = await supabase
            .from("pending_orders")
            .select("payment_intent_id, status, error_message")
            .eq("id", pendingOrderId)
            .maybeSingle();

        // If pending is still awaiting_payment (no PI yet) or payment_failed,
        // report that state cleanly instead of pretending to verify.
        if (pending?.status === "payment_failed") {
            return new Response(
                JSON.stringify({
                    verified: false,
                    status: "payment_failed",
                    // Stripe's customer-facing decline message, capped.
                    error_message: typeof pending.error_message === "string"
                        ? pending.error_message.slice(0, 200)
                        : null,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        if (!pending?.payment_intent_id) {
            return new Response(
                JSON.stringify({ verified: false, status: "awaiting_payment" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        const piId = pending.payment_intent_id;

        // Actually ask Stripe
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.status !== "succeeded") {
            return new Response(
                JSON.stringify({ verified: false, status: pi.status }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Find the promoted orders row. If the webhook hasn't landed yet,
        // we return verified=false with a pending flag so the frontend keeps
        // polling instead of erroring.
        const { data: order } = await supabase
            .from("orders")
            .select(SAFE_ORDER_COLUMNS)
            .eq("payment_intent_id", piId)
            .maybeSingle();

        if (!order) {
            return new Response(
                JSON.stringify({ verified: false, status: "webhook_pending" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ verified: true, status: "succeeded", order: toSafeOrder(order) }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("verify-payment error:", err);
        return new Response(
            JSON.stringify({ error: "Verification failed" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
