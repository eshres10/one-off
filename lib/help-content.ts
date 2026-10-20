import { PAYMENT_HELD, RETURNS } from '@/lib/content/returns';
import { BRAND } from '@/lib/brand';
import { TERMS } from '@/lib/studio/terms';

export interface HelpTopic {
  kicker: string;
  title: string;
  intro: string;
  sections: Array<{ id?: string; heading: string; body: string[] }>;
  faqs?: Array<{ q: string; a: string }>;
}

/**
 * Static page copy. Items marked [placeholder] are open decisions (see README → Open decisions)
 * and must be confirmed before launch; legal pages need review by a lawyer.
 */
export const HELP: Record<string, HelpTopic> = {
  'buyer-protection': {
    kicker: 'Help',
    title: 'Buyer protection',
    intro: `Every purchase made through ${BRAND.name} checkout is protected.`,
    sections: [
      {
        heading: 'What’s covered',
        body: [
          PAYMENT_HELD,
          `If your piece doesn’t arrive, arrives damaged, or is significantly different from its listing, tell us within ${RETURNS.reportWindowDays} days of delivery (or of the estimated delivery date, if it hasn’t arrived). We’ll work with the maker to repair, replace or refund it.`,
        ],
      },
      {
        heading: 'Keep it on the platform',
        body: [
          'Protection only applies to purchases completed through our checkout. Makers will never ask you to pay off-platform — if anyone does, please tell us.',
        ],
      },
    ],
  },
  'sell-with-us': {
    kicker: 'Sell with us',
    title: 'Make it. We’ll help you sell it.',
    intro:
      'Makers from anywhere in Australia can apply to sell. We review every application by hand, so everything on Off One is genuinely made by the people selling it.',
    sections: [
      {
        heading: 'What we look for',
        body: [
          'Original design, made in Australia, in small batches. Statement dresses, occasionwear, skirts and one-of-one pieces are our focus.',
        ],
      },
      {
        heading: 'How it works',
        body: [
          `Apply with your label and photos of your work. If you’re approved, you connect payouts and list your pieces. A ${TERMS.standardCommissionPct}% commission on each sale; shipping goes to you. Payouts are handled by Stripe. You keep your own brand and story, and we handle checkout and buyer protection.`,
        ],
      },
    ],
  },
};
