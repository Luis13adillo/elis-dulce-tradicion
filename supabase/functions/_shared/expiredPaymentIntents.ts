// Cancel the Stripe PaymentIntent of a pending_orders row that the hourly
// prune (prune_expired_pending_orders) has marked 'expired'. Without this a
// PI stays confirmable after expiry: a late payment would promote an order
// whose date/capacity/lead time were never rechecked, or — once the row is
// deleted after 7 days — strand a paid customer with no order (H4).
//
// Pure logic over a minimal Stripe surface so it can be unit-tested without
// the SDK. The caller (review-sweeps) supplies the real Stripe client.

export interface StripePiLike {
    retrieve(id: string): Promise<{ id: string; status: string }>;
    cancel(
        id: string,
        params: { cancellation_reason: "abandoned" },
        options: { idempotencyKey: string },
    ): Promise<{ id: string; status: string }>;
}

export type ExpiredCancelOutcome =
    | "canceled"          // we canceled it now
    | "already_canceled"  // Stripe already had it canceled
    | "succeeded_late"    // customer paid; needs a human (refund or honor)
    | "processing"        // payment in flight; leave unstamped, retry next sweep
    | "missing";          // PI no longer exists in Stripe

export function expiredCancelIdempotencyKey(pendingId: string, piId: string): string {
    return `expire_cancel_${pendingId}_${piId}`;
}

/** Statuses Stripe allows cancel() on. */
const CANCELABLE = new Set([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "requires_capture",
]);

export async function cancelExpiredPaymentIntent(
    stripe: StripePiLike,
    pendingId: string,
    piId: string,
): Promise<ExpiredCancelOutcome> {
    let pi: { status: string };
    try {
        pi = await stripe.retrieve(piId);
    } catch (e) {
        // deno-lint-ignore no-explicit-any
        if ((e as any)?.code === "resource_missing" || (e as any)?.statusCode === 404) return "missing";
        throw e;
    }
    if (pi.status === "canceled") return "already_canceled";
    if (pi.status === "succeeded") return "succeeded_late";
    if (pi.status === "processing") return "processing";
    if (!CANCELABLE.has(pi.status)) return "processing";

    await stripe.cancel(
        piId,
        { cancellation_reason: "abandoned" },
        { idempotencyKey: expiredCancelIdempotencyKey(pendingId, piId) },
    );
    return "canceled";
}

/** Outcomes that are final and get stamped on the row. */
export function isFinalOutcome(o: ExpiredCancelOutcome): boolean {
    return o !== "processing";
}
