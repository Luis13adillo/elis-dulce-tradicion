// SECURITY (2026-07-28): credentials were hardcoded in this file and
// committed to git. They are now read from the environment. The
// previously committed key MUST be treated as compromised and rotated --
// see SECURITY_KEY_ROTATION.md at the repo root.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? "";
if (!SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY is not set. Export it before running this script.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkColumns() {
    console.log("Fetching one order to see available columns...");
    const { data, error } = await supabase.from("orders").select("*").limit(1);

    if (error) {
        console.error("Error connecting:", error.message);
        return;
    }

    if (data && data.length > 0) {
        console.log("✅ Successfully stored order columns:");
        console.log(Object.keys(data[0]).join(", "));

        const hasStripeId = "stripe_payment_id" in data[0];
        const hasPaymentStatus = "payment_status" in data[0];

        console.log("\n--- Verification ---");
        console.log(`payment_status exists? ${hasPaymentStatus ? "YES" : "NO"}`);
        console.log(`stripe_payment_id exists? ${hasStripeId ? "YES" : "NO [MISSING]"}`);
    } else {
        console.log("No orders found in DB to check columns.");
    }
}

checkColumns();
