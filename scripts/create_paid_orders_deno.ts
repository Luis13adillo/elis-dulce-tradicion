// SECURITY (2026-07-28): credentials were hardcoded in this file and
// committed to git. They are now read from the environment. The
// previously committed key MUST be treated as compromised and rotated --
// see SECURITY_KEY_ROTATION.md at the repo root.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
if (!SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY is not set. Export it before running this script.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const generateOrderNumber = () => `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

const testOrders = [
    { customer: "Elena Tests", size: "10 inch Round", filling: "Tres Leches", price: 65.00 },
    { customer: "Marco Payment", size: "1/4 Sheet", filling: "Strawberry", price: 45.00 },
    { customer: "Sofia Stripe", size: "8 inch Round", filling: "Mocha", price: 40.00 },
    { customer: "Lucas Card", size: "Half Sheet", filling: "Peach", price: 85.00 },
    { customer: "Ana Verified", size: "12 inch Round", filling: "Pineapple", price: 75.00 },
];

async function createPaidOrders() {
    console.log("Creating 5 PAId test orders...");

    for (const t of testOrders) {
        const order = {
            order_number: generateOrderNumber(),
            customer_name: t.customer,
            customer_email: "test@example.com",
            customer_phone: "555-000-0000",
            date_needed: new Date().toISOString().split('T')[0], // Today
            time_needed: "14:00",
            cake_size: t.size,
            filling: t.filling,
            total_amount: t.price,
            status: "pending", // Paid orders start as pending for the baker
            payment_status: "paid", // IMPORTANT: This triggers the "Paid" indicator
            stripe_payment_id: `pi_simulated_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            delivery_option: "pickup",
            created_at: new Date().toISOString()
        };

        const { data, error } = await supabase.from("orders").insert([order]).select();

        if (error) {
            console.error("Error creating order:", error.message);
        } else {
            console.log(`✅ Created Order ${order.order_number} for ${order.customer_name} (Paid: $${order.total_amount})`);
        }
    }
}

createPaidOrders();
