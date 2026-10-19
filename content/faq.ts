import { RETURNS, RETURNS_FAQ } from '@/lib/content/returns';
import { SITE } from '@/lib/site/config';
import { TERMS } from '@/lib/studio/terms';

/**
 * Help & FAQ (/help). Each question has an id, so other pages can link straight to it
 * (/help#made-to-order). Answers must match the policies built into the site: returns by piece
 * type, makers paid days after delivery, makers replying to a problem within business days.
 */
export interface FaqItem {
  id: string;
  q: string;
  a: string;
}
export interface FaqCategory {
  id: string;
  title: string;
  items: FaqItem[];
}

const payDays = TERMS.releaseDaysAfterDelivery;
const reply = SITE.cases.makerReplyBusinessDays;

export const FAQ: FaqCategory[] = [
  {
    id: 'orders-delivery',
    title: 'Orders & delivery',
    items: [
      {
        id: 'when-will-my-order-arrive',
        q: 'When will my order arrive?',
        a: 'Each piece shows its own arrival window at checkout. Ready-to-ship pieces usually arrive in 3–7 business days. Made-to-order pieces depend on the maker’s lead time, shown on every listing.',
      },
      {
        id: 'several-parcels',
        q: 'Why did my order arrive in several parcels?',
        a: 'Every maker ships from their own studio, so an order with pieces from more than one maker arrives in more than one parcel. Each has its own tracking, and your order page follows them all in one place.',
      },
      {
        id: 'ship-outside-australia',
        q: 'Do you ship outside Australia?',
        a: 'Not yet. Makers ship Australia-wide, to any address in Australia.',
      },
    ],
  },
  {
    id: 'made-to-order-sizing',
    title: 'Made to order & sizing',
    items: [
      {
        id: 'made-to-order',
        q: 'What does made to order mean?',
        a: 'The maker cuts and sews the piece in your size after you order it. Each listing shows how long that takes, usually 1–3 weeks, and you’ll get an update at every step.',
      },
      {
        id: 'find-my-size',
        q: 'How do I find my size?',
        a: 'Use our size guide, then check the maker’s own notes on each piece. Save your measurements in your account once and we’ll send them to the maker whenever you order made to order.',
      },
      {
        id: 'change-size',
        q: 'Can I change my size after ordering?',
        a: 'Message the maker straight away from your order. For made-to-order pieces this is usually possible before cutting starts.',
      },
      {
        id: 'alterations',
        q: 'Can a maker change a piece for me?',
        a: 'Often, yes. Many makers will lengthen a hem, change a strap or make a piece in another fabric. Ask them before you order, or send a custom request.',
      },
    ],
  },
  {
    id: 'returns-problems',
    title: 'Returns & problems',
    items: [
      ...RETURNS_FAQ.map(({ id, q, a }) => ({ id, q, a })),
      {
        id: 'something-wrong',
        q: 'Something’s wrong with my piece. What do I do?',
        a: `Choose ‘Report a problem’ on the piece in your order within ${RETURNS.reportWindowDays} days of delivery, with a photo. The maker replies within ${reply} business days with a repair, replacement or refund, and if you can’t agree, One Off steps in. Faulty or not as described is always covered, whatever kind of piece it is.`,
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments',
    items: [
      {
        id: 'how-can-i-pay',
        q: 'How can I pay?',
        a: `Card, Apple Pay, Google Pay or Afterpay (${SITE.payments.afterpayInstalments} interest-free payments). Everything is paid once at checkout, even when your order comes from several makers.`,
      },
      {
        id: 'when-is-the-maker-paid',
        q: 'When is the maker paid?',
        a: `Your payment is held by One Off until your piece arrives. The maker is paid ${payDays} days after delivery, so if something’s wrong there’s time to sort it out.`,
      },
      {
        id: 'is-payment-secure',
        q: 'Is my payment secure?',
        a: 'Payments are handled by Stripe, and we never see or store your card details. Makers will never ask you to pay them directly: if anyone does, tell us.',
      },
    ],
  },
  {
    id: 'selling',
    title: 'Selling on One Off',
    items: [
      {
        id: 'who-can-sell',
        q: 'Who can sell on One Off?',
        a: 'Emerging Australian designers who make their own clothes, themselves or with a small local team. We review every application by hand. No resellers or dropshipping.',
      },
      {
        id: 'cost-to-sell',
        q: 'What does it cost to sell?',
        a: `Nothing to list. One Off takes ${TERMS.standardCommissionPct}% of each piece’s price when it sells, never on shipping. Founding makers pay ${TERMS.foundingCommissionPct}% for their first ${TERMS.foundingMonths} months.`,
      },
      {
        id: 'when-do-makers-get-paid',
        q: 'When do I get paid?',
        a: `Each order is released ${payDays} days after delivery, and Stripe pays your balance to your bank every ${TERMS.payoutWeekday[0]!.toUpperCase()}${TERMS.payoutWeekday.slice(1)}.`,
      },
    ],
  },
];

export const HELP_PAGE = {
  meta: {
    title: 'Help & FAQ',
    description:
      'Answers about orders and delivery, made to order and sizing, returns, payments and selling on One Off.',
  },
  kicker: 'Help & FAQ',
  title: 'How can we help?',
  searchPlaceholder: 'Search questions, e.g. “made to order”',
  contact: {
    kicker: 'Still stuck?',
    title: 'Talk to a real person.',
    body: 'We reply within one business day, Monday to Friday. For an order, message the maker first: they know their piece best.',
    cta: 'Message us',
  },
};
