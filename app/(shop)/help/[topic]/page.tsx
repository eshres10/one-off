import { notFound } from 'next/navigation';
import { BRAND } from '@/lib/brand';

const TOPICS: Record<string, { title: string; body: string[] }> = {
  'buyer-protection': {
    title: 'Buyer protection',
    body: [
      `Every purchase made through ${BRAND.name} checkout is protected. If your piece doesn’t arrive, arrives damaged, or is significantly different from its listing, contact us within 14 days of the estimated delivery date and we’ll work with the maker to repair, replace or refund it.`,
      'Protection only applies to purchases completed through our checkout. Makers will never ask you to pay by bank transfer, PayID or any other method — messages that do are blocked automatically. If anyone asks you to pay off-platform, please let us know.',
      'Custom commissions (our concierge pilot) are paid through secure Stripe payment links sent by our team, and are covered too.',
    ],
  },
  'shipping-returns': {
    title: 'Shipping & returns',
    body: [
      'Makers ship directly from their studios across Australia with tracked Australia Post or courier services. Each maker sets their own flat shipping rate, which you’ll see in full before you pay. If your bag includes pieces from several makers, they arrive in separate parcels.',
      'Ready-to-ship pieces dispatch within the maker’s stated handling time. Made-to-order pieces are made after you order, so they arrive after the production lead time shown on the listing.',
      'Ready-to-ship pieces can usually be returned within 14 days of delivery in original condition — check each maker’s policy on the product page. Made-to-order and one-of-one pieces are final sale unless faulty, as required by Australian Consumer Law.',
    ],
  },
  selling: {
    title: 'Selling on ' + BRAND.name,
    body: [
      'We work with a curated group of independent Australian makers and micro-labels. Selling is by invitation while we’re in our early stage — we don’t offer open registration.',
      'If you make original clothing in Australia and think you’d be a good fit, email us with a link to your work.',
    ],
  },
};

export function generateMetadata({ params }: { params: { topic: string } }) {
  return { title: TOPICS[params.topic]?.title ?? 'Help' };
}

export default function HelpPage({ params }: { params: { topic: string } }) {
  const topic = TOPICS[params.topic];
  if (!topic) notFound();
  return (
    <article className="container-page max-w-2xl pt-10">
      <p className="eyebrow">Help</p>
      <h1 className="mt-2 text-4xl">{topic.title}</h1>
      <div className="mt-6 space-y-4 text-ink-soft">
        {topic.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <p className="mt-8 text-sm">
        Need help? Email{' '}
        <a className="link" href={`mailto:${BRAND.supportEmail}`}>
          {BRAND.supportEmail}
        </a>
        .
      </p>
    </article>
  );
}
