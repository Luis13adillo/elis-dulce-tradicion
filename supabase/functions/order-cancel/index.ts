// order-cancel — replaces backend/routes/cancellation.js since the Express
// backend isn't deployed in prod.
//
// Two modes, switched by the caller's role from user_profiles:
//   customer  → can cancel own order if >=24h before pickup AND not in_progress
//   owner/baker → can cancel anything, with optional override refund amount
//
// Refund flow:
//   1. transition_order_status RPC moves status pending|confirmed|in_progress|ready → cancelled
//      (state machine in DB rejects illegal transitions)
//   2. We UPDATE orders directly for refund_amount, refund_status, cancelled_by,
//      admin_cancellation_notes (transition_order_status doesn't cover those)
//   3. Stripe refund.create with idempotencyKey "refund-order-{id}" — Stripe
//      dedupes retries; safe to retry on network blip
//   4. charge.refunded webhook fires later and confirms refund_status='processed'
//      via stripe-webhook handleChargeRefunded. We optimistically set 'processed'
//      here if Stripe returned succeeded inline.
//   5. send-status-update Edge Function sends the customer email.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CancelRequest {
    orderId: number;
    reason: string;
    reasonDetails?: string;
    overrideRefundAmount?: number; // admin only
    adminNotes?: string; // admin only
}

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
    }

    const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

    if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
        return json({ error: "Server misconfiguration" }, 500);
    }

    // ---------- parse + validate body ----------
    let body: CancelRequest;
    try {
        body = await req.json();
    } catch {
        return json({ error: "Invalid JSON body" }, 400);
    }
    const { orderId, reason, reasonDetails, overrideRefundAmount, adminNotes } = body;
    if (!orderId || typeof orderId !== "number") return json({ error: "orderId (number) required" }, 400);
    if (!reason || typeof reason !== "string") return json({ error: "reason (string) required" }, 400);

    // ---------- auth: must be logged-in user ----------
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").replace("bearer ", "");
    if (!token) return json({ error: "Authorization header required" }, 401);

    const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userResp, error: authErr } = await supabaseAnon.auth.getUser(token);
    if (authErr || !userResp?.user) return json({ error: "Invalid auth token" }, 401);
    const userId = userResp.user.id;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ---------- look up role + order ----------
    const { data: profile } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
    const isAdmin = profile?.role === "owner" || profile?.role === "baker";

    const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();
    if (orderErr || !order) return json({ error: "Order not found" }, 404);

    const oldStatus: string = order.status;

    // ---------- customer-only restrictions ----------
    if (!isAdmin) {
        if (order.user_id !== userId) return json({ error: "Forbidden: order does not belong to user" }, 403);
        if (order.status === "cancelled") return json({ error: "Order is already cancelled" }, 400);
        const inProgress = ["in_progress", "ready", "out_for_delivery", "delivered", "completed"];
        if (inProgress.includes(order.status)) {
            return json({ error: "Order is past the cancellation window. Please contact support." }, 400);
        }
        const hoursUntil = hoursUntilNeeded(order);
        if (hoursUntil < 24) {
            return json({ error: "Orders cannot be cancelled within 24 hours of pickup/delivery time. Please contact support." }, 400);
        }
        // Override fields are admin-only — ignore if a customer sent them
        if (overrideRefundAmount !== undefined || adminNotes) {
            return json({ error: "Override fields require admin role" }, 403);
        }
    } else {
        if (order.status === "cancelled") return json({ error: "Order is already cancelled" }, 400);
    }

    // ---------- compute refund ----------
    let refundAmount = 0;
    let refundPercentage = 0;
    if (isAdmin && overrideRefundAmount !== undefined && overrideRefundAmount !== null) {
        refundAmount = Number(overrideRefundAmount);
        refundPercentage = order.total_amount > 0 ? (refundAmount / Number(order.total_amount)) * 100 : 0;
    } else {
        const hoursUntil = Math.floor(hoursUntilNeeded(order));
        const { data: refundCalc } = await supabase.rpc("calculate_refund_amount", {
            order_total: order.total_amount,
            hours_before: hoursUntil,
        });
        refundAmount = Number(refundCalc ?? 0);
        const { data: policy } = await supabase.rpc("get_cancellation_policy", {
            hours_before: hoursUntil,
        });
        const policyRow = Array.isArray(policy) ? policy[0] : policy;
        refundPercentage = Number(policyRow?.refund_percentage ?? 0);
    }
    refundAmount = Math.max(0, Math.min(refundAmount, Number(order.total_amount)));

    // ---------- transition status (state machine enforced in DB) ----------
    const fullReason = reasonDetails ? `${reason}: ${reasonDetails}` : reason;
    const { data: trans, error: transErr } = await supabase.rpc("transition_order_status", {
        p_order_id: orderId,
        p_new_status: "cancelled",
        p_user_id: userId,
        p_reason: fullReason,
        p_metadata: { source: "order-cancel", isAdmin, refundAmount },
    });
    if (transErr || (trans && (trans as { success?: boolean }).success === false)) {
        const errMsg = (trans as { error?: string })?.error || transErr?.message || "Status transition failed";
        return json({ error: errMsg }, 400);
    }

    // ---------- fill in cancellation-specific fields transition_order_status doesn't touch ----------
    await supabase
        .from("orders")
        .update({
            cancelled_by: userId,
            refund_amount: refundAmount,
            refund_status: refundAmount > 0 ? "pending" : "not_applicable",
            admin_cancellation_notes: isAdmin && adminNotes ? adminNotes : null,
        })
        .eq("id", orderId);

    // ---------- Stripe refund (if applicable) ----------
    let refundStatus: "pending" | "processed" | "failed" | "not_applicable" =
        refundAmount > 0 ? "pending" : "not_applicable";
    let stripeRefundId: string | null = null;

    if (refundAmount > 0 && order.stripe_payment_id) {
        try {
            const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
            const refund = await stripe.refunds.create(
                {
                    payment_intent: order.stripe_payment_id,
                    amount: Math.round(refundAmount * 100),
                    reason: "requested_by_customer",
                    metadata: {
                        order_id: String(orderId),
                        cancellation_reason: reason,
                        cancelled_by_user_id: userId,
                    },
                },
                { idempotencyKey: `refund-order-${orderId}` },
            );
            stripeRefundId = refund.id;
            refundStatus = refund.status === "succeeded" ? "processed" : "pending";
            await supabase
                .from("orders")
                .update({
                    refund_status: refundStatus,
                    refund_processed_at: refund.status === "succeeded" ? new Date().toISOString() : null,
                })
                .eq("id", orderId);
        } catch (refundErr) {
            console.error("Stripe refund failed:", refundErr);
            refundStatus = "failed";
            await supabase.from("orders").update({ refund_status: "failed" }).eq("id", orderId);
            // continue — cancellation already succeeded; refund failure surfaces to admin via refund_status
        }
    }

    // ---------- send cancellation email via send-status-update ----------
    try {
        await supabase.functions.invoke("send-status-update", {
            body: {
                order_number: order.order_number,
                customer_name: order.customer_name,
                customer_email: order.customer_email,
                customer_language: order.customer_language,
                old_status: oldStatus,
                new_status: "cancelled",
                date_needed: order.date_needed,
                time_needed: order.time_needed,
                delivery_option: order.delivery_option,
                notes:
                    `Cancellation reason: ${reason}` +
                    (refundAmount > 0 ? `. Refund amount: $${refundAmount.toFixed(2)}` : "") +
                    (isAdmin && adminNotes ? `. Admin notes: ${adminNotes}` : ""),
            },
        });
    } catch (emailErr) {
        console.error("send-status-update invoke failed:", emailErr);
        // non-fatal — cancellation already happened
    }

    return json({
        success: true,
        refund: {
            refundAmount,
            refundPercentage,
            refundStatus,
            stripeRefundId,
        },
    });
});

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

function hoursUntilNeeded(order: { date_needed?: string; time_needed?: string }): number {
    if (!order.date_needed || !order.time_needed) return Infinity;
    const neededDateTime = new Date(`${order.date_needed}T${order.time_needed}`);
    const diffMs = neededDateTime.getTime() - Date.now();
    return Math.max(0, diffMs / (1000 * 60 * 60));
}
