// deno test supabase/functions/_tests/submissionValidation.test.ts
//
// Unit tests for the pure validation layer used by submit-contact and
// submit-order-issue. These run in CI-less local dev with plain `deno test`.

import {
    clientIpFrom,
    isEmail,
    isOrderNumber,
    isStoragePath,
    isUuid,
    maskEmail,
    validateContactPayload,
    validateOrderIssuePayload,
} from "../_shared/submissionValidation.ts";

const assert = (cond: boolean, msg: string) => {
    if (!cond) throw new Error(msg);
};

const TOKEN = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

const validContact = () => ({
    name: "María Pérez",
    email: "maria@example.com",
    phone: "(610) 555-1234",
    subject: "General",
    message: "Hola, quiero un pastel de tres leches.",
    attachment_path: "orders/contact-attachments_1753700000000_ab12cd.jpg",
    order_number: "EDT-2026-0042",
    client_token: TOKEN,
});

const validIssue = () => ({
    order_number: "EDT-2026-0042",
    email: "maria@example.com",
    issue_category: "Quality issue",
    issue_description: "The cake arrived damaged.",
    photo_paths: ["orders/order-issues_1753700000000_ab12cd.jpg"],
    client_token: TOKEN,
});

Deno.test("valid contact payload passes", () => {
    assert(validateContactPayload(validContact()).length === 0, "expected no errors");
});

Deno.test("contact payload without optional fields passes", () => {
    const p = validContact() as Record<string, unknown>;
    delete p.phone;
    delete p.attachment_path;
    delete p.order_number;
    assert(validateContactPayload(p).length === 0, "expected no errors");
});

Deno.test("contact rejects missing name / bad email / bad subject / empty message", () => {
    const errors = validateContactPayload({
        name: "   ",
        email: "not-an-email",
        subject: "Hacked",
        message: "",
        client_token: TOKEN,
    });
    const fields = errors.map((e) => e.field).sort();
    assert(JSON.stringify(fields) === JSON.stringify(["email", "message", "name", "subject"]),
        `unexpected fields: ${fields}`);
});

Deno.test("contact rejects over-length message and traversal attachment path", () => {
    const errors = validateContactPayload({
        ...validContact(),
        message: "x".repeat(5001),
        attachment_path: "orders/../private/secret.jpg",
    });
    const fields = errors.map((e) => e.field).sort();
    assert(JSON.stringify(fields) === JSON.stringify(["attachment_path", "message"]),
        `unexpected fields: ${fields}`);
});

Deno.test("contact rejects non-uuid client_token", () => {
    const errors = validateContactPayload({ ...validContact(), client_token: "abc" });
    assert(errors.some((e) => e.field === "client_token"), "expected client_token error");
});

Deno.test("valid order issue payload passes", () => {
    assert(validateOrderIssuePayload(validIssue()).length === 0, "expected no errors");
});

Deno.test("order issue rejects bad category, >3 photos, invalid paths", () => {
    const errors = validateOrderIssuePayload({
        ...validIssue(),
        issue_category: "Rant",
        photo_paths: ["orders/a.jpg", "orders/b.jpg", "orders/c.jpg", "orders/d.jpg"],
    });
    const fields = errors.map((e) => e.field).sort();
    assert(JSON.stringify(fields) === JSON.stringify(["issue_category", "photo_paths"]),
        `unexpected fields: ${fields}`);

    const errors2 = validateOrderIssuePayload({
        ...validIssue(),
        photo_paths: ["avatars/x.jpg"],
    });
    assert(errors2.some((e) => e.field === "photo_paths"), "expected photo_paths error for foreign folder");
});

Deno.test("order issue requires order number and email", () => {
    const errors = validateOrderIssuePayload({
        order_number: "!!",
        email: "nope",
        issue_category: "Other",
        issue_description: "d",
        client_token: TOKEN,
    });
    assert(errors.some((e) => e.field === "order_number"), "expected order_number error");
    assert(errors.some((e) => e.field === "email"), "expected email error");
});

Deno.test("primitive validators", () => {
    assert(isEmail("a@b.co"), "email");
    assert(!isEmail("a@b"), "email without tld");
    assert(isUuid(TOKEN), "uuid");
    assert(!isUuid("g" + TOKEN.slice(1)), "bad uuid");
    assert(isStoragePath("orders/temp_1_ab.jpg"), "path");
    assert(!isStoragePath("orders/"), "empty file");
    assert(!isStoragePath("orders/a/b.jpg"), "nested path");
    assert(isOrderNumber("EDT-2026-0042"), "order number");
    assert(!isOrderNumber("x"), "too-short order number");
});

Deno.test("clientIpFrom takes first x-forwarded-for hop, falls back to shared bucket", () => {
    assert(clientIpFrom(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" })) === "1.2.3.4", "first hop");
    assert(clientIpFrom(new Headers()) === "unknown", "fallback");
});

Deno.test("maskEmail matches the get_public_order style", () => {
    assert(maskEmail("maria@example.com") === "mar***@example.com", "mask");
    assert(maskEmail("ab@x.co") === "ab***@x.co", "short local part");
    assert(maskEmail("not-an-email") === null, "invalid");
    assert(maskEmail(null) === null, "null");
});
