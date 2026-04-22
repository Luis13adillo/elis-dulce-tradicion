// stripe-webhook — authoritative source of truth for payment lifecycle.
//
// Tier A model: the webhook, not the browser, creates the final `orders`
// row. On payment_intent.succeeded it reads the pending_order row keyed off
// PaymentIntent metadata and atomically promotes it into `orders`. If the
// customer's browser dies mid-redirect, we don't care — the webhook still
// lands and the order still appears on the kitchen/dashboard.
//
// Event-ID dedup via stripe_webhook_events guards against Stripe's
// at-least-once delivery (duplicate webhook = no-op on second delivery).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "owner@elisbakery.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";

function escapeHtml(text: string | undefined | null): string {
    if (!text) return "";
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;");
}

Deno.serve(async (req) => {
    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Missing server configuration");
        return new Response("Server configuration error", { status: 500 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
        return new Response("Missing signature", { status: 401 });
    }

    const body = await req.text();
    let event: Stripe.Event;
    try {
        event = await stripe.webhooks.constructEventAsync(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error("Webhook signature verification failed:", (err as Error).message);
        return new Response(`Invalid signature: ${(err as Error).message}`, { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Event-ID dedup (Stripe can deliver the same event multiple times) ---
    const { error: dedupError } = await supabase
        .from("stripe_webhook_events")
        .insert({ event_id: event.id, event_type: event.type, payload: event as unknown as Record<string, unknown> });

    if (dedupError) {
        // Duplicate key = already processed. Return 200 so Stripe stops retrying.
        if ((dedupError as { code?: string }).code === "23505") {
            console.log(`Duplicate webhook event ignored: ${event.id}`);
            return new Response(
                JSON.stringify({ received: true, duplicate: true }),
                { status: 200, headers: { "Content-Type": "application/json" } }
            );
        }
        console.error("Failed to record webhook event (non-fatal):", dedupError);
    }

    console.log(`Processing webhook event: ${event.type} (${event.id})`);

    try {
        switch (event.type) {
            case "payment_intent.succeeded": {
                await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent, supabase);
                break;
            }

            case "payment_intent.payment_failed": {
                await handlePaymentFailed(event.data.object as Stripe.PaymentIntent, supabase);
                break;
            }

            case "charge.refunded": {
                await handleChargeRefunded(event.data.object as Stripe.Charge, supabase);
                break;
            }

            case "charge.dispute.created": {
                await handleDisputeCreated(event.data.object as Stripe.Dispute);
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return new Response(
            JSON.stringify({ received: true, type: event.type }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Error processing webhook:", error);
        // Return 500 so Stripe retries transient errors. But don't retry
        // forever on a permanent failure — Stripe gives up after ~3 days.
        return new Response(
            JSON.stringify({ error: "Webhook processing failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
});

// -------------------------------------------------------------------------
// payment_intent.succeeded — promote pending_order → orders
// -------------------------------------------------------------------------
async function handlePaymentSucceeded(
    pi: Stripe.PaymentIntent,
    supabase: ReturnType<typeof createClient>,
) {
    const pendingOrderId = pi.metadata?.pending_order_id;
    const orderNumberMeta = pi.metadata?.order_number;

    // --- New flow: pending_order_id in metadata ---
    if (pendingOrderId) {
        const { data: result, error } = await supabase.rpc("promote_pending_order", {
            p_pending_id: pendingOrderId,
            p_payment_intent_id: pi.id,
            p_idempotency_key: pendingOrderId,
        });

        if (error) {
            console.error(`promote_pending_order failed for ${pendingOrderId}:`, error);
            await sendOrphanAlert(pi, `Failed to promote pending_order ${pendingOrderId}: ${error.message}`);
            throw error;
        }

        // deno-lint-ignore no-explicit-any
        const order = (result as any)?.order;
        // deno-lint-ignore no-explicit-any
        const alreadyPromoted = (result as any)?.already_promoted;

        if (order && !alreadyPromoted) {
            console.log(`Order ${order.order_number} promoted from pending_order ${pendingOrderId}`);
            await triggerOrderConfirmationEmail(order, supabase);
        } else if (alreadyPromoted) {
            console.log(`pending_order ${pendingOrderId} already promoted — skipping email`);
        }
        return;
    }

    // --- Legacy flow: old metadata with order_number (pre-Tier-A) ---
    // Supports any PaymentIntent created before Tier A ships. UPDATE the
    // existing row (created client-side in the old flow).
    if (orderNumberMeta) {
        const { data: updated, error } = await supabase
            .from("orders")
            .update({
                payment_status: "paid",
                stripe_payment_id: pi.id,
                payment_intent_id: pi.id,
                updated_at: new Date().toISOString(),
            })
            .eq("order_number", orderNumberMeta)
            .select()
            .maybeSingle();

        if (error) {
            console.error("Legacy order update failed:", error);
            await sendOrphanAlert(pi, `Legacy update failed for order ${orderNumberMeta}: ${error.message}`);
            throw error;
        }

        if (updated) {
            console.log(`Legacy order ${orderNumberMeta} marked paid`);
            await triggerOrderConfirmationEmail(updated, supabase);
        } else {
            // UPDATE matched zero rows — this is the exact bug that created
            // Mahesh/Ana/Erik/Varun. Alert loudly so it never hides again.
            await sendOrphanAlert(pi, `No order row found for legacy order_number ${orderNumberMeta}`);
        }
        return;
    }

    // --- No metadata at all — orphan ---
    await sendOrphanAlert(pi, "PaymentIntent succeeded with no pending_order_id or order_number metadata");
}

// -------------------------------------------------------------------------
// payment_intent.payment_failed — mark pending + email both customer & owner
// -------------------------------------------------------------------------
async function handlePaymentFailed(
    pi: Stripe.PaymentIntent,
    supabase: ReturnType<typeof createClient>,
) {
    const pendingOrderId = pi.metadata?.pending_order_id;
    const errorMessage = pi.last_payment_error?.message || "Payment failed";
    const errorCode = pi.last_payment_error?.code || null;

    if (pendingOrderId) {
        const { data: rowJson, error } = await supabase.rpc("mark_pending_order_failed", {
            p_pending_id: pendingOrderId,
            p_payment_intent_id: pi.id,
            p_error_message: errorMessage,
            p_error_code: errorCode,
        });

        if (error) {
            console.error("mark_pending_order_failed:", error);
        }

        // deno-lint-ignore no-explicit-any
        const pending = rowJson as any;
        if (pending?.customer_email) {
            // Customer-facing email with retry link
            await invokeFunction(supabase, "send-payment-failed-customer", {
                pending_order_id: pendingOrderId,
                customer_name: pending.customer_name,
                customer_email: pending.customer_email,
                customer_language: pending.customer_language || "en",
                order_number: pending.order_number,
                amount: Number(pending.total_amount) || (pi.amount / 100),
                error_message: errorMessage,
            });
        }

        // Owner alert (existing function), fix the data shape to what it expects
        if (RESEND_API_KEY && pending) {
            await invokeFunction(supabase, "send-failed-payment-notification", {
                payment: {
                    amount: Number(pending.total_amount) || (pi.amount / 100),
                    customer_name: pending.customer_name || "Unknown",
                    customer_email: pending.customer_email || "unknown@example.com",
                    error_message: errorMessage,
                    idempotency_key: pendingOrderId,
                },
            });
        }

        // Audit log to failed_payments (matches REAL schema:
        // amount, customer_name, customer_email, order_data, error_message, idempotency_key)
        await supabase.from("failed_payments").insert({
            amount: Number(pending?.total_amount) || (pi.amount / 100),
            customer_name: pending?.customer_name || null,
            customer_email: pending?.customer_email || null,
            order_data: pending || null,
            error_message: errorMessage,
            idempotency_key: pendingOrderId,
        });
    } else {
        console.warn(`payment_failed with no pending_order_id: ${pi.id}`);
        await supabase.from("failed_payments").insert({
            amount: pi.amount / 100,
            error_message: errorMessage,
            idempotency_key: null,
        });
    }
}

// -------------------------------------------------------------------------
// charge.refunded — mark order refunded
// -------------------------------------------------------------------------
async function handleChargeRefunded(
    charge: Stripe.Charge,
    supabase: ReturnType<typeof createClient>,
) {
    const piId = charge.payment_intent as string | null;
    if (!piId) return;

    const { error } = await supabase
        .from("orders")
        .update({
            payment_status: charge.refunded ? "refunded" : "partially_refunded",
            refund_amount: charge.amount_refunded / 100,
            updated_at: new Date().toISOString(),
        })
        .eq("stripe_payment_id", piId);

    if (error) console.error("Refund update failed:", error);
}

// -------------------------------------------------------------------------
// charge.dispute.created — log + owner alert (unchanged from prior version)
// -------------------------------------------------------------------------
async function handleDisputeCreated(dispute: Stripe.Dispute) {
    const chargeId = dispute.charge as string;
    console.log(`Dispute created for charge: ${chargeId}`);

    if (!RESEND_API_KEY) {
        console.warn("RESEND_API_KEY not configured — dispute notification not sent");
        return;
    }

    const disputeAmount = (dispute.amount / 100).toFixed(2);
    const disputeReason = escapeHtml(dispute.reason || "Not specified");
    const stripeDisputeUrl = `https://dashboard.stripe.com/disputes/${dispute.id}`;

    const resend = new Resend(RESEND_API_KEY);
    await resend.emails.send({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: OWNER_EMAIL,
        subject: `Payment Dispute Created - $${disputeAmount}`,
        html: `
            <h2>Payment Dispute Alert</h2>
            <p><strong>Amount:</strong> $${disputeAmount}</p>
            <p><strong>Reason:</strong> ${disputeReason}</p>
            <p><strong>Status:</strong> ${escapeHtml(dispute.status)}</p>
            <p><strong>Dispute ID:</strong> <code>${escapeHtml(dispute.id)}</code></p>
            <p><strong>Charge ID:</strong> <code>${escapeHtml(chargeId)}</code></p>
            <p><a href="${stripeDisputeUrl}">View in Stripe Dashboard</a></p>
        `,
    });
}

// -------------------------------------------------------------------------
// helpers
// -------------------------------------------------------------------------
async function invokeFunction(
    _supabase: ReturnType<typeof createClient>,
    slug: string,
    body: unknown,
) {
    try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            console.error(`invoke ${slug} failed: ${res.status} ${await res.text()}`);
        }
    } catch (err) {
        console.error(`invoke ${slug} threw:`, err);
    }
}

async function triggerOrderConfirmationEmail(
    // deno-lint-ignore no-explicit-any
    order: any,
    supabase: ReturnType<typeof createClient>,
) {
    if (!RESEND_API_KEY) return;
    await invokeFunction(supabase, "send-order-confirmation", { order });
}

async function sendOrphanAlert(pi: Stripe.PaymentIntent, reason: string) {
    console.error(`ORPHAN PAYMENT ALERT: ${reason} (PI ${pi.id}, $${pi.amount / 100})`);
    if (!RESEND_API_KEY) return;
    try {
        const resend = new Resend(RESEND_API_KEY);
        await resend.emails.send({
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: OWNER_EMAIL,
            subject: `URGENT: Orphan payment $${(pi.amount / 100).toFixed(2)} — needs review`,
            html: `
                <h2>Orphan Payment — No Order Row</h2>
                <p>A payment succeeded on Stripe but we could not link it to a pending order. Manual recovery required.</p>
                <p><strong>Amount:</strong> $${(pi.amount / 100).toFixed(2)}</p>
                <p><strong>PaymentIntent:</strong> <code>${escapeHtml(pi.id)}</code></p>
                <p><strong>Customer (if Stripe has it):</strong> ${escapeHtml(pi.receipt_email || "unknown")}</p>
                <p><strong>Reason:</strong> ${escapeHtml(reason)}</p>
                <p><a href="https://dashboard.stripe.com/payments/${pi.id}">Open in Stripe Dashboard</a></p>
                <p><a href="${FRONTEND_URL}/owner-dashboard">Open Owner Dashboard</a></p>
            `,
        });
    } catch (err) {
        console.error("Failed to send orphan alert:", err);
    }
}
