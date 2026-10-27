// deno test supabase/functions/_tests/sms.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { getSmsProvider, smsEnabled, kitchenAlertSmsBody } from "../_shared/sms.ts";

const env = (vars: Record<string, string>) => (k: string) => vars[k];

Deno.test("SMS defaults to disabled", async () => {
    assertEquals(smsEnabled(env({})), false);
    const p = getSmsProvider(env({}));
    assertEquals(p.name, "disabled");
    assertEquals((await p.send("+15555550100", "x")).sent, false);
});

Deno.test("SMS_ENABLED must be exactly true", () => {
    assertEquals(getSmsProvider(env({ SMS_ENABLED: "1" })).name, "disabled");
    assertEquals(getSmsProvider(env({ SMS_ENABLED: "TRUE" })).name, "none");
});

Deno.test("enabled without a provider reports no_provider", async () => {
    const r = await getSmsProvider(env({ SMS_ENABLED: "true", SMS_PROVIDER: "twilio" })).send("+1", "x");
    assertEquals(r, { sent: false, reason: "no_provider" });
});

Deno.test("message body names the order", () => {
    assertEquals(
        kitchenAlertSmsBody({ order_number: "ORD-1", date_needed: "2026-10-28", time_needed: "3:00 PM" }),
        "Eli's: paid order #ORD-1 (2026-10-28 3:00 PM) has not been accepted for 3+ min. Please open the Front Desk.",
    );
});
