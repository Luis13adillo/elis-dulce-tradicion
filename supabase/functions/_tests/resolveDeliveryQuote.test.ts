// deno test --allow-env supabase/functions/_tests/resolveDeliveryQuote.test.ts
//
// Mocked-Stripe tests for the resolve-delivery-quote handler (staff enters
// the delivery fee for a quote-required order). The REAL handler runs; the
// network is canned. Asserts the RPC payload, the stale-PaymentIntent cancel
// call at Stripe, authorization failures, and fee validation.
//
// NOTE: env must be set BEFORE the dynamic import — _shared/authz.ts reads
// SUPABASE_URL / SERVICE_ROLE_KEY at module load time.

import { assertEquals, assert } from "jsr:@std/assert@1";
import { withMockFetch, jsonResponse, callsTo, type MockRoute } from "./mockFetch.ts";

Deno.env.set("SUPABASE_URL", "http://mock-supabase.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_mock_service_key");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_mock_key_not_real");
Deno.env.delete("RESEND_API_KEY"); // email side effect skips cleanly

const { handler } = await import("../resolve-delivery-quote/handler.ts");

const PENDING_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const STAFF_ID = "99999999-8888-7777-6666-555555555555";

function rpcResult(overrides: Record<string, unknown> = {}) {
    return {
        success: true,
        pending_order_id: PENDING_ID,
        order_number: "EDT-2026-2002",
        customer_name: "Prueba Cliente",
        customer_email: "cliente@example.com",
        customer_language: "en",
        delivery_address: "1 S Broad St, Philadelphia, PA 19107",
        delivery_fee: 18.5,
        total_amount: 73.5,
        date_needed: "2026-08-05",
        payment_link_hours: 48,
        old_payment_intent_id: null,
        price_revision: 1,
        ...overrides,
    };
}

function serviceRequest(body: unknown): Request {
    return new Request("http://localhost/resolve-delivery-quote", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer sb_secret_mock_service_key",
        },
        body: JSON.stringify(body),
    });
}

const T = { sanitizeOps: false, sanitizeResources: false };

// ---------------------------------------------------------------------------

Deno.test({
    name: "staff quote via RPC: correct payload, 200, no Stripe call when no stale PI",
    ...T,
    fn: async () => {
        const routes: MockRoute[] = [
            { method: "POST", match: "/rest/v1/rpc/resolve_delivery_quote", reply: () => jsonResponse(rpcResult()) },
        ];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(serviceRequest({ pending_order_id: PENDING_ID, delivery_fee: 18.5, staff_id: STAFF_ID }));
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body.success, true);
            assertEquals(body.total_amount, 73.5);

            const rpc = calls.find((c) => c.url.includes("/rpc/resolve_delivery_quote"))!;
            const payload = JSON.parse(rpc.body ?? "{}");
            assertEquals(payload.p_pending_id, PENDING_ID);
            assertEquals(payload.p_staff_id, STAFF_ID);
            assertEquals(payload.p_fee, 18.5);
            assertEquals(payload.p_notes, null);

            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

Deno.test({
    name: "re-quote with stale PI: cancels exactly that PaymentIntent at Stripe",
    ...T,
    fn: async () => {
        let cancelHits = 0;
        const routes: MockRoute[] = [
            {
                method: "POST",
                match: "/rest/v1/rpc/resolve_delivery_quote",
                reply: () => jsonResponse(rpcResult({ old_payment_intent_id: "pi_stale_77", delivery_fee: 25, total_amount: 80, price_revision: 2 })),
            },
            {
                method: "POST",
                match: "/v1/payment_intents/pi_stale_77/cancel",
                reply: () => { cancelHits++; return jsonResponse({ id: "pi_stale_77", status: "canceled" }); },
            },
        ];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(serviceRequest({ pending_order_id: PENDING_ID, delivery_fee: 25, staff_id: STAFF_ID }));
            assertEquals(res.status, 200);
            assertEquals(cancelHits, 1);
            // The only Stripe traffic is the cancel — nothing else.
            const stripeCalls = callsTo(calls, "api.stripe.com");
            assertEquals(stripeCalls.length, 1);
            assert(stripeCalls[0].url.endsWith("/v1/payment_intents/pi_stale_77/cancel"));
        });
    },
});

Deno.test({
    name: "Stripe cancel failure is best-effort: quote still succeeds (gate blocks reuse)",
    ...T,
    fn: async () => {
        const routes: MockRoute[] = [
            {
                method: "POST",
                match: "/rest/v1/rpc/resolve_delivery_quote",
                reply: () => jsonResponse(rpcResult({ old_payment_intent_id: "pi_already_gone" })),
            },
            {
                method: "POST",
                match: "/v1/payment_intents/pi_already_gone/cancel",
                reply: () => jsonResponse({ error: { type: "invalid_request_error", message: "No such payment_intent" } }, 404),
            },
        ];
        await withMockFetch(routes, async () => {
            const res = await handler(serviceRequest({ pending_order_id: PENDING_ID, delivery_fee: 18.5, staff_id: STAFF_ID }));
            assertEquals(res.status, 200);
            assertEquals((await res.json()).success, true);
        });
    },
});

Deno.test({
    name: "RPC business failure (e.g. wrong status): 409, and NO Stripe call",
    ...T,
    fn: async () => {
        const routes: MockRoute[] = [
            {
                method: "POST",
                match: "/rest/v1/rpc/resolve_delivery_quote",
                reply: () => jsonResponse({ success: false, error: "not_quote_required" }),
            },
        ];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(serviceRequest({ pending_order_id: PENDING_ID, delivery_fee: 18.5, staff_id: STAFF_ID }));
            assertEquals(res.status, 409);
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

// ---------------------------------------------------------------------------
// Input validation — nothing reaches the RPC or Stripe
// ---------------------------------------------------------------------------

for (const [label, fee] of [["negative", -1], ["over $500", 501], ["not a number", "abc"]] as const) {
    Deno.test({
        name: `invalid delivery_fee (${label}): 400, no RPC, no Stripe`,
        ...T,
        fn: async () => {
            await withMockFetch([], async (calls) => {
                const res = await handler(serviceRequest({ pending_order_id: PENDING_ID, delivery_fee: fee, staff_id: STAFF_ID }));
                assertEquals(res.status, 400);
                assertEquals(calls.length, 0);
            });
        },
    });
}

Deno.test({
    name: "fee of $0 is allowed (free delivery only as an explicit staff decision)",
    ...T,
    fn: async () => {
        const routes: MockRoute[] = [
            { method: "POST", match: "/rest/v1/rpc/resolve_delivery_quote", reply: () => jsonResponse(rpcResult({ delivery_fee: 0, total_amount: 55 })) },
        ];
        await withMockFetch(routes, async () => {
            const res = await handler(serviceRequest({ pending_order_id: PENDING_ID, delivery_fee: 0, staff_id: STAFF_ID }));
            assertEquals(res.status, 200);
        });
    },
});

Deno.test({
    name: "missing pending_order_id: 400",
    ...T,
    fn: async () => {
        await withMockFetch([], async () => {
            const res = await handler(serviceRequest({ delivery_fee: 10, staff_id: STAFF_ID }));
            assertEquals(res.status, 400);
        });
    },
});

Deno.test({
    name: "service caller without staff_id attribution: 400",
    ...T,
    fn: async () => {
        await withMockFetch([], async () => {
            const res = await handler(serviceRequest({ pending_order_id: PENDING_ID, delivery_fee: 10 }));
            assertEquals(res.status, 400);
        });
    },
});

// ---------------------------------------------------------------------------
// Authorization — customers and anonymous callers can never set fees
// ---------------------------------------------------------------------------

Deno.test({
    name: "no Authorization header: 401, nothing touched",
    ...T,
    fn: async () => {
        await withMockFetch([], async (calls) => {
            const res = await handler(new Request("http://localhost/resolve-delivery-quote", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pending_order_id: PENDING_ID, delivery_fee: 10, staff_id: STAFF_ID }),
            }));
            assertEquals(res.status, 401);
            assertEquals(calls.length, 0);
        });
    },
});

Deno.test({
    name: "random bearer token (e.g. leaked anon key): 401 via auth lookup, no RPC, no Stripe",
    ...T,
    fn: async () => {
        const routes: MockRoute[] = [
            { method: "GET", match: "/auth/v1/user", reply: () => jsonResponse({ message: "invalid JWT" }, 401) },
        ];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(new Request("http://localhost/resolve-delivery-quote", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer not-the-service-key" },
                body: JSON.stringify({ pending_order_id: PENDING_ID, delivery_fee: 10, staff_id: STAFF_ID }),
            }));
            assertEquals(res.status, 401);
            assertEquals(callsTo(calls, "/rpc/").length, 0);
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

Deno.test({
    name: "GET method: 405",
    ...T,
    fn: async () => {
        await withMockFetch([], async () => {
            const res = await handler(new Request("http://localhost/resolve-delivery-quote", { method: "GET" }));
            assertEquals(res.status, 405);
        });
    },
});
