// =====================================================================
// submit-order-issue — the ONLY write path for the report-a-problem form.
//
// The old flow was unusable and unsafe in equal measure: the page tried
// to find the order with the staff-wide getAllOrders() query (anon has
// no grant on orders — so the form never rendered for guests), and the
// insert relied on anon table grants that don't exist on prod.
//
// This function:
//   * Validates every field (submissionValidation.ts).
//   * Rate-limits by real client IP BEFORE any order lookup, so it can't
//     be used to probe order numbers.
//   * AUTHORIZES the report: the caller must present the order number
//     AND the email the order was placed with. Customer identity fields
//     on the stored issue are copied from the order row server-side —
//     never from the client.
//   * Is idempotent on client_token.
//   * Invokes send-order-issue-notification with the service role
//     (customers could never call it themselves post-lockdown), with
//     short-lived signed URLs for the photos. Notification failure is
//     reported, never fatal.
// =====================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
    clientIpFrom,
    validateOrderIssuePayload,
} from "../_shared/submissionValidation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STORAGE_BUCKET = "reference-images";
const EMAIL_SIGNED_URL_TTL_SECONDS = 7 * 24 * 3600;
const RATE_LIMIT = 5;
const RATE_WINDOW_SECONDS = 3600;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("submit-order-issue: missing SUPABASE_URL / SERVICE_ROLE_KEY");
        return json({ error: "Server misconfiguration" }, 500);
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body.honeypot === "string" && body.honeypot.trim() !== "") {
        return json({ success: true, id: null, notification_sent: false }, 200);
    }

    const errors = validateOrderIssuePayload(body);
    if (errors.length > 0) {
        return json({ error: "validation_failed", details: errors }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ip = clientIpFrom(req.headers);

    // Rate limit BEFORE the order lookup — this endpoint must not become
    // an order-number/email oracle.
    const { data: allowed, error: rateErr } = await supabase.rpc("bump_submission_rate", {
        p_scope: "order_issue",
        p_key: ip,
        p_limit: RATE_LIMIT,
        p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateErr) {
        console.error("submit-order-issue: rate limit check failed:", rateErr.message);
    } else if (allowed === false) {
        return json({ error: "rate_limited" }, 429);
    }

    // Authorization: order number + the email the order was placed with.
    // One generic error for "no such order" and "wrong email" — do not
    // reveal which.
    const orderNumber = (body.order_number as string).trim();
    const email = (body.email as string).trim().toLowerCase();

    const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, customer_email, customer_phone")
        .eq("order_number", orderNumber)
        .maybeSingle();

    if (orderErr) {
        console.error("submit-order-issue: order lookup failed:", orderErr.message);
        return json({ error: "Could not process your report. Please try again." }, 500);
    }
    if (!order || (order.customer_email ?? "").trim().toLowerCase() !== email) {
        return json({ error: "order_not_found_or_email_mismatch" }, 404);
    }

    const clientToken = body.client_token as string;

    const { data: existing } = await supabase
        .from("order_issues")
        .select("id")
        .eq("client_token", clientToken)
        .maybeSingle();
    if (existing) {
        return json({ success: true, id: existing.id, deduped: true, notification_sent: false }, 200);
    }

    const photoPaths = Array.isArray(body.photo_paths) ? (body.photo_paths as string[]) : [];

    const row = {
        order_id: order.id,
        order_number: order.order_number,
        // Identity comes from the order row, not the request body.
        customer_name: order.customer_name,
        customer_email: order.customer_email,
        customer_phone: order.customer_phone ?? null,
        issue_category: body.issue_category as string,
        issue_description: (body.issue_description as string).trim(),
        // Bucket-relative paths; the private bucket means every viewer
        // (dashboard, email) goes through signed URLs.
        photo_urls: photoPaths.length > 0 ? photoPaths : null,
        status: "open",
        priority: "medium",
        client_token: clientToken,
    };

    const { data: issue, error: insertErr } = await supabase
        .from("order_issues")
        .insert(row)
        .select()
        .single();

    if (insertErr) {
        if (insertErr.code === "23505") {
            const { data: winner } = await supabase
                .from("order_issues")
                .select("id")
                .eq("client_token", clientToken)
                .maybeSingle();
            if (winner) {
                return json({ success: true, id: winner.id, deduped: true, notification_sent: false }, 200);
            }
        }
        console.error("submit-order-issue: insert failed:", insertErr.message);
        return json({ error: "Could not save your report. Please try again." }, 500);
    }

    let notificationSent = false;
    try {
        const signedPhotoUrls: string[] = [];
        for (const path of photoPaths) {
            const { data: signed } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(path, EMAIL_SIGNED_URL_TTL_SECONDS);
            if (signed?.signedUrl) signedPhotoUrls.push(signed.signedUrl);
        }

        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-order-issue-notification`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                issue: {
                    id: issue.id,
                    order_id: issue.order_id,
                    order_number: issue.order_number,
                    customer_name: issue.customer_name,
                    customer_email: issue.customer_email,
                    customer_phone: issue.customer_phone ?? undefined,
                    issue_category: issue.issue_category,
                    issue_description: issue.issue_description,
                    photo_urls: signedPhotoUrls.length > 0 ? signedPhotoUrls : undefined,
                    priority: issue.priority,
                    created_at: issue.created_at,
                },
            }),
        });
        notificationSent = res.ok;
        if (!res.ok) {
            console.error("submit-order-issue: notification failed:", res.status, await res.text());
        }
    } catch (err) {
        console.error("submit-order-issue: notification error:", (err as Error).message);
    }

    return json({ success: true, id: issue.id, notification_sent: notificationSent }, 200);
});
