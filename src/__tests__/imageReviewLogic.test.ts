import { describe, it, expect } from 'vitest';
import {
  heldFor,
  resolveReviewOutcome,
  PAYABLE_REVIEW_STATUSES,
  type AiVerdict,
} from '../../supabase/functions/_shared/imageReview';

// Locked business rule (2026-07-28): fail-closed. Only MATCH proceeds
// automatically; MISMATCH, UNCERTAIN, ANALYSIS_FAILED (which upstream also
// covers timeouts and model refusals) all hold for manual review.

describe('resolveReviewOutcome — enforce mode', () => {
  it('MATCH proceeds to checkout', () => {
    expect(resolveReviewOutcome('enforce', 'MATCH')).toEqual({ status: 'passed', held: false });
  });

  it.each<AiVerdict>(['MISMATCH', 'UNCERTAIN', 'ANALYSIS_FAILED'])(
    '%s holds for manual review without creating payment',
    (verdict) => {
      expect(resolveReviewOutcome('enforce', verdict)).toEqual({
        status: 'needs_review',
        held: true,
      });
    },
  );
});

describe('resolveReviewOutcome — shadow mode (calibration)', () => {
  it.each<AiVerdict>(['MATCH', 'MISMATCH', 'UNCERTAIN', 'ANALYSIS_FAILED'])(
    '%s records but never holds anyone',
    (verdict) => {
      expect(resolveReviewOutcome('shadow', verdict)).toEqual({ status: 'passed', held: false });
    },
  );
});

describe('heldFor — routing decision', () => {
  it('off and shadow modes never hold', () => {
    for (const status of ['pending', 'needs_review', 'declined', 'review_expired']) {
      expect(heldFor('off', true, status)).toBe(false);
      expect(heldFor('shadow', true, status)).toBe(false);
    }
  });

  it('orders without a photo are never held (locked: no image → normal flow)', () => {
    expect(heldFor('enforce', false, 'not_required')).toBe(false);
    expect(heldFor('enforce', false, 'needs_review')).toBe(false);
  });

  it('enforce mode holds every non-payable review state', () => {
    for (const status of ['pending', 'needs_review', 'declined', 'review_expired']) {
      expect(heldFor('enforce', true, status)).toBe(true);
    }
  });

  it('enforce mode releases passed/approved (and no-photo not_required)', () => {
    expect(heldFor('enforce', true, 'passed')).toBe(false);
    expect(heldFor('enforce', true, 'approved')).toBe(false);
    expect(heldFor('enforce', true, 'not_required')).toBe(false);
  });
});

describe('PAYABLE_REVIEW_STATUSES — the create-payment-intent gate allowlist', () => {
  it('is exactly passed + approved (payment = acceptance; no other state can pay)', () => {
    expect([...PAYABLE_REVIEW_STATUSES].sort()).toEqual(['approved', 'passed']);
  });
});
