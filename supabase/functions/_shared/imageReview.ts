/**
 * Pure decision rules for the pre-payment image review workflow.
 *
 * Shared between the review-order-image / create-payment-intent Edge
 * Functions (Deno) and the Vitest suite (Node) — keep this file free of any
 * Deno- or browser-specific imports.
 *
 * Business rule (locked 2026-07-28): fail-CLOSED. Only an explicit MATCH
 * proceeds automatically; MISMATCH, UNCERTAIN, and every failure shape
 * (API error, timeout, model refusal → ANALYSIS_FAILED) hold for manual
 * staff review. Shadow mode records verdicts but never holds anyone.
 */

export type ReviewMode = "off" | "shadow" | "enforce";

export type AiVerdict = "MATCH" | "MISMATCH" | "UNCERTAIN" | "ANALYSIS_FAILED";

export type ReviewStatus =
    | "not_required"
    | "pending"
    | "passed"
    | "needs_review"
    | "approved"
    | "declined"
    | "review_expired";

/** Statuses that allow a PaymentIntent to be created for an image-bearing order. */
export const PAYABLE_REVIEW_STATUSES: readonly string[] = ["passed", "approved"];

/**
 * Should this order be held away from checkout right now?
 * Used by review-order-image responses and mirrored by the authoritative
 * gate in create-payment-intent.
 */
export function heldFor(mode: string, hasImage: boolean, reviewStatus: string): boolean {
    if (mode !== "enforce" || !hasImage) return false;
    return !PAYABLE_REVIEW_STATUSES.includes(reviewStatus) && reviewStatus !== "not_required";
}

/**
 * Map an AI verdict to the stored review status + routing decision.
 * Only called when an image exists and mode is shadow or enforce.
 */
export function resolveReviewOutcome(
    mode: "shadow" | "enforce",
    verdict: AiVerdict,
): { status: "passed" | "needs_review"; held: boolean } {
    if (mode === "shadow") {
        // Shadow: record everything, never hold — calibration only.
        return { status: "passed", held: false };
    }
    if (verdict === "MATCH") {
        return { status: "passed", held: false };
    }
    // MISMATCH, UNCERTAIN, ANALYSIS_FAILED (incl. timeout/refusal upstream)
    return { status: "needs_review", held: true };
}
