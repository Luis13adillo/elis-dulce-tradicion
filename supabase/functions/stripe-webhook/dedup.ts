// Pure webhook-dedup decision logic, split out so it can be unit-tested
// without importing index.ts (which calls Deno.serve at module load).
//
// Given the status of an already-recorded Stripe webhook event, decide whether
// the current delivery is a true duplicate to short-circuit, or an incomplete
// prior attempt to reprocess. We only skip when a prior attempt fully reached
// 'processed'. Any other state ('processing', 'failed', or a missing/unknown
// status) means the earlier attempt did not finish, so we reprocess. Because
// promote_pending_order is idempotent, reprocessing never double-creates an
// order or double-sends the confirmation email.
export function shouldSkipAsDuplicate(existingStatus: string | null | undefined): boolean {
    return existingStatus === "processed";
}
