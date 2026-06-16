// Unit tests for the webhook-dedup decision. Run with: deno test
// Self-contained (no registry imports) so it runs offline.
import { shouldSkipAsDuplicate } from "./dedup.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
    if (actual !== expected) {
        throw new Error(msg ?? `expected ${String(expected)}, got ${String(actual)}`);
    }
}

Deno.test("skips only when the prior attempt fully processed", () => {
    assertEquals(shouldSkipAsDuplicate("processed"), true);
});

Deno.test("reprocesses an event left mid-flight ('processing')", () => {
    // This is the regression: previously a 'processing' (incomplete) prior
    // attempt was treated as a duplicate and silently dropped on retry.
    assertEquals(shouldSkipAsDuplicate("processing"), false);
});

Deno.test("reprocesses an event whose prior attempt failed", () => {
    assertEquals(shouldSkipAsDuplicate("failed"), false);
});

Deno.test("reprocesses when status is missing/unknown", () => {
    assertEquals(shouldSkipAsDuplicate(null), false);
    assertEquals(shouldSkipAsDuplicate(undefined), false);
    assertEquals(shouldSkipAsDuplicate("received"), false);
});
