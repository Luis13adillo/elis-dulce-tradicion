// =====================================================================
// submit-contact — the ONLY write path for the public contact form.
//
// Why an Edge Function instead of a direct table insert from the browser:
//   * anon never had (and must not get) grants on contact_submissions —
//     INSERT ... RETURNING would require SELECT, which would let anyone
//     read every submission's PII.
//   * send-contact-notification is staff/service-only since the
//     2026-07-28 lockdown; a browser caller can no longer trigger it.
//     This function invokes it with the service role after a successful
//     insert, so the owner reliably gets the email.
//   * Rate limiting needs the real client IP (x-forwarded-for), which
//     only exists server-side.
//
// Guarantees:
//   * Validates every field (submissionValidation.ts).
//   * Honeypot submissions get a fake success and write nothing.
//   * 5 submissions per hour per IP (bump_submission_rate).
//   * Idempotent on client_token — a retried request returns the
//     original row instead of inserting a duplicate.
//   * The DB row is the source of truth: notification failure never
//     fails the submission, but is reported as notification_sent=false
//     and logged.
// =====================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
    clientIpFrom,
    validateContactPayload,
} from "../_shared/submissionValidation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STORAGE_BUCKET = "reference-images";
// Long enough for the owner to open the email later in the week.
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
        console.error("submit-contact: missing SUPABASE_URL / SERVICE_ROLE_KEY");
        return json({ error: "Server misconfiguration" }, 500);
    }

    let body: Record<string, unknown>;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }

    // Honeypot: bots that fill the hidden field get a convincing success
    // and we write nothing.
    if (typeof body.honeypot === "string" && body.honeypot.trim() !== "") {
        return json({ success: true, id: null, notification_sent: false }, 200);
    }

    const errors = validateContactPayload(body);
    if (errors.length > 0) {
        return json({ error: "validation_failed", details: errors }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const ip = clientIpFrom(req.headers);

    const { data: allowed, error: rateErr } = await supabase.rpc("bump_submission_rate", {
        p_scope: "contact",
        p_key: ip,
        p_limit: RATE_LIMIT,
        p_window_seconds: RATE_WINDOW_SECONDS,
    });
    if (rateErr) {
        // Fail open on infrastructure errors — a broken counter must not
        // block real customers — but log loudly.
        console.error("submit-contact: rate limit check failed:", rateErr.message);
    } else if (allowed === false) {
        return json({ error: "rate_limited" }, 429);
    }

    const clientToken = body.client_token as string;

    // Idempotency: if this token already landed, return the original row.
    const { data: existing } = await supabase
        .from("contact_submissions")
        .select("id, created_at")
        .eq("client_token", clientToken)
        .maybeSingle();
    if (existing) {
        return json({ success: true, id: existing.id, deduped: true, notification_sent: false }, 200);
    }

    const row = {
        name: (body.name as string).trim(),
        email: (body.email as string).trim(),
        phone: typeof body.phone === "string" && body.phone.trim() !== "" ? body.phone.trim() : null,
        subject: body.subject as string,
        message: (body.message as string).trim(),
        // Stored as a bucket-relative path; the bucket is private, so the
        // dashboard and emails mint signed URLs when displaying it.
        attachment_url: typeof body.attachment_path === "string" ? body.attachment_path : null,
        order_number:
            typeof body.order_number === "string" && body.order_number.trim() !== ""
                ? body.order_number.trim()
                : null,
        ip_address: ip,
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
        status: "new",
        client_token: clientToken,
    };

    const { data: submission, error: insertErr } = await supabase
        .from("contact_submissions")
        .insert(row)
        .select()
        .single();

    if (insertErr) {
        // Unique violation = a concurrent retry with the same token won the
        // race. Treat as the idempotent success it is.
        if (insertErr.code === "23505") {
            const { data: winner } = await supabase
                .from("contact_submissions")
                .select("id")
                .eq("client_token", clientToken)
                .maybeSingle();
            if (winner) {
                return json({ success: true, id: winner.id, deduped: true, notification_sent: false }, 200);
            }
        }
        console.error("submit-contact: insert failed:", insertErr.message);
        return json({ error: "Could not save your message. Please try again." }, 500);
    }

    // Notify owner + auto-reply. Failure is reported, never fatal.
    let notificationSent = false;
    try {
        let attachmentSignedUrl: string | null = null;
        if (submission.attachment_url) {
            const { data: signed } = await supabase.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(submission.attachment_url, EMAIL_SIGNED_URL_TTL_SECONDS);
            attachmentSignedUrl = signed?.signedUrl ?? null;
        }

        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-contact-notification`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
                submission: {
                    id: submission.id,
                    name: submission.name,
                    email: submission.email,
                    phone: submission.phone ?? undefined,
                    subject: submission.subject,
                    message: submission.message,
                    attachment_url: attachmentSignedUrl ?? undefined,
                    order_number: submission.order_number ?? undefined,
                    created_at: submission.created_at,
                },
            }),
        });
        notificationSent = res.ok;
        if (!res.ok) {
            console.error("submit-contact: notification failed:", res.status, await res.text());
        }
    } catch (err) {
        console.error("submit-contact: notification error:", (err as Error).message);
    }

    return json({ success: true, id: submission.id, notification_sent: notificationSent }, 200);
});
