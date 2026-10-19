import type { FulfilmentStatus } from './types';

export interface ReviewEligibilityInput {
  userId: string | null;
  buyerUserId: string | null;
  fulfilmentStatus: FulfilmentStatus;
  alreadyReviewed: boolean;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Reviews are only accepted from the purchasing buyer, once, after delivery. */
export function reviewEligibility(input: ReviewEligibilityInput): Eligibility {
  if (!input.userId) return { ok: false, reason: 'Sign in to leave a review.' };
  if (!input.buyerUserId || input.buyerUserId !== input.userId) {
    return { ok: false, reason: 'Only the buyer of this piece can review it.' };
  }
  if (input.fulfilmentStatus !== 'delivered' && input.fulfilmentStatus !== 'completed') {
    return { ok: false, reason: 'You can review this piece once it has been delivered.' };
  }
  if (input.alreadyReviewed) return { ok: false, reason: 'You have already reviewed this piece.' };
  return { ok: true };
}
