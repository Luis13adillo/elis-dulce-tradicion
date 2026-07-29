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

async function debugVisibility() {
    console.log("🔍 Debugging Visibility...");

    // 1. List all users to confirm the ID for Info@elisbakery.com
    console.log("\n--- Auth Users ---");
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
        console.error("Error listing users:", authError);
    } else {
        const infoUser = users.find(u => u.email.toLowerCase() === 'info@elisbakery.com');
        if (infoUser) {
            console.log(`✅ Found Info@elisbakery.com: ID=${infoUser.id}`);

            // 2. Check profile for this user
            console.log("\n--- User Profile ---");
            const { data: profile, error: profError } = await supabase
                .from('user_profiles')
                .select('*')
                .eq('user_id', infoUser.id)
                .single();

            if (profError) {
                console.error("❌ Profile error:", profError);
            } else {
                console.log("Profile found:", profile);
            }

        } else {
            console.error("❌ Info@elisbakery.com NOT FOUND in Auth Users!");
        }
    }

    // 3. Count Orders
    console.log("\n--- Orders Count ---");
    const { count, error: countError } = await supabase.from('orders').select('*', { count: 'exact', head: true });
    if (countError) console.error("Error counting orders:", countError);
    else console.log(`Total Orders in DB: ${count}`);

    // 4. List recent orders (Manual Test Ones)
    console.log("\n--- Recent Test Orders ---");
    const { data: orders, error: ordError } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, status')
        .ilike('order_number', 'ORD-TEST%');

    if (ordError) console.error("Error fetching test orders:", ordError);
    else {
        if (orders.length === 0) console.log("❌ No orders found starting with ORD-TEST");
        else orders.forEach(o => console.log(`- ${o.order_number}: ${o.customer_name} [${o.status}]`));
    }
}

debugVisibility();
