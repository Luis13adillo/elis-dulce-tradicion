// verify-payment — actually verifies a payment against Stripe's API.
//
// Replaces the old verify_stripe_payment RPC which was a tautology (it only
// checked that orders.stripe_payment_id existed — which would return true
// for anything the webhook had already written).
//
// Called by OrderConfirmation.tsx via polling after the customer returns
// from Stripe. Returns { verified: true, order } only when BOTH
//   (a) Stripe confirms paymentIntent.status === 'succeeded'
//   (b) the promoted orders row actually exists in our DB
// so the success page never shows a fake green checkmark.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        const pendingOrderId: string | undefined = body.pending_order_id;
        const paymentIntentId: string | undefined = body.payment_intent_id;

        if (!pendingOrderId && !paymentIntentId) {
            return new Response(
                JSON.stringify({ error: "pending_order_id or payment_intent_id required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

        // Resolve PI from pending_order if that's what the client sent
        let piId = paymentIntentId;
        if (!piId && pendingOrderId) {
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
                        error_message: pending.error_message,
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
            piId = pending.payment_intent_id;
        }

        // Actually ask Stripe
        const pi = await stripe.paymentIntents.retrieve(piId!);
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
            .select("*")
            .eq("payment_intent_id", piId!)
            .maybeSingle();

        if (!order) {
            return new Response(
                JSON.stringify({ verified: false, status: "webhook_pending" }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        return new Response(
            JSON.stringify({ verified: true, status: "succeeded", order }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (err) {
        console.error("verify-payment error:", err);
        return new Response(
            JSON.stringify({ error: (err as Error).message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
