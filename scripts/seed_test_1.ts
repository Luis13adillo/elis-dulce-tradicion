// SECURITY (2026-07-28): credentials were hardcoded in this file and
// committed to git. They are now read from the environment. The
// previously committed key MUST be treated as compromised and rotated --
// see SECURITY_KEY_ROTATION.md at the repo root.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Export it before running this script.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const generateOrderNumber = () => `ORD-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

async function seedTest1() {
    console.log("🚀 Seeding Test 1 Order (English/Pickup/Paid)...");

    const order = {
        order_number: generateOrderNumber(),
        customer_name: "Elena English",
        customer_email: "elena.english@example.com",
        customer_phone: "555-010-0001",
        delivery_option: "pickup",
        date_needed: new Date().toISOString().split('T')[0],
        time_needed: "14:00",
        status: "paid", // Initial state for testing transition to "ready"
        payment_status: "paid",
        stripe_payment_id: `pi_seeded_t1_${Date.now()}`,
        // Flattened fields are already present below
        cake_size: "12 inch Round",
        filling: "Vanilla",
        theme: "Classic",
        total_amount: 45.00,
        created_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from("orders").insert([order]).select();

    if (error) {
        console.error(`❌ Error creating Test 1 order:`, error.message);
    } else {
        console.log(`✅ Created Order ${order.order_number} for ${order.customer_name} [${order.status.toUpperCase()}]`);
    }
}

seedTest1();
