// deno test --allow-env supabase/functions/_tests/createPaymentIntent.test.ts
//
// Mocked-Stripe tests for the create-payment-intent handler. The REAL handler
// runs; only the network is canned (Stripe API + PostgREST). Each test
// asserts both the HTTP response AND the exact requests our code sent to
// Stripe — amount in cents, idempotency key versioning, metadata, and the
// stale-PaymentIntent cancel path.
//
// Sanitizers are off because the handler intentionally fire-and-forgets the
// rate-limit cleanup DELETE; withMockFetch waits a tick so it lands in-mock.

import { assertEquals, assert, assertStringIncludes } from "jsr:@std/assert@1";
import { withMockFetch, jsonResponse, callsTo, type MockRoute, type RecordedCall } from "./mockFetch.ts";

Deno.env.set("SUPABASE_URL", "http://mock-supabase.local");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_mock_service_key");
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_mock_key_not_real");

const { handler } = await import("../create-payment-intent/handler.ts");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PENDING_ID = "11111111-2222-3333-4444-555555555555";

function pendingRow(overrides: Record<string, unknown> = {}) {
    return {
        id: PENDING_ID,
        order_number: "EDT-2026-1001",
        customer_name: "Prueba Cliente",
        customer_email: "cliente@example.com",
        customer_phone: "6105551234",
        customer_language: "es",
        total_amount: 60,
        status: "awaiting_payment",
        payment_intent_id: null,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        date_needed: "2026-08-05",
        time_needed: "14:00",
        cake_size: "8-round",
        filling: "fresa",
        delivery_option: "delivery",
        delivery_address: "600 W Marshall St, Norristown, PA 19401",
        delivery_fee: 5,
        delivery_quote_status: "flat",
        reference_image_path: null,
        image_review_status: "not_required",
        price_revision: 0,
        ...overrides,
    };
}

/** Standard PostgREST routes: no rate-limit hits, pending row as given. */
function dbRoutes(row: Record<string, unknown> | null, rateCount = 0): MockRoute[] {
    return [
        {
            method: "HEAD",
            match: "/rest/v1/payment_rate_limits",
            reply: () => new Response(null, { status: 200, headers: { "content-range": `*/${rateCount}` } }),
        },
        { method: "POST", match: "/rest/v1/payment_rate_limits", reply: () => new Response(null, { status: 201 }) },
        { method: "DELETE", match: "/rest/v1/payment_rate_limits", reply: () => new Response(null, { status: 204 }) },
        {
            method: "GET",
            match: "/rest/v1/pending_orders",
            reply: () => row
                ? jsonResponse(row)
                : jsonResponse({
                    code: "PGRST116",
                    details: "The result contains 0 rows",
                    hint: null,
                    message: "JSON object requested, multiple (or no) rows returned",
                }, 406),
        },
        { method: "PATCH", match: "/rest/v1/pending_orders", reply: () => new Response(null, { status: 204 }) },
    ];
}

function stripeCreateRoute(piId = "pi_mock_new"): MockRoute {
    return {
        method: "POST",
        match: /api\.stripe\.com\/v1\/payment_intents$/,
        reply: (call: RecordedCall) => {
            const params = new URLSearchParams(call.body ?? "");
            return jsonResponse({
                id: piId,
                object: "payment_intent",
                client_secret: `${piId}_secret_abc`,
                amount: Number(params.get("amount")),
                currency: params.get("currency"),
                status: "requires_payment_method",
            });
        },
    };
}

function request(body: unknown): Request {
    return new Request("http://localhost/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify(body),
    });
}

const T = { sanitizeOps: false, sanitizeResources: false };

// ---------------------------------------------------------------------------
// PaymentIntent creation
// ---------------------------------------------------------------------------

Deno.test({
    name: "flat $5 delivery order: creates PI for $60.00 with correct metadata + idempotency key",
    ...T,
    fn: async () => {
        const routes = [...dbRoutes(pendingRow()), stripeCreateRoute()];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body.id, "pi_mock_new");
            assertEquals(body.clientSecret, "pi_mock_new_secret_abc");

            const stripeCalls = callsTo(calls, "api.stripe.com");
            assertEquals(stripeCalls.length, 1);
            const create = stripeCalls[0];
            const params = new URLSearchParams(create.body ?? "");
            assertEquals(params.get("amount"), "6000");           // $60.00 in cents
            assertEquals(params.get("currency"), "usd");
            assertEquals(params.get("automatic_payment_methods[enabled]"), "true");
            assertEquals(params.get("metadata[pending_order_id]"), PENDING_ID);
            assertEquals(params.get("metadata[order_number]"), "EDT-2026-1001");
            assertEquals(params.get("metadata[delivery_fee]"), "5");
            assertEquals(params.get("metadata[total_amount]"), "60");
            assertEquals(params.get("receipt_email"), "cliente@example.com");
            assertEquals(create.headers["idempotency-key"], `pending_${PENDING_ID}_v0`);

            // PI id persisted back onto the pending row
            const patches = calls.filter((c) => c.method === "PATCH" && c.url.includes("pending_orders"));
            assertEquals(patches.length, 1);
            assertStringIncludes(patches[0].body ?? "", "pi_mock_new");
        });
    },
});

Deno.test({
    name: "pickup order: PI created normally (delivery gate does not touch pickup)",
    ...T,
    fn: async () => {
        const row = pendingRow({ delivery_option: "pickup", delivery_address: null, delivery_fee: 0, delivery_quote_status: "not_required", total_amount: 55 });
        const routes = [...dbRoutes(row), stripeCreateRoute("pi_pickup")];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 200);
            const params = new URLSearchParams(callsTo(calls, "api.stripe.com")[0].body ?? "");
            assertEquals(params.get("amount"), "5500");
        });
    },
});

// ---------------------------------------------------------------------------
// Payment gates — quote-required orders can never mint a PaymentIntent
// ---------------------------------------------------------------------------

Deno.test({
    name: "quote_required delivery order: 409 delivery_quote_required, ZERO Stripe calls",
    ...T,
    fn: async () => {
        const row = pendingRow({ delivery_quote_status: "quote_required", delivery_fee: 0, total_amount: 55 });
        await withMockFetch(dbRoutes(row), async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 409);
            const body = await res.json();
            assertEquals(body.code, "delivery_quote_required");
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

Deno.test({
    name: "image review enforced + not passed: 409 image_review_required, ZERO Stripe calls",
    ...T,
    fn: async () => {
        const row = pendingRow({ reference_image_path: "references/photo.jpg", image_review_status: "pending" });
        const routes = [
            ...dbRoutes(row),
            { method: "GET", match: "/rest/v1/business_settings", reply: () => jsonResponse({ image_review_mode: "enforce" }) },
        ];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 409);
            assertEquals((await res.json()).code, "image_review_required");
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

// ---------------------------------------------------------------------------
// PaymentIntent reuse and stale-amount invalidation
// ---------------------------------------------------------------------------

Deno.test({
    name: "existing PI with matching amount is reused — no new PI created",
    ...T,
    fn: async () => {
        const row = pendingRow({ payment_intent_id: "pi_existing" });
        const routes: MockRoute[] = [
            ...dbRoutes(row),
            {
                method: "GET",
                match: "/v1/payment_intents/pi_existing",
                reply: () => jsonResponse({ id: "pi_existing", amount: 6000, status: "requires_payment_method", client_secret: "pi_existing_secret" }),
            },
            stripeCreateRoute("pi_should_not_exist"),
        ];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 200);
            const body = await res.json();
            assertEquals(body.id, "pi_existing");
            assertEquals(body.clientSecret, "pi_existing_secret");
            const creates = calls.filter((c) => c.method === "POST" && /payment_intents$/.test(c.url));
            assertEquals(creates.length, 0);
        });
    },
});

Deno.test({
    name: "stale-amount PI after re-quote: canceled at Stripe, fresh PI at new amount with bumped idempotency key",
    ...T,
    fn: async () => {
        // Staff quoted $18.50 on a $55 cake -> total 73.50, price_revision 1,
        // but a stale $60 PI survived on the row (race). It must be canceled
        // and a fresh $73.50 PI created under the v1 idempotency scope.
        const row = pendingRow({ payment_intent_id: "pi_stale", total_amount: 73.5, price_revision: 1, delivery_quote_status: "quoted", delivery_fee: 18.5 });
        let cancelHits = 0;
        const routes: MockRoute[] = [
            ...dbRoutes(row),
            {
                method: "GET",
                match: "/v1/payment_intents/pi_stale",
                reply: () => jsonResponse({ id: "pi_stale", amount: 6000, status: "requires_payment_method", client_secret: "pi_stale_secret" }),
            },
            {
                method: "POST",
                match: "/v1/payment_intents/pi_stale/cancel",
                reply: () => { cancelHits++; return jsonResponse({ id: "pi_stale", status: "canceled" }); },
            },
            stripeCreateRoute("pi_fresh"),
        ];
        await withMockFetch(routes, async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 200);
            assertEquals((await res.json()).id, "pi_fresh");
            assertEquals(cancelHits, 1);
            const create = calls.find((c) => c.method === "POST" && /payment_intents$/.test(c.url))!;
            const params = new URLSearchParams(create.body ?? "");
            assertEquals(params.get("amount"), "7350");
            assertEquals(create.headers["idempotency-key"], `pending_${PENDING_ID}_v1`);
        });
    },
});

Deno.test({
    name: "stale PI cancel failing (404 at Stripe) is best-effort: fresh PI still created",
    ...T,
    fn: async () => {
        const row = pendingRow({ payment_intent_id: "pi_gone", total_amount: 73.5, price_revision: 1 });
        const routes: MockRoute[] = [
            ...dbRoutes(row),
            {
                method: "GET",
                match: "/v1/payment_intents/pi_gone",
                reply: () => jsonResponse({ id: "pi_gone", amount: 6000, status: "requires_payment_method", client_secret: "x" }),
            },
            {
                method: "POST",
                match: "/v1/payment_intents/pi_gone/cancel",
                reply: () => jsonResponse({ error: { type: "invalid_request_error", message: "No such payment_intent" } }, 404),
            },
            stripeCreateRoute("pi_fresh2"),
        ];
        await withMockFetch(routes, async () => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 200);
            assertEquals((await res.json()).id, "pi_fresh2");
        });
    },
});

Deno.test({
    name: "PI retrieve failing entirely falls through to creating a fresh PI",
    ...T,
    fn: async () => {
        const row = pendingRow({ payment_intent_id: "pi_vanished" });
        const routes: MockRoute[] = [
            ...dbRoutes(row),
            {
                method: "GET",
                match: "/v1/payment_intents/pi_vanished",
                reply: () => jsonResponse({ error: { type: "invalid_request_error", message: "No such payment_intent" } }, 404),
            },
            stripeCreateRoute("pi_recreated"),
        ];
        await withMockFetch(routes, async () => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 200);
            assertEquals((await res.json()).id, "pi_recreated");
        });
    },
});

// ---------------------------------------------------------------------------
// Order-state guards
// ---------------------------------------------------------------------------

Deno.test({
    name: "expired pending order: 410, no Stripe calls",
    ...T,
    fn: async () => {
        const row = pendingRow({ expires_at: new Date(Date.now() - 1000).toISOString() });
        await withMockFetch(dbRoutes(row), async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 410);
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

Deno.test({
    name: "already-promoted (paid) order: 409, no Stripe calls",
    ...T,
    fn: async () => {
        const row = pendingRow({ status: "promoted" });
        await withMockFetch(dbRoutes(row), async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 409);
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

Deno.test({
    name: "unknown pending_order_id: 404",
    ...T,
    fn: async () => {
        await withMockFetch(dbRoutes(null), async () => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 404);
        });
    },
});

Deno.test({
    name: "missing pending_order_id (legacy amount path): 400 PENDING_ORDER_REQUIRED, no Stripe calls",
    ...T,
    fn: async () => {
        await withMockFetch(dbRoutes(null), async (calls) => {
            const res = await handler(request({ amount: 0.5, metadata: { order_number: "EDT-1" } }));
            assertEquals(res.status, 400);
            assertEquals((await res.json()).code, "PENDING_ORDER_REQUIRED");
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

Deno.test({
    name: "amount over $10,000 cap: 400, no Stripe calls",
    ...T,
    fn: async () => {
        const row = pendingRow({ total_amount: 10001 });
        await withMockFetch(dbRoutes(row), async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 400);
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});

Deno.test({
    name: "IP over the rate limit: 429, no Stripe calls",
    ...T,
    fn: async () => {
        await withMockFetch(dbRoutes(pendingRow(), 10), async (calls) => {
            const res = await handler(request({ pending_order_id: PENDING_ID }));
            assertEquals(res.status, 429);
            assertEquals(res.headers.get("Retry-After"), "60");
            assertEquals(callsTo(calls, "api.stripe.com").length, 0);
        });
    },
});
