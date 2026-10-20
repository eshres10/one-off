import { SITE } from '@/lib/site/config';
import { TERMS } from '@/lib/studio/terms';

/** How it works (/how-it-works). Copy from the design; edit freely. */
export const HOW_IT_WORKS = {
  meta: {
    title: 'How it works',
    description:
      'Every piece on Off One comes from the person who made it. Ready to ship, made to order or a custom request: here’s how buying works.',
  },
  kicker: 'How it works',
  title: 'Straight from',
  titleItalic: 'the studio to you.',
  intro:
    'Off One works like any shop, with one difference: every piece comes from the person who made it. Here’s what that means for your order.',
  waysKicker: 'Three ways to buy',
  ways: [
    {
      badge: 'Ready to ship',
      line: 'Made, in stock, and sent within 2–3 days.',
      image: '/seed/navy-satin-slip.jpg',
      href: '/discover?avail=rts',
    },
    {
      badge: 'Made to order',
      line: 'Cut and sewn in your size after you order. Usually 1–3 weeks.',
      image: '/seed/embroidered-ruffle-dress.jpg',
      href: '/discover?avail=mto',
    },
    {
      badge: 'Have it made',
      line: 'Describe what you want. Up to three makers send you a quote, you choose.',
      image: '/seed/wine-satin-halter-set.jpg',
      href: '/have-it-made',
    },
  ],
  stepsKicker: 'Your order, step by step',
  steps: [
    {
      title: 'Find your piece',
      body: 'Browse by occasion, maker or what’s new. Filter to your size and see what can be made for you.',
    },
    {
      title: 'Order in your size',
      body: 'Pay once, even across several makers. Your saved measurements go to the maker for made-to-order pieces.',
    },
    {
      title: 'Made and sent',
      body: 'Each maker sends their piece from their own studio, with tracking. You’ll get an update at every step.',
    },
    {
      title: 'Wear it well',
      body: 'Love it? Leave a review. Something wrong? Report it and we’ll make it right with the maker.',
    },
  ],
  panels: {
    payment: {
      kicker: 'Payment',
      title: 'Held until it arrives.',
      body: `You pay Off One at checkout. The maker is paid ${TERMS.releaseDaysAfterDelivery === 3 ? 'three' : TERMS.releaseDaysAfterDelivery} days after your piece is delivered, so your money is protected the whole way.`,
    },
    delivery: {
      kicker: 'Delivery',
      title: 'One order, several parcels.',
      body: 'Each maker ships from their own studio, Australia-wide. You get tracking for every parcel, and one place to follow them all.',
    },
    returns: {
      kicker: 'Returns',
      title: 'Fair, and clear up front.',
      // The shared returns policy, in the panel's short form.
      body: `Ready to ship? Return it unworn within ${SITE.returns.readyToShipWindowDays} days. Made to order or one of one? It’s made for you, so no change-of-mind returns. Faulty or not as described? We’ll repair, replace or refund.`,
    },
  },
  fit: {
    title: 'Not sure about fit?',
    body: 'Save your measurements once and we’ll use them everywhere. Or message the maker before you order: they’ll tell you how a piece fits, what the fabric feels like, or whether it can be made longer.',
    image: '/seed/satin-open-back-jumpsuit.jpg',
  },
};
