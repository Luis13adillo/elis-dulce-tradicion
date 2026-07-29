#!/usr/bin/env node
// =====================================================================
// Integration test matrix for the support-flows fix, run against the
// STAGING Supabase project (never production — it inserts rows and
// exhausts rate limits).
//
//   set -a; . ./.env.supabase-admin; set +a   # SUPABASE_ACCESS_TOKEN
//   node scripts/support-flows-staging-test.mjs
//
// Covers: successful submissions, validation failures, unauthorized
// (order/email mismatch), duplicate retries (idempotency), rate
// limiting, honeypot, notification failure (staging has no
// RESEND_API_KEY, so the guarded senders fail — submissions must still
// succeed with notification_sent=false), and the verify-payment
// non-Stripe paths (input validation, awaiting_payment,
// payment_failed). The verified:true whitelist is asserted in the prod
// smoke test (staging's Stripe test key is expired) and pinned by
// src/__tests__/supportFlows.test.ts.
// =====================================================================

const REF = process.env.STAGING_REF ?? "jfjqiuozcpuqpybguivv";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const FN = `https://${REF}.supabase.co/functions/v1`;
if (!TOKEN) {
    console.error("SUPABASE_ACCESS_TOKEN not set");
    process.exit(1);
}
if (REF === "bebmkekmzcrgeraeakmp") {
    console.error("Refusing to run against production");
    process.exit(1);
}

let passed = 0;
let failed = 0;
const check = (name, cond, extra = "") => {
    if (cond) {
        passed++;
        console.log(`  PASS  ${name}`);
    } else {
        failed++;
        console.log(`  FAIL  ${name} ${extra}`);
    }
};

async function sql(query) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
    });
    if (!res.ok) throw new Error(`sql failed ${res.status}: ${await res.text()}`);
    return res.json();
}

async function call(path, body) {
    const res = await fetch(`${FN}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    let json = null;
    try {
        json = await res.json();
    } catch {
        /* non-JSON */
    }
    return { status: res.status, json };
}

const uuid = () => crypto.randomUUID();

const TEST_ORDER = {
    order_number: "STG-TEST-9001",
    email: "staging-tester@example.com",
};

// ---------------------------------------------------------------------
// Reset state so the suite is rerunnable within the same hour.
// ---------------------------------------------------------------------
console.log("== reset staging test state");
await sql(`
  DELETE FROM submission_rate_limits;
  DELETE FROM contact_submissions WHERE email LIKE '%@staging-test.example%' OR email = '${TEST_ORDER.email}';
  DELETE FROM order_issues WHERE order_number = '${TEST_ORDER.order_number}';
  DELETE FROM pending_orders WHERE order_number IN ('STG-VERIFY-FAIL-1');
`);

// ---------------------------------------------------------------------
// Contact form
// ---------------------------------------------------------------------
console.log("== submit-contact");

{
    const r = await call("submit-contact", {
        name: "",
        email: "not-an-email",
        subject: "Nope",
        message: "",
        client_token: "not-a-uuid",
    });
    check(
        "validation failure -> 400 with field details",
        r.status === 400 &&
            r.json?.error === "validation_failed" &&
            Array.isArray(r.json?.details) &&
            r.json.details.length >= 4
    );
}

{
    const r = await call("submit-contact", {
        name: "Bot",
        email: "bot@staging-test.example",
        subject: "General",
        message: "spam",
        client_token: uuid(),
        honeypot: "I am a bot",
    });
    const rows = await sql(
        `SELECT count(*)::int AS n FROM contact_submissions WHERE email = 'bot@staging-test.example'`
    );
    check(
        "honeypot -> fake success, nothing stored",
        r.status === 200 && r.json?.success === true && r.json?.id === null && rows[0].n === 0
    );
}

const contactToken = uuid();
let contactId = null;
{
    const r = await call("submit-contact", {
        name: "Integration Tester",
        email: "cust@staging-test.example",
        phone: "(000) 111-2222",
        subject: "General",
        message: "First message from the integration suite.",
        attachment_path: "orders/contact-attachments_1753700000000_stgtst.jpg",
        client_token: contactToken,
    });
    contactId = r.json?.id ?? null;
    check(
        "successful submission -> 200 with id",
        r.status === 200 && r.json?.success === true && Number.isInteger(r.json?.id)
    );
    check(
        "notification failure is non-fatal and reported (no RESEND on staging)",
        r.json?.notification_sent === false
    );
    const rows = await sql(
        `SELECT name, ip_address, attachment_url, client_token FROM contact_submissions WHERE id = ${contactId}`
    );
    check(
        "row stored with real IP + path + token",
        rows.length === 1 &&
            rows[0].name === "Integration Tester" &&
            rows[0].ip_address !== "unknown" &&
            rows[0].attachment_url === "orders/contact-attachments_1753700000000_stgtst.jpg" &&
            rows[0].client_token === contactToken,
        JSON.stringify(rows[0] ?? {})
    );
}

{
    const r = await call("submit-contact", {
        name: "Integration Tester",
        email: "cust@staging-test.example",
        subject: "General",
        message: "First message from the integration suite.",
        client_token: contactToken,
    });
    const rows = await sql(
        `SELECT count(*)::int AS n FROM contact_submissions WHERE client_token = '${contactToken}'`
    );
    check(
        "duplicate retry -> deduped, same id, single row",
        r.status === 200 && r.json?.deduped === true && r.json?.id === contactId && rows[0].n === 1
    );
}

{
    // Bumps so far: success(1) + dupe(2). Limit is 5/hour/IP.
    let got429 = null;
    for (let i = 3; i <= 8; i++) {
        const r = await call("submit-contact", {
            name: "Rate Tester",
            email: `rate${i}@staging-test.example`,
            subject: "General",
            message: `rate limit probe ${i}`,
            client_token: uuid(),
        });
        if (r.status === 429) {
            got429 = { attempt: i, body: r.json };
            break;
        }
    }
    const rows = await sql(
        `SELECT count(*)::int AS n FROM contact_submissions WHERE email = 'rate6@staging-test.example'`
    );
    check(
        "6th submission in the window -> 429 rate_limited",
        got429?.attempt === 6 && got429?.body?.error === "rate_limited",
        JSON.stringify(got429)
    );
    check("rate-limited submission stored nothing", rows[0].n === 0);
}

// ---------------------------------------------------------------------
// Report a problem
// ---------------------------------------------------------------------
console.log("== submit-order-issue");

{
    const r = await call("submit-order-issue", {
        order_number: TEST_ORDER.order_number,
        email: "wrong-person@example.com",
        issue_category: "Other",
        issue_description: "I am not the customer on this order.",
        client_token: uuid(),
    });
    check(
        "unauthorized (email mismatch) -> 404 generic",
        r.status === 404 && r.json?.error === "order_not_found_or_email_mismatch"
    );
}

{
    const r = await call("submit-order-issue", {
        order_number: "NO-SUCH-ORDER-1",
        email: TEST_ORDER.email,
        issue_category: "Other",
        issue_description: "Order does not exist.",
        client_token: uuid(),
    });
    check(
        "unknown order -> same generic 404 (no oracle)",
        r.status === 404 && r.json?.error === "order_not_found_or_email_mismatch"
    );
}

{
    const r = await call("submit-order-issue", {
        order_number: TEST_ORDER.order_number,
        email: TEST_ORDER.email,
        issue_category: "Rant",
        issue_description: "",
        client_token: uuid(),
    });
    check(
        "validation failure -> 400",
        r.status === 400 && r.json?.error === "validation_failed"
    );
}

const issueToken = uuid();
let issueId = null;
{
    const r = await call("submit-order-issue", {
        order_number: TEST_ORDER.order_number,
        // deliberately different case + padding: server must match anyway
        email: "  STAGING-TESTER@example.com ",
        issue_category: "Quality issue",
        issue_description: "The cake arrived damaged (integration suite).",
        photo_paths: [
            "orders/order-issues_1753700000001_stgtst.jpg",
            "orders/order-issues_1753700000002_stgtst.jpg",
        ],
        client_token: issueToken,
    });
    issueId = r.json?.id ?? null;
    check(
        "successful issue report -> 200 with id",
        r.status === 200 && r.json?.success === true && Number.isInteger(r.json?.id)
    );
    check("issue notification failure is non-fatal (no RESEND)", r.json?.notification_sent === false);
    const rows = await sql(`
      SELECT customer_name, customer_email, order_id, status, priority, photo_urls, client_token
      FROM order_issues WHERE id = ${issueId}`);
    check(
        "identity copied from the ORDER row, not the request",
        rows.length === 1 &&
            rows[0].customer_name === "Staging Tester" &&
            rows[0].customer_email === "staging-tester@example.com" &&
            rows[0].status === "open" &&
            rows[0].priority === "medium",
        JSON.stringify(rows[0] ?? {})
    );
    check(
        "photo paths stored as text[]",
        Array.isArray(rows[0]?.photo_urls) && rows[0].photo_urls.length === 2
    );
}

{
    const r = await call("submit-order-issue", {
        order_number: TEST_ORDER.order_number,
        email: TEST_ORDER.email,
        issue_category: "Quality issue",
        issue_description: "The cake arrived damaged (integration suite).",
        client_token: issueToken,
    });
    const rows = await sql(
        `SELECT count(*)::int AS n FROM order_issues WHERE client_token = '${issueToken}'`
    );
    check(
        "duplicate issue retry -> deduped, single row",
        r.status === 200 && r.json?.deduped === true && r.json?.id === issueId && rows[0].n === 1
    );
}

// ---------------------------------------------------------------------
// verify-payment (non-Stripe paths; verified:true asserted in prod smoke)
// ---------------------------------------------------------------------
console.log("== verify-payment");

{
    const r = await call("verify-payment", { payment_intent_id: "pi_3AttackerSuppliedId" });
    check(
        "raw payment_intent_id path removed -> 400",
        r.status === 400 && !r.json?.order
    );
}

{
    const r = await call("verify-payment", { pending_order_id: "not-a-uuid" });
    check("invalid pending_order_id -> 400", r.status === 400);
}

{
    const r = await call("verify-payment", { pending_order_id: uuid() });
    check(
        "unknown pending id -> awaiting_payment, no data",
        r.status === 200 && r.json?.verified === false && r.json?.status === "awaiting_payment" && !r.json?.order
    );
}

{
    await sql(`
      INSERT INTO pending_orders (order_number, customer_name, customer_email, customer_phone,
        cake_size, filling, theme, date_needed, time_needed, total_amount, status, error_message)
      VALUES ('STG-VERIFY-FAIL-1', 'Verify Tester', 'verify@staging-test.example', '(000) 000-0000',
        'Medium', 'Tres Leches', 'Birthday', '2026-08-15', '14:00', 65.00, 'payment_failed',
        'Your card was declined. (staging test)')`);
    const rows = await sql(`SELECT id FROM pending_orders WHERE order_number = 'STG-VERIFY-FAIL-1'`);
    const r = await call("verify-payment", { pending_order_id: rows[0].id });
    check(
        "payment_failed pending -> clean failure state with decline message",
        r.status === 200 &&
            r.json?.verified === false &&
            r.json?.status === "payment_failed" &&
            typeof r.json?.error_message === "string" &&
            !r.json?.order
    );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
