import { TERMS } from './terms';

const weekday = TERMS.payoutWeekday[0]!.toUpperCase() + TERMS.payoutWeekday.slice(1);

/**
 * The deal, line by line, shown above the Seller Agreement. The founding line only appears for a
 * shop that actually holds a founding spot.
 */
export function dealTerms(foundingNumber: number | null): Array<[string, string]> {
  const standard = TERMS.standardCommissionPct;
  return [
    foundingNumber
      ? [
          `${TERMS.foundingCommissionPct}% commission for ${TERMS.foundingMonths} months`,
          `As founding maker Nº ${String(foundingNumber).padStart(2, '0')}, from the day your shop goes live. Then ${standard}% of each piece’s price, never on shipping.`,
        ]
      : [`${standard}% commission`, 'On each piece’s price, never on shipping.'],
    [
      'Paid weekly',
      `Each order is released ${TERMS.releaseDaysAfterDelivery} days after delivery and paid out every ${weekday}.`,
    ],
    ['You make and ship', 'You send each order by its ship-by date and add tracking.'],
    [
      'Faulty means fixed',
      'Ready-to-ship pieces can be returned within 14 days if unworn, with tags. No change-of-mind returns on made-to-order, custom or one-of-one pieces. Faulty or not as described: you repair, replace or refund.',
    ],
    ['Your photos stay yours', 'We show them on One Off and to promote your pieces.'],
    ['Leave any time', 'Close your shop whenever you like; open orders still get sent.'],
  ];
}
