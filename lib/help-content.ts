import { PAYMENT_HELD, RETURNS } from '@/lib/content/returns';
import { BRAND } from '@/lib/brand';
import { SITE } from '@/lib/site/config';
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
  about: {
    kicker: 'About',
    title: 'Made by people, not factories',
    intro: `${BRAND.name} is a marketplace for original clothing from independent Australian makers — small studios making statement dresses, occasionwear and one-of-one pieces in small batches.`,
    sections: [
      {
        heading: 'Why we started',
        body: [
          'Independent makers make beautiful things, but selling online usually means a lonely Instagram account or a crowded marketplace. We built a place that feels like a fashion house and treats every maker as the designer they are.',
        ],
      },
      {
        heading: 'How we choose makers',
        body: [
          'Every studio is reviewed by our team before it goes live. We look for original design, honest materials and careful finishing. No resellers and no dropshipping.',
        ],
      },
    ],
  },
  'how-it-works': {
    kicker: 'How it works',
    title: 'Browse, ask, buy — directly from the maker',
    intro:
      'Every piece ships from the studio that made it. You pay once through our secure checkout, even when your bag has pieces from several makers.',
    sections: [
      {
        heading: 'Ready to ship',
        body: [
          'Already made and waiting for you. Dispatched within the maker’s handling time, usually 1–3 business days.',
        ],
      },
      {
        heading: 'Made to order',
        body: [
          'Cut and sewn for you after you order, in your size. The product page shows the production time and an estimated delivery range before you pay.',
        ],
      },
      {
        heading: 'One of one',
        body: [
          'A single, unique piece — often reworked from vintage or deadstock fabric. When it’s gone, it’s gone.',
        ],
      },
      {
        heading: 'Custom pieces',
        body: [
          'Some makers accept custom commissions. Send a brief, get a quote with price, deposit and timing, and our team sends a secure payment link if you accept. This is a pilot.',
        ],
      },
      {
        id: 'buyer-protection',
        heading: 'Buyer protection',
        body: [
          `Pay through ${BRAND.name} and you’re covered. ${PAYMENT_HELD} If a piece doesn’t arrive, arrives damaged, or isn’t as described, tell us within ${RETURNS.reportWindowDays} days of delivery (or of the estimated delivery date, if it hasn’t arrived) and we’ll make it right.`,
          'Makers will never ask you to pay by bank transfer, PayID or any other method. Messages that try are blocked automatically.',
        ],
      },
    ],
  },
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
  shipping: {
    kicker: 'Help',
    title: 'Shipping',
    intro:
      'Makers ship directly from their studios across Australia with tracking. Australia only for now.',
    sections: [
      {
        heading: 'Costs',
        body: [
          'Each maker sets a flat shipping rate per order — [placeholder: sample A$12 per maker] — and some offer free shipping above a threshold. You see the full cost, including shipping, before you pay.',
        ],
      },
      {
        heading: 'Several makers, one order',
        body: [
          'If your bag has pieces from several makers, they arrive in separate parcels and you get tracking for each.',
        ],
      },
      {
        heading: 'Timing',
        body: [
          'Ready-to-ship pieces dispatch within the maker’s handling time. Made-to-order pieces dispatch after the production time shown on the listing. Delivery usually takes 2–6 business days after dispatch.',
        ],
      },
    ],
  },
  'returns-and-fit': {
    kicker: 'Help',
    title: 'Fit & sizing',
    intro: 'Getting the fit right matters more when a piece is made for you.',
    sections: [
      {
        heading: 'Returns',
        body: [
          RETURNS.short,
          'The full policy, including how to report a faulty piece, is on our Returns & faults page.',
        ],
      },
      {
        heading: SITE.fitPromise ? 'Our fit promise' : 'Getting the fit right',
        body: [
          ...(SITE.fitPromise ? [SITE.fitPromise] : []),
          'Not sure about a size? Ask the maker before you buy — they know their patterns best and usually reply within hours.',
        ],
      },
      {
        id: 'how-to-measure',
        heading: 'How to measure',
        body: [
          'Bust: around the fullest part, keeping the tape level. Waist: around the narrowest part of your torso. Hips: around the fullest part, feet together. Height: barefoot, against a wall.',
          'Save your measurements in your account to make sizing questions and custom requests quicker.',
        ],
      },
    ],
  },
  contact: {
    kicker: 'Help',
    title: 'Contact & help',
    intro: `Email ${BRAND.supportEmail} and we’ll reply within one business day.`,
    sections: [],
    faqs: [
      {
        q: 'Where is my order?',
        a: 'Each maker ships separately. Your order page shows the status and tracking for each parcel. Made-to-order pieces ship after production.',
      },
      {
        q: 'Do I need an account to buy?',
        a: 'No. Guest checkout is the default. Create an account later with the same email to see your orders.',
      },
      {
        q: 'Can I change my size after ordering?',
        a: 'Message the maker straight away from your order — for made-to-order pieces this is usually possible before cutting starts.',
      },
      { q: 'Do you ship internationally?', a: 'Not yet. We ship within Australia only.' },
      {
        q: 'How do custom requests work?',
        a: 'Send a brief to a maker who accepts commissions. If you like their quote, we send a secure Stripe link for the deposit. Nothing is charged until you accept.',
      },
    ],
  },
  'sell-with-us': {
    kicker: 'Sell with us',
    title: 'Make it. We’ll help you sell it.',
    intro:
      'Makers from anywhere in Australia can apply to sell. We review every application by hand, so everything on One Off is genuinely made by the people selling it.',
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
  privacy: {
    kicker: 'Legal',
    title: 'Privacy',
    intro: '[placeholder] This page is a draft and must be reviewed by a lawyer before launch.',
    sections: [
      {
        heading: 'What we collect',
        body: [
          'Account details, orders, saved measurements you choose to store, and messages with makers. Card details are handled by Stripe and never reach our servers.',
        ],
      },
      {
        heading: 'How we use it',
        body: [
          'To process orders, connect you with makers, prevent fraud, and send emails you’ve asked for. We don’t sell personal information.',
        ],
      },
    ],
  },
};
