// kitchen-acceptance-alerts — backup SMS when a paid order sits unaccepted.
//
// Invoked every minute by pg_cron + pg_net with the x-cron-secret header
// (same auth pattern as review-sweeps). Finds paid orders still in status
// 'pending' for 3+ minutes whose backup alert hasn't been attempted, claims
// each one (UPDATE ... WHERE kitchen_alert_sms_at IS NULL) so overlapping
// runs cannot double-send, then hands it to the SMS provider seam.
//
// SMS_ENABLED defaults OFF. While off, rows are still claimed and the
// outcome 'disabled' recorded, so enabling SMS later never blasts texts for
// old orders.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getSmsProvider, kitchenAlertSmsBody } from "../_shared/sms.ts";

const SMS_BACKUP_AFTER_MINUTES = 3;
// Don't page about stale backlog (e.g. right after deploy or an outage).
const MAX_AGE_HOURS = 12;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const CRON_SECRET = Deno.env.get("CRON_SECRET");
    if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
        return json({ error: "Unauthorized" }, 401);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Server misconfiguration" }, 500);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const env = (k: string) => Deno.env.get(k);
    const provider = getSmsProvider(env);
    const recipient = (env("KITCHEN_ALERT_PHONE") ?? "").trim();

    const now = Date.now();
    const cutoff = new Date(now - SMS_BACKUP_AFTER_MINUTES * 60_000).toISOString();
    const floor = new Date(now - MAX_AGE_HOURS * 3_600_000).toISOString();

    const { data: due, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, date_needed, time_needed, created_at")
        .eq("status", "pending")
        .eq("payment_status", "paid")
        .is("kitchen_alert_sms_at", null)
        .lte("created_at", cutoff)
        .gte("created_at", floor)
        .limit(20);
    if (error) return json({ error: "query failed", detail: error.message }, 500);

    const results: Array<{ order_number: string; outcome: string }> = [];
    for (const order of due ?? []) {
        // Claim first: only one run may attempt a given order.
        const { data: claimed, error: claimErr } = await supabase
            .from("orders")
            .update({ kitchen_alert_sms_at: new Date().toISOString() })
            .eq("id", order.id)
            .is("kitchen_alert_sms_at", null)
            .select("id")
            .maybeSingle();
        if (claimErr || !claimed) continue;

        let outcome: string;
        if (provider.name === "disabled") {
            outcome = "disabled";
        } else if (!recipient) {
            outcome = "no_recipient";
        } else {
            try {
                const r = await provider.send(recipient, kitchenAlertSmsBody(order));
                outcome = r.reason;
            } catch (e) {
                outcome = "error";
                console.error("kitchen SMS send failed:", (e as Error).message);
            }
        }
        await supabase.from("orders").update({ kitchen_alert_sms_status: outcome }).eq("id", order.id);
        console.log(`kitchen alert for order ${order.order_number}: ${outcome}`);
        results.push({ order_number: order.order_number, outcome });
    }

    return json({ provider: provider.name, checked: due?.length ?? 0, results });
});
