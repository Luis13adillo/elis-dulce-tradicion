import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { Stripe } from "npm:stripe@^14.0.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiting configuration
const RATE_LIMIT = 10; // requests per window
const RATE_WINDOW_SECONDS = 60; // 1 minute

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    // Get client IP for rate limiting
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                     req.headers.get("x-real-ip") ||
                     "unknown";

    // Initialize Supabase for rate limiting check
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (supabaseUrl && supabaseServiceKey) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Check rate limit using database
        const windowStart = new Date(Date.now() - RATE_WINDOW_SECONDS * 1000).toISOString();

        const { count, error: countError } = await supabase
            .from("payment_rate_limits")
            .select("*", { count: "exact", head: true })
            .eq("ip_address", clientIp)
            .gte("created_at", windowStart);

        if (!countError && count !== null && count >= RATE_LIMIT) {
            return new Response(
                JSON.stringify({
                    error: "Too many requests. Please wait a minute before trying again.",
                    retryAfter: RATE_WINDOW_SECONDS
                }),
                {
                    headers: {
                        ...corsHeaders,
                        "Content-Type": "application/json",
                        "Retry-After": String(RATE_WINDOW_SECONDS)
                    },
                    status: 429,
                }
            );
        }

        // Log this request for rate limiting
        await supabase.from("payment_rate_limits").insert({
            ip_address: clientIp,
            created_at: new Date().toISOString()
        });

        // Clean up old entries (fire and forget)
        supabase.from("payment_rate_limits")
            .delete()
            .lt("created_at", windowStart)
            .then(() => {});
    }

    try {
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
        if (!STRIPE_SECRET_KEY) {
            throw new Error("Missing Stripe Secret Key");
        }

        const stripe = new Stripe(STRIPE_SECRET_KEY, {
            apiVersion: "2023-10-16",
        });

        const { amount, currency, metadata, idempotencyKey } = await req.json();

        if (!amount) {
            throw new Error("Missing amount");
        }

        // Validate amount is reasonable (max $10,000 to prevent abuse)
        if (amount > 10000) {
            throw new Error("Amount exceeds maximum allowed");
        }

        // Generate idempotency key if not provided
        // This prevents duplicate charges if the client retries
        const effectiveIdempotencyKey = idempotencyKey ||
            `${metadata?.order_number || 'order'}-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        // Create PaymentIntent with idempotency key
        const paymentIntent = await stripe.paymentIntents.create(
            {
                amount: Math.round(amount * 100), // Convert to cents
                currency: currency || "usd",
                automatic_payment_methods: { enabled: true },
                metadata: metadata || {},
            },
            {
                idempotencyKey: effectiveIdempotencyKey,
            }
        );

        return new Response(
            JSON.stringify({
                clientSecret: paymentIntent.client_secret,
                id: paymentIntent.id
            }),
            {
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json",
                },
                status: 200,
            }
        );
    } catch (error) {
        console.error("Payment intent error:", error);

        // Handle Stripe idempotency errors specifically
        if (error.type === 'StripeIdempotencyError') {
            return new Response(
                JSON.stringify({
                    error: "A payment with this request is already being processed. Please wait.",
                    code: "IDEMPOTENCY_ERROR"
                }),
                {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                    status: 409,
                }
            );
        }

        return new Response(
            JSON.stringify({ error: error.message }),
            {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
            }
        );
    }
});
