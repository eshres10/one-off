import { describe, expect, it } from 'vitest';
import { reviewEligibility } from '@/lib/domain/reviews';

describe('review eligibility', () => {
  const base = {
    userId: 'u1',
    buyerUserId: 'u1',
    fulfilmentStatus: 'delivered' as const,
    alreadyReviewed: false,
  };

  it('allows the buyer to review a delivered item once', () => {
    expect(reviewEligibility(base)).toEqual({ ok: true });
  });
  it.each(['paid', 'preparing', 'shipped', 'cancelled', 'refunded'] as const)(
    'rejects %s items',
    (status) => {
      expect(reviewEligibility({ ...base, fulfilmentStatus: status }).ok).toBe(false);
    },
  );
  it('rejects other users, guests and duplicates', () => {
    expect(reviewEligibility({ ...base, userId: 'u2' }).ok).toBe(false);
    expect(reviewEligibility({ ...base, userId: null }).ok).toBe(false);
    expect(reviewEligibility({ ...base, buyerUserId: null }).ok).toBe(false);
    expect(reviewEligibility({ ...base, alreadyReviewed: true }).ok).toBe(false);
  });
});
