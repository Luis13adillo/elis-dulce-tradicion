import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend@^4.0.0";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

// Email configuration for dispute notifications
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const OWNER_EMAIL = Deno.env.get("OWNER_EMAIL") || "owner@elisbakery.com";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "orders@elisbakery.com";
const FROM_NAME = Deno.env.get("FROM_NAME") || "Eli's Bakery";
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://elisbakery.com";

// XSS protection: escape HTML special characters
function escapeHtml(text: string | undefined | null): string {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

Deno.serve(async (req) => {
    // Only allow POST requests
    if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
    }

    // Validate required environment variables
    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
        console.error("Missing Stripe configuration");
        return new Response("Server configuration error", { status: 500 });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Missing Supabase configuration");
        return new Response("Server configuration error", { status: 500 });
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY, {
        apiVersion: "2023-10-16",
    });

    // Get the signature from headers
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
        console.error("Missing stripe-signature header");
        return new Response("Missing signature", { status: 401 });
    }

    // Get the raw body for signature verification
    const body = await req.text();

    let event: Stripe.Event;

    try {
        // Verify the webhook signature
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error("Webhook signature verification failed:", err.message);
        return new Response(`Invalid signature: ${err.message}`, { status: 401 });
    }

    // Initialize Supabase client with service role for admin operations
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Processing webhook event: ${event.type}`);

    try {
        switch (event.type) {
            case "payment_intent.succeeded": {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const orderNumber = paymentIntent.metadata?.order_number;

                if (orderNumber) {
                    console.log(`Payment succeeded for order: ${orderNumber}`);

                    // Update order payment status
                    const { error } = await supabase
                        .from("orders")
                        .update({
                            payment_status: "paid",
                            stripe_payment_id: paymentIntent.id,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("order_number", orderNumber);

                    if (error) {
                        console.error("Failed to update order:", error);
                    } else {
                        console.log(`Order ${orderNumber} marked as paid`);

                        // Fetch full order and trigger confirmation email server-side.
                        // This is the reliable guarantee — frontend also tries, but if
                        // the browser closes before it fires, this ensures delivery.
                        if (RESEND_API_KEY) {
                            try {
                                const { data: order } = await supabase
                                    .from("orders")
                                    .select("*")
                                    .eq("order_number", orderNumber)
                                    .single();

                                if (order) {
                                    await fetch(`${SUPABASE_URL}/functions/v1/send-order-confirmation`, {
                                        method: "POST",
                                        headers: {
                                            "Content-Type": "application/json",
                                            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                                        },
                                        body: JSON.stringify({ order }),
                                    });
                                    console.log(`Confirmation email triggered for order ${orderNumber}`);
                                }
                            } catch (emailErr) {
                                // Non-fatal: log but don't fail the webhook response
                                console.error("Failed to trigger confirmation email:", emailErr);
                            }
                        }
                    }
                }
                break;
            }

            case "payment_intent.payment_failed": {
                const paymentIntent = event.data.object as Stripe.PaymentIntent;
                const orderNumber = paymentIntent.metadata?.order_number;

                if (orderNumber) {
                    console.log(`Payment failed for order: ${orderNumber}`);

                    // Update order payment status
                    const { error } = await supabase
                        .from("orders")
                        .update({
                            payment_status: "failed",
                            payment_error: paymentIntent.last_payment_error?.message || "Payment failed",
                            updated_at: new Date().toISOString(),
                        })
                        .eq("order_number", orderNumber);

                    if (error) {
                        console.error("Failed to update order:", error);
                    }

                    // Log to failed_payments table for tracking
                    await supabase.from("failed_payments").insert({
                        order_number: orderNumber,
                        payment_intent_id: paymentIntent.id,
                        error_message: paymentIntent.last_payment_error?.message,
                        error_code: paymentIntent.last_payment_error?.code,
                        created_at: new Date().toISOString(),
                    });
                }
                break;
            }

            case "charge.refunded": {
                const charge = event.data.object as Stripe.Charge;
                const paymentIntentId = charge.payment_intent as string;

                if (paymentIntentId) {
                    console.log(`Charge refunded for payment intent: ${paymentIntentId}`);

                    // Find order by payment intent ID and update
                    const { error } = await supabase
                        .from("orders")
                        .update({
                            payment_status: charge.refunded ? "refunded" : "partially_refunded",
                            refund_amount: charge.amount_refunded / 100, // Convert from cents
                            updated_at: new Date().toISOString(),
                        })
                        .eq("stripe_payment_id", paymentIntentId);

                    if (error) {
                        console.error("Failed to update order refund status:", error);
                    }
                }
                break;
            }

            case "charge.dispute.created": {
                const dispute = event.data.object as Stripe.Dispute;
                const chargeId = dispute.charge as string;

                console.log(`Dispute created for charge: ${chargeId}`);

                // Log dispute for manual review
                // This is a serious event that needs owner attention
                await supabase.from("payment_disputes").insert({
                    charge_id: chargeId,
                    dispute_id: dispute.id,
                    amount: dispute.amount / 100,
                    reason: dispute.reason,
                    status: dispute.status,
                    created_at: new Date().toISOString(),
                });

                // Send notification to owner about the dispute
                if (RESEND_API_KEY) {
                    const disputeAmount = (dispute.amount / 100).toFixed(2);
                    const disputeReason = escapeHtml(dispute.reason || "Not specified");
                    const stripeDisputeUrl = `https://dashboard.stripe.com/disputes/${dispute.id}`;

                    const resend = new Resend(RESEND_API_KEY);
                    await resend.emails.send({
                        from: `${FROM_NAME} <${FROM_EMAIL}>`,
                        to: OWNER_EMAIL,
                        subject: `🚨 Payment Dispute Created - $${disputeAmount}`,
                        html: `
                            <!DOCTYPE html>
                            <html>
                            <head>
                                <meta charset="utf-8">
                                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                            </head>
                            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                                <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                                    <h1 style="color: #fff; margin: 0; font-size: 28px;">🚨 Payment Dispute Alert</h1>
                                </div>
                                <div style="background: #fff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
                                    <div style="background: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; border-radius: 4px;">
                                        <p style="margin: 0; color: #721c24;"><strong>⚠️ URGENT:</strong> A customer has disputed a charge. Immediate action required.</p>
                                    </div>
                                    <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
                                        <h2 style="color: #dc3545; margin-top: 0;">Dispute Details</h2>
                                        <p><strong>Amount:</strong> <span style="font-size: 18px; color: #dc3545;">$${disputeAmount}</span></p>
                                        <p><strong>Reason:</strong> ${disputeReason}</p>
                                        <p><strong>Status:</strong> ${escapeHtml(dispute.status)}</p>
                                        <p><strong>Dispute ID:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">${escapeHtml(dispute.id)}</code></p>
                                        <p><strong>Charge ID:</strong> <code style="background: #e9ecef; padding: 2px 6px; border-radius: 3px;">${escapeHtml(chargeId)}</code></p>
                                        <p><strong>Created:</strong> ${new Date().toLocaleString()}</p>
                                    </div>
                                    <div style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0; border-radius: 4px;">
                                        <p style="margin: 0;"><strong>What to do:</strong> Review the dispute in Stripe Dashboard, gather evidence, and respond before the deadline to avoid losing the funds.</p>
                                    </div>
                                    <div style="text-align: center; margin: 30px 0;">
                                        <a href="${stripeDisputeUrl}" style="background: #dc3545; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 5px;">
                                            View in Stripe Dashboard
                                        </a>
                                        <a href="${FRONTEND_URL}/owner-dashboard" style="background: #6c757d; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; margin: 5px;">
                                            Owner Dashboard
                                        </a>
                                    </div>
                                    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                                    <p style="font-size: 12px; color: #6c757d; text-align: center;">
                                        This is an automated alert from Eli's Bakery payment system.
                                    </p>
                                </div>
                            </body>
                            </html>
                        `,
                    });
                    console.log(`Dispute notification sent to ${OWNER_EMAIL}`);
                } else {
                    console.warn("RESEND_API_KEY not configured - dispute notification not sent");
                }
                break;
            }

            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return new Response(
            JSON.stringify({ received: true, type: event.type }),
            {
                headers: { "Content-Type": "application/json" },
                status: 200,
            }
        );
    } catch (error) {
        console.error("Error processing webhook:", error);
        return new Response(
            JSON.stringify({ error: "Webhook processing failed" }),
            {
                headers: { "Content-Type": "application/json" },
                status: 500,
            }
        );
    }
});
