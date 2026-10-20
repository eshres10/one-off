import { SITE } from '@/lib/site/config';

/**
 * Off One's returns policy in words. The per-type copy (ready to ship, made to order, one of one,
 * custom) lives in lib/returns/policy.ts; this file holds the marketplace-wide lines used where
 * no single piece is in view (footer, pages, emails, checkout). Australian Consumer Law
 * guarantees can't be excluded, and ready-to-ship pieces can come back, so any line ruling out
 * change-of-mind returns always names the piece types it covers (tests/unit/returns-copy.test.ts).
 */
const W = SITE.returns.readyToShipWindowDays;
export const RETURNS = {
  /** Every type at once, for places that aren't about one piece. */
  short: `Ready-to-ship pieces can be returned within ${W} days if unworn, with tags. Made-to-order, custom and one-of-one pieces can’t be returned for a change of mind. Faulty or not as described? We’ll make it right.`,
  /** Commissions (custom requests made to the buyer's measurements). */
  shortCustom:
    "Made to your brief, so there are no change-of-mind returns on custom pieces. If it doesn't match what was agreed, the maker will alter it.",
  reportWindowDays: 7,
  policyHeading: 'Change-of-mind returns',
  policyBody: `Ready-to-ship pieces can be returned for a change of mind within ${W} days of delivery, ${SITE.returns.condition}. Start the return from your order, send it back to the maker with tracking, and you’re refunded the item price once they receive it. Return postage is ${SITE.returns.returnPostagePaidBy === 'buyer' ? 'paid by you' : 'paid by us'}, and original shipping isn’t refunded. Made-to-order and custom pieces are made after you buy, and one-of-ones are the only one there is, so they can’t be returned for a change of mind. Please check the size guide or ask the maker before ordering.`,
  faultHeading: "If something's wrong",
  faultBody:
    "If your piece arrives faulty, damaged, or isn't as described, tell us within 7 days of delivery with photos. The maker will repair, replace or refund it. For custom pieces made to your measurements, the maker will first alter it to fit what was agreed.",
  aclNote: "This doesn't affect your rights under Australian Consumer Law.",
  checkoutAck: `I understand made-to-order, custom and one-of-one pieces can’t be returned for a change of mind, and ready-to-ship pieces can be returned within ${W} days if unworn, with tags.`,
  /** Checkout fine print above the pay button. */
  checkoutFinePrint: `Ready-to-ship pieces can be returned within ${W} days if unworn. Made-to-order and one-of-one pieces can’t be returned for a change of mind.`,
};

/** The "In short" box on the returns page (and the legal returns page). The lawyer can change them. */
export const RETURNS_IN_SHORT = [
  `Ready-to-ship pieces: return within ${W} days of delivery, unworn with tags, for a refund. Return postage is paid by ${SITE.returns.returnPostagePaidBy === 'buyer' ? 'you' : 'us'}.`,
  'Made-to-order, custom and one-of-one pieces: no change-of-mind returns.',
  'Faulty or not as described? We’ll repair, replace or refund.',
  'Your rights under Australian Consumer Law always apply.',
];

/** Help & FAQ answers about returns. */
export const RETURNS_FAQ = [
  {
    id: 'change-of-mind',
    q: 'Can I return something I changed my mind about?',
    a: `Yes, for ready-to-ship pieces: return it unworn, with tags, within ${W} days of delivery for a refund (return postage is on you). Made-to-order and one-of-one pieces are made or chosen just for you, so they can’t be returned for a change of mind. Many makers are happy to help with small alterations, so message them.`,
  },
  {
    id: 'how-to-return',
    q: 'How do I return a ready-to-ship piece?',
    a: 'Go to your order and choose ‘Return this piece’. Send it back to the maker with tracking, and we refund you as soon as they receive it.',
  },
];

/** Buyer reassurance (trust strip, checkout, FAQ): makers are paid after delivery, not dispatch. */
export const PAYMENT_HELD = 'Your payment is held until your piece arrives.';

/** Stored on each order with the buyer's acknowledgement. Bump when the policy text changes. */
export const RETURNS_POLICY_VERSION = '2026-10-20';

/** Shown on Stripe Checkout above the pay button. */
export const RETURNS_STRIPE_SUBMIT = `${RETURNS.checkoutFinePrint} Faulty or not as described items are repaired, replaced or refunded.`;

/** Business days a maker has to respond to a claim before it escalates to Off One. */
export const CLAIM_RESPONSE_BUSINESS_DAYS = 2;

export const CLAIM_REASONS = [
  { value: 'faulty', label: 'It’s faulty or damaged' },
  { value: 'not_as_described', label: 'It’s not as described' },
  { value: 'custom_fit', label: 'It wasn’t made to my measurements' },
  { value: 'other', label: 'Something else' },
  // Older reports may carry these.
  { value: 'damaged', label: 'Damaged on arrival' },
  { value: 'wrong_item', label: 'Wrong item, size or colour sent' },
  // Opened by a maker from a change-of-mind return that came back worn or damaged.
  { value: 'return_condition', label: 'Returned piece isn’t as it was sent' },
] as const;

/** What "Report a problem" offers, in order. "Wasn't made to my measurements" is made to order only. */
export const REPORT_REASONS = ['faulty', 'not_as_described', 'custom_fit', 'other'] as const;

/** Reasons that need at least one photo. */
export const PHOTO_REQUIRED_REASONS: readonly string[] = ['faulty', 'not_as_described', 'damaged'];

export const REQUESTED_OUTCOMES = [
  { value: 'repair', label: 'Repair it', detail: 'The maker fixes it and sends it back.' },
  { value: 'replace', label: 'Replace it', detail: 'The maker makes or sends you another one.' },
  { value: 'refund', label: 'Refund me', detail: 'Your money back to how you paid.' },
] as const;
export type RequestedOutcome = (typeof REQUESTED_OUTCOMES)[number]['value'];

export type ClaimReason = (typeof CLAIM_REASONS)[number]['value'];

/** Made-to-order pieces (and commissions) are made to the buyer's measurements. */
export function isCustomType(productType: string) {
  return productType === 'made_to_order';
}
