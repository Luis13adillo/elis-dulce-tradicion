// review-order-image — pre-payment AI comparison of the customer's reference
// photo against the order they built in the wizard.
//
// Called by the order wizard right after create_pending_order succeeds (and
// again by the holding page to re-check). Fail-CLOSED by business rule: only
// a confident MATCH proceeds automatically; MISMATCH, UNCERTAIN, an API
// error, a timeout, or a model refusal all become ANALYSIS-side holds. The
// authoritative protection is the image-review gate inside
// create-payment-intent — this function is the UX/routing layer plus the
// verdict recorder.
//
// Modes (business_settings.image_review_mode):
//   off     — inert: no AI call, no writes, always proceed
//   shadow  — record the verdict for calibration, never hold anyone
//   enforce — MATCH proceeds; everything else holds for manual staff review
//
// The response NEVER contains the AI verdict or reasoning — it goes back to
// the customer's browser. Staff see the verdict in the review queue + email.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@^0.110.0";
import { Resend } from "npm:resend@^4.0.0";
import { buildEmailHtml, formatDate } from "../_shared/emailTemplates.ts";
import { heldFor, resolveReviewOutcome, type AiVerdict } from "../_shared/imageReview.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_TIMEOUT_MS = 20_000;
const REVIEW_MODEL = "claude-opus-5";

const VERDICT_SCHEMA = {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "confidence", "observed", "reasons"],
    properties: {
        verdict: { type: "string", enum: ["MATCH", "MISMATCH", "UNCERTAIN"] },
        confidence: { type: "string", enum: ["high", "medium", "low"] },
        observed: { type: "string", description: "One or two sentences describing what the photo shows." },
        reasons: { type: "array", items: { type: "string" }, description: "Short reasons supporting the verdict." },
    },
} as const;

type Verdict = {
    verdict: AiVerdict;
    confidence?: string;
    observed?: string;
    reasons?: string[];
    error?: string;
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server misconfiguration" }, 500);

    let body: { pending_order_id?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
    const pendingId = body.pending_order_id;
    if (!pendingId || typeof pendingId !== "string") {
        return json({ error: "pending_order_id required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: settings } = await supabase
        .from("business_settings")
        .select("image_review_mode, review_hold_days")
        .limit(1)
        .maybeSingle();
    const mode: string = settings?.image_review_mode ?? "off";
    const holdDays: number = Number(settings?.review_hold_days) || 7;

    if (mode === "off") {
        return json({ success: true, held: false });
    }

    const { data: pending, error: loadErr } = await supabase
        .from("pending_orders")
        .select(
            "id, order_number, status, expires_at, reference_image_path, image_review_status, image_reviewed_at, " +
            "customer_name, customer_email, customer_phone, customer_language, date_needed, time_needed, " +
            "cake_size, servings, filling, theme, dedication, recipient_name, total_amount, raw_payload",
        )
        .eq("id", pendingId)
        .maybeSingle();

    if (loadErr || !pending) return json({ error: "pending_order not found" }, 404);
    if (pending.status === "promoted") return json({ success: true, held: false });

    const hasImage = typeof pending.reference_image_path === "string"
        && pending.reference_image_path.trim() !== "";

    // Idempotent: verdict already recorded — just report current routing.
    // This is also what lets the holding page auto-advance once staff approve.
    if (pending.image_reviewed_at) {
        return json({
            success: true,
            held: heldFor(mode, hasImage, pending.image_review_status ?? "not_required"),
        });
    }

    if (!hasImage) {
        await supabase
            .from("pending_orders")
            .update({
                image_review_status: "not_required",
                image_reviewed_at: new Date().toISOString(),
                image_review_result: { reason: "no_image", mode },
            })
            .eq("id", pendingId)
            .is("image_reviewed_at", null);
        return json({ success: true, held: false });
    }

    // Mark in-flight so the safety sweep can catch abandoned reviews.
    await supabase
        .from("pending_orders")
        .update({ image_review_status: "pending" })
        .eq("id", pendingId)
        .eq("image_review_status", "not_required");

    const verdict = await runAiReview(pending);
    const outcome = resolveReviewOutcome(mode as "shadow" | "enforce", verdict.verdict);
    const isMatch = verdict.verdict === "MATCH";
    const nowIso = new Date().toISOString();

    if (outcome.status === "passed") {
        // Shadow records everything and never holds; a MATCH in enforce mode
        // proceeds the same way.
        await supabase
            .from("pending_orders")
            .update({
                image_review_status: "passed",
                image_reviewed_at: nowIso,
                image_review_result: {
                    ...verdict,
                    mode,
                    model: REVIEW_MODEL,
                    shadow: mode === "shadow",
                    would_hold: !isMatch,
                    reviewed_at: nowIso,
                },
            })
            .eq("id", pendingId)
            .is("image_reviewed_at", null);
        return json({ success: true, held: false });
    }

    // Enforce + not a MATCH → hold for manual review. Extend the row's life to
    // the 7-day (configurable) hold window; while held it no longer counts
    // toward capacity (create_pending_order excludes review-held rows).
    const holdExpiry = new Date(Date.now() + holdDays * 24 * 60 * 60 * 1000).toISOString();
    const { data: updated } = await supabase
        .from("pending_orders")
        .update({
            image_review_status: "needs_review",
            image_reviewed_at: nowIso,
            image_review_result: {
                ...verdict,
                mode,
                model: REVIEW_MODEL,
                shadow: false,
                reviewed_at: nowIso,
            },
            expires_at: holdExpiry,
        })
        .eq("id", pendingId)
        .is("image_reviewed_at", null)
        .select("id")
        .maybeSingle();

    // Notify only if OUR update won (idempotency under concurrent calls)
    if (updated) {
        await sendHoldNotifications(pending, verdict).catch((e) =>
            console.error("review hold notifications failed (row already held):", e)
        );
    }

    return json({ success: true, held: true });
});

// ---------------------------------------------------------------------------
// AI review
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runAiReview(pending: any): Promise<Verdict> {
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
        return { verdict: "ANALYSIS_FAILED", error: "ANTHROPIC_API_KEY not configured" };
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const path = String(pending.reference_image_path);
    const imageUrl = path.startsWith("http")
        ? path
        : `${SUPABASE_URL}/storage/v1/object/public/reference-images/${path}`;

    // Decoration notes live inside raw_payload (no dedicated column)
    let decorationNotes = "";
    try {
        const rp = pending.raw_payload ?? {};
        decorationNotes = String(rp.decoration_notes ?? rp.decorationNotes ?? rp.notes ?? "");
    } catch { /* ignore */ }

    const orderSummary = [
        `Cake size: ${pending.cake_size ?? "unknown"}`,
        `Servings: ${pending.servings ?? "unspecified"}`,
        `Filling(s): ${pending.filling ?? "unspecified"}`,
        `Theme: ${pending.theme ?? "unspecified"}`,
        `Dedication text: ${pending.dedication || "none"}`,
        `Recipient: ${pending.recipient_name || "unspecified"}`,
        `Decoration notes: ${decorationNotes || "none"}`,
    ].join("\n");

    try {
        const client = new Anthropic({
            apiKey: ANTHROPIC_API_KEY,
            timeout: AI_TIMEOUT_MS,
            maxRetries: 1,
        });

        const response = await client.messages.create({
            model: REVIEW_MODEL,
            max_tokens: 4000,
            output_config: {
                effort: "low",
                format: { type: "json_schema", schema: VERDICT_SCHEMA },
            },
            system:
                "You review reference photos for a custom cake bakery. The customer uploaded a photo of a cake " +
                "design they want reproduced, alongside a structured order. Decide whether the photo plausibly " +
                "matches the order. Rules: the photo shows DECORATION and STRUCTURE, not flavor — never judge " +
                "flavor or filling from the photo. MATCH means the photo is clearly a cake (or cake design) whose " +
                "scale/tiers are plausible for the ordered size and servings and whose style is consistent with " +
                "the stated theme/notes; hand-drawn sketches and screenshots of cakes count as valid references. " +
                "MISMATCH means the photo is clearly not a cake reference, is inappropriate or unsafe content, or " +
                "obviously contradicts the order (for example a 5-tier wedding cake photo on a 10-serving order). " +
                "UNCERTAIN means you cannot tell (too dark, ambiguous subject, conflicting signals). " +
                "When genuinely unsure between MATCH and UNCERTAIN, prefer MATCH for ordinary cake photos — staff " +
                "review every held order manually and holding a normal order delays a real customer.",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "image", source: { type: "url", url: imageUrl } },
                        {
                            type: "text",
                            text: `The customer's order:\n${orderSummary}\n\nDoes this photo plausibly match this order?`,
                        },
                    ],
                },
            ],
        });

        if (response.stop_reason === "refusal") {
            return { verdict: "ANALYSIS_FAILED", error: "model refusal" };
        }

        const textBlock = response.content.find(
            (b: { type: string }) => b.type === "text",
        ) as { type: "text"; text: string } | undefined;
        if (!textBlock?.text) {
            return { verdict: "ANALYSIS_FAILED", error: `no text output (stop_reason=${response.stop_reason})` };
        }

        const parsed = JSON.parse(textBlock.text);
        if (!["MATCH", "MISMATCH", "UNCERTAIN"].includes(parsed?.verdict)) {
            return { verdict: "ANALYSIS_FAILED", error: "unparseable verdict" };
        }
        return parsed as Verdict;
    } catch (err) {
        console.error("AI review failed:", err);
        return { verdict: "ANALYSIS_FAILED", error: (err as Error).message ?? "unknown error" };
    }
}

// ---------------------------------------------------------------------------
// Notifications (enforce-mode holds only)
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendHoldNotifications(pending: any, verdict: Verdict): Promise<void> {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
        console.error("RESEND_API_KEY not set — skipping review hold emails");
        return;
    }
    const resend = new Resend(RESEND_API_KEY);
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
    const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
    const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "owner@elisbakery.com";
    const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";
    const from = `${FROM_NAME} <${FROM_EMAIL}>`;

    const lang = pending.customer_language?.toLowerCase();
    const isSpanish = lang === "es" || lang === "spanish";

    // ---- Staff alert (internal — verdict details are fine here) ----
    const reasons = (verdict.reasons ?? []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
    const staffBody = `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        A customer's design photo did not pass automatic review. <strong>No payment has been taken.</strong>
        Contact the customer, then approve, revise, or decline the request from the Front Desk photo-review queue.
      </p>
      <table style="width:100%;font-size:14px;color:#333;border-collapse:collapse;">
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Order</td><td><strong>${escapeHtml(pending.order_number)}</strong></td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Customer</td><td>${escapeHtml(pending.customer_name)} — ${escapeHtml(pending.customer_phone ?? "")} — ${escapeHtml(pending.customer_email)}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Needed</td><td>${escapeHtml(String(pending.date_needed))} @ ${escapeHtml(String(pending.time_needed))}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Cake</td><td>${escapeHtml(pending.cake_size ?? "")} — ${escapeHtml(pending.theme ?? "no theme")}</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">Total</td><td>$${Number(pending.total_amount).toFixed(2)} (unpaid)</td></tr>
        <tr><td style="padding:4px 8px 4px 0;color:#888;">AI verdict</td><td>${escapeHtml(verdict.verdict)} (${escapeHtml(verdict.confidence ?? "n/a")})</td></tr>
      </table>
      ${verdict.observed ? `<p style="margin:16px 0 4px;color:#888;font-size:13px;">Photo shows:</p><p style="margin:0;font-size:14px;color:#333;">${escapeHtml(verdict.observed)}</p>` : ""}
      ${reasons ? `<p style="margin:16px 0 4px;color:#888;font-size:13px;">Reasons:</p><ul style="margin:0;font-size:14px;color:#333;">${reasons}</ul>` : ""}
      <p style="margin:24px 0 0;text-align:center;">
        <a href="${FRONTEND_URL}/front-desk" style="display:inline-block;background:#1A1A2E;color:#C6A649;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Open photo review queue</a>
      </p>`;

    await resend.emails.send({
        from,
        to: OWNER_EMAIL,
        subject: `🖼️ Photo review needed — Order ${pending.order_number} (unpaid)`,
        html: buildEmailHtml({
            titleEmoji: "🖼️",
            title: "Design photo needs review",
            titleBandStyle: "alert",
            bodyContent: staffBody,
            frontendUrl: FRONTEND_URL,
        }),
    });

    // ---- Customer notice (NO AI reasoning, no payment yet) ----
    const dateStr = formatDate(String(pending.date_needed), isSpanish ? "es" : "en");
    const customerBody = isSpanish
        ? `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hola ${escapeHtml(pending.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        ¡Gracias por tu pedido <strong>${escapeHtml(pending.order_number)}</strong> para el ${escapeHtml(dateStr)}!
        Nuestros reposteros están revisando personalmente la foto de tu diseño para asegurarnos de poder
        hacerlo perfecto.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        <strong>Aún no se ha realizado ningún cargo.</strong> Te contactaremos muy pronto para confirmar los
        detalles y enviarte un enlace de pago seguro.
      </p>
      <p style="margin:0;font-size:14px;color:#666;">¿Preguntas? Llámanos al (610) 279-6200.</p>`
        : `
      <p style="margin:0 0 16px;font-size:15px;color:#333;">Hi ${escapeHtml(pending.customer_name)},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        Thank you for your order <strong>${escapeHtml(pending.order_number)}</strong> for ${escapeHtml(dateStr)}!
        Our bakers are personally reviewing your design photo to make sure we can make it perfect.
      </p>
      <p style="margin:0 0 16px;font-size:15px;color:#333;">
        <strong>You have not been charged.</strong> We'll contact you shortly to confirm the details and send
        you a secure payment link.
      </p>
      <p style="margin:0;font-size:14px;color:#666;">Questions? Call us at (610) 279-6200.</p>`;

    await resend.emails.send({
        from,
        to: pending.customer_email,
        subject: isSpanish
            ? `Estamos revisando tu diseño — Pedido ${pending.order_number}`
            : `We're reviewing your design — Order ${pending.order_number}`,
        html: buildEmailHtml({
            titleEmoji: "🎂",
            title: isSpanish ? "Revisando tu diseño" : "Reviewing your design",
            titleBandStyle: "gold",
            bodyContent: customerBody,
            frontendUrl: FRONTEND_URL,
        }),
    });
}

function escapeHtml(text: string | undefined | null): string {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}
