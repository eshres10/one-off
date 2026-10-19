import { SITE } from '@/lib/site/config';

const r = SITE.returns;

/** The marketplace-wide returns policy every shop runs under, as rows (Shop settings → Returns & care). */
export const RETURNS_TABLE: Array<[string, string]> = [
  [
    'Ready to ship',
    `Change-of-mind returns within ${r.readyToShipWindowDays} days of delivery, ${r.condition}. The buyer pays return postage. They’re refunded when you mark it received (or automatically ${r.makerConfirmDays} business days after tracking shows it arrived).`,
  ],
  ['Made to order', 'No change-of-mind returns: made after purchase, to the buyer’s size.'],
  ['Custom request', 'No change-of-mind returns: made to one person’s brief.'],
  ['One of one', 'No change-of-mind returns: only one exists.'],
  [
    'Faulty or not as described',
    'Always covered, any piece: repair, replace or refund (Australian Consumer Law), through Report a problem.',
  ],
];
