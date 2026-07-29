// test-stripe-helper — STAGING ONLY. NEVER DEPLOY TO PRODUCTION.
//
// Lets the integration test harness (scripts/delivery-flow-staging-test.mjs)
// confirm and inspect Stripe TEST-mode PaymentIntents without the test
// secret key ever leaving the project's function secrets.
//
// Three guards, all fail-closed:
//   1. Requires the project's service_role key as the bearer token.
//   2. Refuses to run at all if STRIPE_SECRET_KEY is a LIVE-mode key —
//      so even an accidental production deploy can never touch live money.
//   3. Only three read/confirm actions exist; no refunds, no transfers.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { isServiceRoleCaller } from "../_shared/authz.ts";

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!STRIPE_SECRET_KEY) return json({ error: "No Stripe key configured" }, 500);
    if (!STRIPE_SECRET_KEY.startsWith("sk_test_") && !STRIPE_SECRET_KEY.startsWith("rk_test_")) {
        return json({ error: "Refusing to run outside Stripe TEST mode" }, 403);
    }
    if (!isServiceRoleCaller(req)) return json({ error: "Unauthorized" }, 401);

    let body: { action?: string; payment_intent_id?: string; payment_method?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
    const { action, payment_intent_id, payment_method } = body;
    if (!payment_intent_id) return json({ error: "payment_intent_id required" }, 400);

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    try {
        if (action === "retrieve") {
            const pi = await stripe.paymentIntents.retrieve(payment_intent_id);
            return json({ id: pi.id, status: pi.status, amount: pi.amount, currency: pi.currency, metadata: pi.metadata });
        }
        if (action === "confirm") {
            const pi = await stripe.paymentIntents.confirm(payment_intent_id, {
                payment_method: payment_method ?? "pm_card_visa",
            });
            return json({ id: pi.id, status: pi.status, amount: pi.amount });
        }
        return json({ error: "action must be retrieve or confirm" }, 400);
    } catch (err) {
        // Surface Stripe's error so the harness can assert on it (e.g.
        // confirming a canceled PI must fail).
        // deno-lint-ignore no-explicit-any
        const e = err as any;
        return json({ stripe_error: e?.raw?.message ?? e?.message ?? String(err), code: e?.raw?.code ?? e?.code ?? null }, 402);
    }
});
