// SECURITY (2026-07-28): credentials were hardcoded in this file and
// committed to git. They are now read from the environment. The
// previously committed key MUST be treated as compromised and rotated --
// see SECURITY_KEY_ROTATION.md at the repo root.

import { createClient } from "@supabase/supabase-js";

// Configuration from existing scripts/env
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Export it before running this script.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const generateOrderNumber = () => `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

const testOrders = [
    {
        // Test 2: Spanish / Delivery / Confirmed
        customer_name: "Maria Garcia",
        customer_email: "maria.garcia@example.com",
        customer_phone: "555-010-0002",
        language: "es",
        delivery_option: "delivery",
        status: "confirmed",
        items: { size: "10 inch Round", filling: "Tres Leches", price: 65.00, theme: "Cumpleaños" }
    },
    {
        // Test 3: English / Delivery / Delivered
        customer_name: "John Smith",
        customer_email: "john.smith@example.com",
        customer_phone: "555-010-0003",
        language: "en",
        delivery_option: "delivery",
        status: "delivered", // Past state
        items: { size: "1/4 Sheet", filling: "Chocolate", price: 55.00, theme: "Corporate" }
    },
    {
        // Test 4: Spanish / Pickup / Completed
        customer_name: "Sofia Rodriguez",
        customer_email: "sofia.rodriguez@example.com",
        customer_phone: "555-010-0004",
        language: "es", // "Spanish" per plan
        delivery_option: "pickup",
        status: "completed", // Past state
        items: { size: "8 inch Round", filling: "Vanilla", price: 40.00, theme: "Bautizo" }
    }
];

async function seedDashboardTests() {
    console.log("🚀 Seeding 3 Dashboard Test Orders...");

    for (const t of testOrders) {
        const order = {
            order_number: generateOrderNumber(),
            customer_name: t.customer_name,
            customer_email: t.customer_email,
            customer_phone: t.customer_phone,
            date_needed: new Date().toISOString().split('T')[0], // Today
            time_needed: "15:00",
            cake_size: t.items.size,
            filling: t.items.filling,
            theme: t.items.theme,
            total_amount: t.items.price,
            status: t.status, // Directly setting target status
            payment_status: "paid", // Assume paid
            stripe_payment_id: `pi_seeded_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            delivery_option: t.delivery_option,
            delivery_address: t.delivery_option === "delivery" ? "123 Test St, Test City, TS 12345" : null,
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from("orders").insert([order]).select();

        if (error) {
            console.error(`❌ Error creating order for ${t.customer_name}:`, error.message);
        } else {
            console.log(`✅ Created Order ${order.order_number} for ${order.customer_name} [${t.status.toUpperCase()}]`);
        }
    }
}

seedDashboardTests();
