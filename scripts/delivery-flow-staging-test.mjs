#!/usr/bin/env node
// =====================================================================
// Integration test matrix for the delivery flow (flat $5 within 5 miles,
// "Delivery Quote Required" beyond / unverifiable), run against the
// STAGING Supabase project — never production. It inserts rows, changes
// the staging STRIPE_WEBHOOK_SECRET, and (when the staging Stripe TEST
// key is valid) creates real Stripe TEST charges.
//
//   set -a; . ./.env.supabase-admin; set +a   # SUPABASE_ACCESS_TOKEN
//   node scripts/delivery-flow-staging-test.mjs
//
// Two tiers:
//   * Tier A: verdicts, fee enforcement, payment gating, quote
//     resolution, price_revision/PI-invalidation at the DB level,
//     signed-webhook promotion + retry dedup (synthetic PI ids), pickup
//     parity, direct-RPC bypass protection.
//   * Tier B: real PaymentIntent creation/amounts, real card confirm,
//     real stale-PI cancellation at Stripe.
//
// ELI CREDENTIAL GUARD (permanent, fail-closed, added 2026-07-29): the
// matrix refuses to run AT ALL — no skips — unless (a) the target is the
// Eli staging project jfjqiuozcpuqpybguivv, (b) the configured Stripe
// key is TEST-mode, and (c) Stripe confirms the key belongs to Eli's own
// sandbox account. A missing, expired, live-mode, or wrong-business key
// stops the run with an Eli-specific error. Never borrow or substitute
// credentials from any other project.
//
// Coverage maps to the goal spec of 2026-07-29 items 1-7 + bypass.
// =====================================================================

import crypto from "node:crypto";

const REF = process.env.STAGING_REF ?? "jfjqiuozcpuqpybguivv";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API = "https://api.supabase.com/v1";
const FN = `https://${REF}.supabase.co/functions/v1`;
const REST = `https://${REF}.supabase.co/rest/v1`;

if (!TOKEN) { console.error("SUPABASE_ACCESS_TOKEN not set"); process.exit(1); }
// Allowlist, not blocklist: the ONLY project this harness may touch is the
// Eli staging sandbox. Anything else (production included) is refused.
if (REF !== "jfjqiuozcpuqpybguivv") {
    console.error(`Refusing to run: pinned to Eli staging project jfjqiuozcpuqpybguivv, got "${REF}"`);
    process.exit(1);
}

const TEST_EMAIL = "delivery-test@example.com";
const NEAR_ADDRESS = "600 W Marshall St, Norristown, PA 19401";      // ~0.5 driving mi
const FAR_ADDRESS = "1 S Broad St, Philadelphia, PA 19107";           // ~18 driving mi
const GARBAGE_ADDRESS = "zzz asdfjkl 00000 nowhere lane";
const CAKE_PRICE = 55.0;                                              // staging '8-round'

let passed = 0, failed = 0, skipped = 0;
const check = (name, cond, extra = "") => {
    if (cond) { passed++; console.log(`  PASS  ${name}`); }
    else { failed++; console.log(`  FAIL  ${name} ${extra}`); }
};
const skip = (name, why) => { skipped++; console.log(`  SKIP  ${name} (${why})`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function mgmt(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(opts.headers ?? {}) },
    });
    const text = await res.text();
    let jsonBody = null;
    try { jsonBody = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, json: jsonBody, text };
}

async function sql(query) {
    const r = await mgmt(`/projects/${REF}/database/query`, { method: "POST", body: JSON.stringify({ query }) });
    if (r.status !== 200 && r.status !== 201) throw new Error(`sql ${r.status}: ${r.text}`);
    return r.json;
}

async function call(path, body, headers = {}) {
    const res = await fetch(`${FN}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
    });
    let jsonBody = null;
    try { jsonBody = await res.json(); } catch { /* non-JSON */ }
    // create-payment-intent rate-limits 10 calls/min per IP. A single matrix
    // run stays under that, but a run started within a minute of a previous
    // one (watcher + manual, or two back-to-back reruns) overlaps the window
    // and 429s its tail calls. That's the limiter working, not a product bug —
    // wait out the advertised Retry-After once and repeat the call so
    // adjacent runs can't poison each other's results.
    if (res.status === 429 && path === "create-payment-intent") {
        const wait = (Number(jsonBody?.retryAfter) || 60) + 2;
        console.log(`  (rate-limited by an adjacent run — waiting ${wait}s and retrying once)`);
        await sleep(wait * 1000);
        return call(path, body, headers);
    }
    return { status: res.status, json: jsonBody };
}

// Stripe-style signed webhook delivery (staging's STRIPE_WEBHOOK_SECRET is
// set to a value this run generated, so we can sign synthetic events and
// exercise the REAL verification + dedup + promotion path).
function signedWebhook(secret, eventObj) {
    const payload = JSON.stringify(eventObj);
    const t = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    return { payload, header: `t=${t},v1=${v1}` };
}

function succeededEvent(evtId, pi) {
    return {
        id: evtId,
        object: "event",
        api_version: "2023-10-16",
        type: "payment_intent.succeeded",
        created: Math.floor(Date.now() / 1000),
        data: { object: pi },
    };
}

function orderPayload({ address, fee, total, idem, delivery = true }) {
    const d = new Date(Date.now() + 5 * 86400 * 1000).toISOString().slice(0, 10);
    return {
        customer_name: "Delivery Test",
        customer_email: TEST_EMAIL,
        customer_phone: "+16105550123",
        customer_language: "en",
        cake_size: '8" Round',
        cake_size_value: "8-round",
        filling: "Vanilla",
        filling_values: [],
        theme: "Delivery flow test",
        dedication: "",
        reference_image_path: "",
        date_needed: d,
        time_needed: "14:00",
        delivery_option: delivery ? "delivery" : "pickup",
        delivery_address: delivery ? address : "",
        delivery_fee: fee,
        subtotal: total - fee,
        tax_amount: 0,
        consent_given: true,
        consent_timestamp: new Date().toISOString(),
        total_amount: total,
        premium_filling_upcharge: 0,
        allergies: null,
        bread_type: "Vanilla",
        bread_type_value: "vanilla",
        servings: null,
        recipient_name: null,
        client_idempotency_key: idem,
    };
}

// ---------------------------------------------------------------------
console.log("== setup");
// ---------------------------------------------------------------------

// Project API keys (never printed). Newer stacks inject the sb_secret_*
// key as the functions' SUPABASE_SERVICE_ROLE_KEY, so prefer that.
const keysResp = await mgmt(`/projects/${REF}/api-keys?reveal=true`);
const pick = (pred) => keysResp.json?.find?.(pred)?.api_key;
const anonKey = pick((k) => k.name === "anon") ?? pick((k) => k.type === "publishable");
const serviceKey = pick((k) => k.type === "secret") ?? pick((k) => k.name === "service_role");
if (!anonKey || !serviceKey) { console.error("could not fetch staging api keys"); process.exit(1); }

// Staff id for quote attribution.
const staff = await sql(`select user_id from user_profiles where role in ('owner','baker') limit 1`);
const STAFF_ID = staff?.[0]?.user_id;
if (!STAFF_ID) { console.error("no staff user in staging"); process.exit(1); }

// Known webhook signing secret for this run (staging only).
const WEBHOOK_SECRET = "whsec_" + crypto.randomBytes(24).toString("hex");
const setSecret = await mgmt(`/projects/${REF}/secrets`, {
    method: "POST",
    body: JSON.stringify([{ name: "STRIPE_WEBHOOK_SECRET", value: WEBHOOK_SECRET }]),
});
check("setup: staging STRIPE_WEBHOOK_SECRET set for this run", setSecret.status < 300, `status=${setSecret.status}`);
console.log("  (waiting 10s for function secret propagation)");
await sleep(10_000);

// -----------------------------------------------------------------
// ELI CREDENTIAL GUARD — permanent, fail-closed. The run stops here
// (no tests, no skips) unless Stripe itself confirms the staging key
// is a TEST-mode credential belonging to Eli's own sandbox account.
// The account id below is the non-secret account fragment of Eli's
// sandbox keys; the secret key value is never fetched or printed.
// -----------------------------------------------------------------
const ELI_SANDBOX_ACCOUNT_ID = "acct_1SsSVrCFnlaVsEnt"; // Eli's Dulce Tradicion — Stripe sandbox
const eliStop = (why) => {
    console.error(`\nELI GUARD: refusing to run — ${why}.`);
    console.error("This matrix only runs against Eli's Dulce Tradicion Stripe sandbox on staging project jfjqiuozcpuqpybguivv.");
    console.error("Fix: in Eli's Stripe sandbox (Developers → API keys), copy the sk_test_ secret key and set it as STRIPE_SECRET_KEY in Supabase staging → Edge Functions → Secrets. Never use MT Barbershop, Neurovia, or any other business's credential.");
    process.exit(1);
};
const idn = await call("test-stripe-helper", { action: "identity" }, { Authorization: `Bearer ${serviceKey}` });
if (idn.status === 401) eliStop("staging test-stripe-helper rejected the service key");
if (idn.status === 500) eliStop("no STRIPE_SECRET_KEY is configured on the staging project (Eli sandbox key MISSING)");
if (idn.status === 403) eliStop("the staging STRIPE_SECRET_KEY is a LIVE-mode key — remove it; only Eli's sandbox TEST key is allowed");
const idnErr = String(idn.json?.stripe_error ?? idn.json?.error ?? "");
if (/expired api key/i.test(idnErr)) eliStop("the staging STRIPE_SECRET_KEY is EXPIRED — mint a fresh key in Eli's Stripe sandbox");
if (idn.status !== 200 || !idn.json?.account_id) eliStop(`Stripe would not confirm the key's identity (${idnErr.slice(0, 80) || `status ${idn.status}`})`);
if (idn.json.account_id !== ELI_SANDBOX_ACCOUNT_ID) {
    eliStop(`the staging key belongs to Stripe account ${idn.json.account_id}, not Eli's sandbox ${ELI_SANDBOX_ACCOUNT_ID} — wrong business's credential`);
}
check("setup: Stripe key is TEST-mode and belongs to Eli's sandbox account", true);
console.log(`  Stripe identity: ${idn.json.account_id}${idn.json.display_name ? ` (${idn.json.display_name})` : ""} — TEST mode, key prefix ${idn.json.key_prefix}`);
const STRIPE_ALIVE = true; // the guard above exits otherwise — Tier B always runs

// Clean slate for rerunnability.
await sql(`delete from orders where customer_email = '${TEST_EMAIL}'`);
await sql(`delete from pending_orders where customer_email = '${TEST_EMAIL}'`);

// A create-payment-intent call whose GATE opened: 200 with clientSecret
// (key alive) or a Stripe key error (gate passed, Stripe refused the key).
function gateOpened(resp) {
    if (resp.status === 200 && resp.json?.clientSecret) return true;
    return /expired api key|invalid api key/i.test(String(resp.json?.error ?? ""));
}

// ---------------------------------------------------------------------
console.log("== T1: verified address within 5 miles -> flat $5 + payment");
// ---------------------------------------------------------------------

const q1 = await call("delivery-quote", { address: NEAR_ADDRESS });
check("T1a delivery-quote: flat verdict", q1.status === 200 && q1.json?.status === "flat", JSON.stringify(q1.json));
check("T1a delivery-quote: fee is $5", q1.json?.fee === 5);
check("T1a delivery-quote: distance <= 5 miles", Number(q1.json?.distance_miles) > 0 && Number(q1.json?.distance_miles) <= 5, `distance=${q1.json?.distance_miles}`);

await sleep(1200); // Nominatim fair-use spacing
const o1 = await call("create-pending-order", orderPayload({ address: NEAR_ADDRESS, fee: 5, total: CAKE_PRICE + 5, idem: crypto.randomUUID() }));
check("T1b create-pending-order: created flat", o1.status === 200 && o1.json?.delivery_quote_status === "flat", JSON.stringify(o1.json));
check("T1b total includes the $5 fee", Number(o1.json?.total_amount) === CAKE_PRICE + 5, `total=${o1.json?.total_amount}`);
const P1 = o1.json?.pending_order_id;
const row1 = await sql(`select delivery_fee::float as fee, delivery_distance_miles::float as mi, delivery_verify_method as m from pending_orders where id='${P1}'`);
check("T1b server stored fee $5 + verified distance + method", row1[0]?.fee === 5 && row1[0]?.mi > 0 && row1[0]?.mi <= 5 && !!row1[0]?.m, JSON.stringify(row1));

const pi1 = await call("create-payment-intent", { pending_order_id: P1 });
check("T1c payment gate OPEN for flat orders", gateOpened(pi1), JSON.stringify(pi1.json));
let PI1 = pi1.json?.id ?? null;

if (STRIPE_ALIVE && PI1) {
    const conf1 = await call("test-stripe-helper", { action: "confirm", payment_intent_id: PI1 }, { Authorization: `Bearer ${serviceKey}` });
    check("T1d Stripe TEST payment succeeded", conf1.json?.status === "succeeded", JSON.stringify(conf1.json));
    check("T1d charged amount is $60.00", conf1.json?.amount === 6000, `amount=${conf1.json?.amount}`);
} else {
    skip("T1d Stripe TEST payment succeeded @ $60.00", "staging Stripe TEST key expired — set a fresh sk_test and rerun");
    PI1 = "pi_synthetic_" + crypto.randomBytes(8).toString("hex");
}

// Promote through the REAL webhook path with a signed delivery.
const piObj1 = { id: PI1, object: "payment_intent", amount: 6000, currency: "usd", status: "succeeded", metadata: { pending_order_id: P1 } };
const evt1 = "evt_test_" + crypto.randomBytes(12).toString("hex");
const s1 = signedWebhook(WEBHOOK_SECRET, succeededEvent(evt1, piObj1));
const w1 = await call("stripe-webhook", s1.payload, { "stripe-signature": s1.header });
check("T1e signed webhook accepted + processed", w1.status === 200, JSON.stringify(w1.json));
const promoted1 = await sql(`select o.order_number, o.payment_status, o.delivery_option, o.delivery_fee::float as fee, o.total_amount::float as total from orders o where o.pending_order_id = '${P1}'`);
check("T1f order promoted with $5 delivery fee on it", promoted1.length === 1 && promoted1[0].fee === 5 && promoted1[0].total === 60 && promoted1[0].payment_status === "paid", JSON.stringify(promoted1));

// ---------------------------------------------------------------------
console.log("== T6: webhook retry + promotion idempotency");
// ---------------------------------------------------------------------
const w1b = await call("stripe-webhook", s1.payload, { "stripe-signature": s1.header });
check("T6a duplicate delivery returns 200 (deduped)", w1b.status === 200, JSON.stringify(w1b.json));
const dupCount = await sql(`select count(*)::int as n from orders where pending_order_id = '${P1}'`);
check("T6b still exactly one orders row", dupCount[0].n === 1, JSON.stringify(dupCount));
const evtRow = await sql(`select status from stripe_webhook_events where event_id = '${evt1}'`);
check("T6c event recorded as processed", evtRow[0]?.status === "processed", JSON.stringify(evtRow));
const reProm = await sql(`select promote_pending_order('${P1}', '${PI1}', '${P1}') as r`);
check("T6d promote_pending_order re-run reports already_promoted", reProm[0]?.r?.already_promoted === true, JSON.stringify(reProm[0]?.r?.already_promoted));

// ---------------------------------------------------------------------
console.log("== T2: verified address over 5 miles -> quote required, payment blocked");
// ---------------------------------------------------------------------
await sleep(1200);
const q2 = await call("delivery-quote", { address: FAR_ADDRESS });
check("T2a delivery-quote: quote_required", q2.status === 200 && q2.json?.status === "quote_required", JSON.stringify(q2.json));
check("T2a distance measured > 5 miles", Number(q2.json?.distance_miles) > 5, `distance=${q2.json?.distance_miles}`);

await sleep(1200);
const o2 = await call("create-pending-order", orderPayload({ address: FAR_ADDRESS, fee: 0, total: CAKE_PRICE, idem: crypto.randomUUID() }));
check("T2b created quote_required, fee 0", o2.status === 200 && o2.json?.delivery_quote_status === "quote_required" && Number(o2.json?.delivery_fee) === 0, JSON.stringify(o2.json));
check("T2b total excludes delivery (cake only)", Number(o2.json?.total_amount) === CAKE_PRICE, `total=${o2.json?.total_amount}`);
const P2 = o2.json?.pending_order_id;

const pi2 = await call("create-payment-intent", { pending_order_id: P2 });
check("T2c payment REFUSED with delivery_quote_required", pi2.status === 409 && pi2.json?.code === "delivery_quote_required", JSON.stringify(pi2.json));

// ---------------------------------------------------------------------
console.log("== T3: unverifiable address -> quote required, payment blocked");
// ---------------------------------------------------------------------
await sleep(1200);
const o3 = await call("create-pending-order", orderPayload({ address: GARBAGE_ADDRESS, fee: 0, total: CAKE_PRICE, idem: crypto.randomUUID() }));
check("T3a created quote_required (distance unverifiable)", o3.status === 200 && o3.json?.delivery_quote_status === "quote_required", JSON.stringify(o3.json));
const P3 = o3.json?.pending_order_id;
const pi3 = await call("create-payment-intent", { pending_order_id: P3 });
check("T3b payment REFUSED with delivery_quote_required", pi3.status === 409 && pi3.json?.code === "delivery_quote_required", JSON.stringify(pi3.json));
const dist3 = await sql(`select delivery_distance_miles, delivery_quote_status from pending_orders where id = '${P3}'`);
check("T3c row stored with no distance", dist3[0]?.delivery_distance_miles === null, JSON.stringify(dist3));

// ---------------------------------------------------------------------
console.log("== T4: staff enters quote -> payment opens at the new amount");
// ---------------------------------------------------------------------
const r4 = await call("resolve-delivery-quote",
    { pending_order_id: P2, delivery_fee: 18.5, notes: "test quote", staff_id: STAFF_ID },
    { Authorization: `Bearer ${serviceKey}` });
check("T4a quote saved", r4.status === 200 && r4.json?.success === true, JSON.stringify(r4.json));
check("T4a new total = cake + quote (73.50)", Number(r4.json?.total_amount) === 73.5, `total=${r4.json?.total_amount}`);
const rev4 = await sql(`select price_revision, delivery_quote_status, delivery_fee::float as fee, total_amount::float as total, payment_link_sent_at is not null as link_stamped from pending_orders where id = '${P2}'`);
check("T4b price_revision=1, status quoted, link window stamped", rev4[0]?.price_revision === 1 && rev4[0]?.delivery_quote_status === "quoted" && rev4[0]?.link_stamped === true, JSON.stringify(rev4));

const pi4 = await call("create-payment-intent", { pending_order_id: P2 });
check("T4c payment gate now OPEN", gateOpened(pi4), JSON.stringify(pi4.json));
let PI4 = pi4.json?.id ?? null;
if (STRIPE_ALIVE && PI4) {
    const ret4 = await call("test-stripe-helper", { action: "retrieve", payment_intent_id: PI4 }, { Authorization: `Bearer ${serviceKey}` });
    check("T4d new PaymentIntent amount is $73.50", ret4.json?.amount === 7350, JSON.stringify(ret4.json));
} else {
    skip("T4d new PaymentIntent amount is $73.50", "Stripe TEST key expired");
    // Simulate the stored PI so the re-quote invalidation logic is exercised
    // at the DB level (this is exactly what create-payment-intent persists).
    PI4 = "pi_synthetic_" + crypto.randomBytes(8).toString("hex");
    await sql(`update pending_orders set payment_intent_id = '${PI4}' where id = '${P2}'`);
}

// ---------------------------------------------------------------------
console.log("== T5: re-quote invalidates the stale PaymentIntent");
// ---------------------------------------------------------------------
const r5 = await call("resolve-delivery-quote",
    { pending_order_id: P2, delivery_fee: 25, notes: "corrected quote", staff_id: STAFF_ID },
    { Authorization: `Bearer ${serviceKey}` });
check("T5a re-quote saved (fee $25, total $80)", r5.status === 200 && Number(r5.json?.total_amount) === 80, JSON.stringify(r5.json));
check("T5a old PI reported for cancellation", r5.json?.old_payment_intent_id === PI4, `old=${r5.json?.old_payment_intent_id} expected=${PI4}`);
const inv5 = await sql(`select payment_intent_id, price_revision from pending_orders where id = '${P2}'`);
check("T5b stored PI invalidated (NULL) + price_revision=2", inv5[0]?.payment_intent_id === null && inv5[0]?.price_revision === 2, JSON.stringify(inv5));

if (STRIPE_ALIVE) {
    const ret5 = await call("test-stripe-helper", { action: "retrieve", payment_intent_id: PI4 }, { Authorization: `Bearer ${serviceKey}` });
    check("T5c stale PI is canceled at Stripe", ret5.json?.status === "canceled", JSON.stringify(ret5.json));
    const conf5 = await call("test-stripe-helper", { action: "confirm", payment_intent_id: PI4 }, { Authorization: `Bearer ${serviceKey}` });
    check("T5d stale PI cannot be charged", conf5.status !== 200 || conf5.json?.status !== "succeeded", JSON.stringify(conf5.json));
} else {
    skip("T5c stale PI canceled at Stripe", "Stripe TEST key expired");
    skip("T5d stale PI cannot be charged (Stripe confirm refused)", "Stripe TEST key expired");
}

const pi5 = await call("create-payment-intent", { pending_order_id: P2 });
check("T5e fresh payment attempt gate OPEN after re-quote", gateOpened(pi5), JSON.stringify(pi5.json));
let PI5 = pi5.json?.id ?? null;
if (STRIPE_ALIVE && PI5) {
    const ret5b = await call("test-stripe-helper", { action: "retrieve", payment_intent_id: PI5 }, { Authorization: `Bearer ${serviceKey}` });
    check("T5f fresh PI is new + carries $80.00", PI5 !== PI4 && ret5b.json?.amount === 8000, JSON.stringify(ret5b.json));
    const conf5b = await call("test-stripe-helper", { action: "confirm", payment_intent_id: PI5 }, { Authorization: `Bearer ${serviceKey}` });
    check("T5g payment of the quoted total succeeds", conf5b.json?.status === "succeeded", JSON.stringify(conf5b.json));
} else {
    skip("T5f fresh PI carries $80.00", "Stripe TEST key expired");
    skip("T5g payment of the quoted total succeeds", "Stripe TEST key expired");
    PI5 = "pi_synthetic_" + crypto.randomBytes(8).toString("hex");
}

// Promotion with the quoted fee — real webhook path, signed delivery.
const piObj5 = { id: PI5, object: "payment_intent", amount: 8000, currency: "usd", status: "succeeded", metadata: { pending_order_id: P2 } };
const s5 = signedWebhook(WEBHOOK_SECRET, succeededEvent("evt_test_" + crypto.randomBytes(12).toString("hex"), piObj5));
const w5 = await call("stripe-webhook", s5.payload, { "stripe-signature": s5.header });
const promoted5 = await sql(`select delivery_fee::float as fee, total_amount::float as total, payment_status from orders where pending_order_id = '${P2}'`);
check("T5h promoted with quoted fee $25 / total $80", w5.status === 200 && promoted5[0]?.fee === 25 && promoted5[0]?.total === 80 && promoted5[0]?.payment_status === "paid", JSON.stringify(promoted5));

// ---------------------------------------------------------------------
console.log("== T7: pickup orders unchanged");
// ---------------------------------------------------------------------
const o7 = await call("create-pending-order", orderPayload({ address: "", fee: 0, total: CAKE_PRICE, idem: crypto.randomUUID(), delivery: false }));
check("T7a pickup created, not_required, fee 0", o7.status === 200 && o7.json?.delivery_quote_status === "not_required" && Number(o7.json?.total_amount) === CAKE_PRICE, JSON.stringify(o7.json));
const P7 = o7.json?.pending_order_id;
const pi7 = await call("create-payment-intent", { pending_order_id: P7 });
check("T7b pickup payment gate OPEN immediately", gateOpened(pi7), JSON.stringify(pi7.json));
let PI7 = pi7.json?.id ?? null;
if (STRIPE_ALIVE && PI7) {
    const conf7 = await call("test-stripe-helper", { action: "confirm", payment_intent_id: PI7 }, { Authorization: `Bearer ${serviceKey}` });
    check("T7c pickup payment succeeds at $55.00", conf7.json?.status === "succeeded" && conf7.json?.amount === 5500, JSON.stringify(conf7.json));
} else {
    skip("T7c pickup payment succeeds at $55.00", "Stripe TEST key expired");
    PI7 = "pi_synthetic_" + crypto.randomBytes(8).toString("hex");
}
const piObj7 = { id: PI7, object: "payment_intent", amount: 5500, currency: "usd", status: "succeeded", metadata: { pending_order_id: P7 } };
const s7 = signedWebhook(WEBHOOK_SECRET, succeededEvent("evt_test_" + crypto.randomBytes(12).toString("hex"), piObj7));
const w7 = await call("stripe-webhook", s7.payload, { "stripe-signature": s7.header });
const promoted7 = await sql(`select delivery_option, delivery_fee::float as fee, total_amount::float as total from orders where pending_order_id = '${P7}'`);
check("T7d pickup promoted unchanged (fee 0, total $55)", w7.status === 200 && promoted7[0]?.delivery_option === "pickup" && promoted7[0]?.fee === 0 && promoted7[0]?.total === 55, JSON.stringify(promoted7));

// ---------------------------------------------------------------------
console.log("== T8: cached-client path (direct RPC) can never mint a flat fee");
// ---------------------------------------------------------------------
const rpcHeaders = { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" };
const rpcBad = await fetch(`${REST}/rpc/create_pending_order`, {
    method: "POST", headers: rpcHeaders,
    body: JSON.stringify({ payload: orderPayload({ address: NEAR_ADDRESS, fee: 5, total: CAKE_PRICE + 5, idem: crypto.randomUUID() }) }),
});
const rpcBadBody = await rpcBad.json().catch(() => null);
check("T8a direct RPC claiming a $5 fee is REJECTED (total mismatch)", rpcBad.status >= 400, JSON.stringify(rpcBadBody)?.slice(0, 120));

const rpcOk = await fetch(`${REST}/rpc/create_pending_order`, {
    method: "POST", headers: rpcHeaders,
    body: JSON.stringify({ payload: orderPayload({ address: NEAR_ADDRESS, fee: 0, total: CAKE_PRICE, idem: crypto.randomUUID() }) }),
});
const rpcOkBody = await rpcOk.json().catch(() => null);
check("T8b direct RPC delivery order is forced to quote_required", rpcOk.status === 200 && rpcOkBody?.delivery_quote_status === "quote_required", JSON.stringify(rpcOkBody));
if (rpcOkBody?.pending_order_id) {
    const pi8 = await call("create-payment-intent", { pending_order_id: rpcOkBody.pending_order_id });
    check("T8c ...and its payment is blocked until quoted", pi8.status === 409 && pi8.json?.code === "delivery_quote_required", JSON.stringify(pi8.json));
}
const rpcSecure = await fetch(`${REST}/rpc/create_pending_order_secure`, {
    method: "POST", headers: rpcHeaders,
    body: JSON.stringify({ payload: {}, p_verdict: { status: "flat", fee: 5, distance_miles: 1 } }),
});
check("T8d create_pending_order_secure is NOT callable by anon", rpcSecure.status === 401 || rpcSecure.status === 403 || rpcSecure.status === 404, `status=${rpcSecure.status}`);

// ---------------------------------------------------------------------
console.log(`\n== RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped${STRIPE_ALIVE ? "" : "  (Tier B blocked: staging STRIPE_SECRET_KEY is expired — set a fresh Stripe TEST secret key and rerun)"}`);
process.exit(failed === 0 ? 0 : 1);
