// deno test supabase/functions/_tests/expiredPaymentIntents.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
    cancelExpiredPaymentIntent,
    expiredCancelIdempotencyKey,
    isFinalOutcome,
    type StripePiLike,
} from "../_shared/expiredPaymentIntents.ts";

function fakeStripe(status: string | Error) {
    const cancels: Array<{ id: string; key: string }> = [];
    const api: StripePiLike = {
        retrieve: (id) => status instanceof Error ? Promise.reject(status) : Promise.resolve({ id, status }),
        cancel: (id, _p, o) => { cancels.push({ id, key: o.idempotencyKey }); return Promise.resolve({ id, status: "canceled" }); },
    };
    return { api, cancels };
}

Deno.test("cancels a still-open PI with the idempotency key", async () => {
    const { api, cancels } = fakeStripe("requires_payment_method");
    assertEquals(await cancelExpiredPaymentIntent(api, "pend1", "pi_1"), "canceled");
    assertEquals(cancels, [{ id: "pi_1", key: "expire_cancel_pend1_pi_1" }]);
    assertEquals(expiredCancelIdempotencyKey("pend1", "pi_1"), "expire_cancel_pend1_pi_1");
});

Deno.test("never cancels a succeeded PI; reports it for review", async () => {
    const { api, cancels } = fakeStripe("succeeded");
    assertEquals(await cancelExpiredPaymentIntent(api, "p", "pi"), "succeeded_late");
    assertEquals(cancels.length, 0);
});

Deno.test("already canceled / processing / missing", async () => {
    assertEquals(await cancelExpiredPaymentIntent(fakeStripe("canceled").api, "p", "pi"), "already_canceled");
    const proc = await cancelExpiredPaymentIntent(fakeStripe("processing").api, "p", "pi");
    assertEquals(proc, "processing");
    assertEquals(isFinalOutcome(proc), false);
    const missing = Object.assign(new Error("No such payment_intent"), { code: "resource_missing" });
    assertEquals(await cancelExpiredPaymentIntent(fakeStripe(missing).api, "p", "pi"), "missing");
    await assertRejects(() => cancelExpiredPaymentIntent(fakeStripe(new Error("network")).api, "p", "pi"));
});
