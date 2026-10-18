/**
 * One Off's returns policy: the single source for every surface (pages, product, bag, checkout,
 * emails). Change the policy here. Australian Consumer Law guarantees can't be excluded, so a
 * summary must always say "no change-of-mind returns" — see tests/unit/returns-copy.test.ts.
 */
export const RETURNS = {
  short: "No change-of-mind returns. Faulty or not as described? We'll make it right.",
  shortCustom:
    "Made to your measurements. No change-of-mind returns — if it doesn't match what was agreed, the maker will alter it.",
  reportWindowDays: 7,
  policyHeading: 'Returns',
  policyBody:
    "Every piece on One Off is made in small runs or made to order, so we don't accept change-of-mind returns. Please check sizing and ask the maker anything before you buy.",
  faultHeading: "If something's wrong",
  faultBody:
    "If your piece arrives faulty, damaged, or isn't as described, tell us within 7 days of delivery with photos. The maker will repair, replace or refund it. For custom pieces made to your measurements, the maker will first alter it to fit what was agreed.",
  aclNote: "This doesn't affect your rights under Australian Consumer Law.",
  checkoutAck: "I understand One Off pieces can't be returned for change of mind.",
};

/** Stored on each order with the buyer's acknowledgement. Bump when the policy text changes. */
export const RETURNS_POLICY_VERSION = '2026-10-19';

/** Shown on Stripe Checkout above the pay button. */
export const RETURNS_STRIPE_SUBMIT =
  'No change-of-mind returns. Faulty or not as described items are repaired, replaced or refunded.';

/** Business days a maker has to respond to a claim before it escalates to One Off. */
export const CLAIM_RESPONSE_BUSINESS_DAYS = 2;

export const CLAIM_REASONS = [
  { value: 'faulty', label: 'Faulty' },
  { value: 'damaged', label: 'Damaged on arrival' },
  { value: 'not_as_described', label: 'Not as described' },
  { value: 'wrong_item', label: 'Wrong item, size or colour sent' },
  { value: 'custom_fit', label: "Custom piece doesn't match the agreed measurements" },
] as const;

export type ClaimReason = (typeof CLAIM_REASONS)[number]['value'];

/** Made-to-order pieces (and commissions) are made to the buyer's measurements. */
export function isCustomType(productType: string) {
  return productType === 'made_to_order';
}

export function returnsLine(productType: string) {
  return isCustomType(productType) ? RETURNS.shortCustom : RETURNS.short;
}
