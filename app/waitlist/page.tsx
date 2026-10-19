import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { WaitlistForm } from '@/components/forms/WaitlistForm';
import { Wordmark } from '@/components/ui/Wordmark';

export const metadata: Metadata = {
  title: 'Join the waitlist',
  description: `${BRAND.tagline} Join the waitlist for first access when we open.`,
  openGraph: {
    title: `${BRAND.name} — opening soon`,
    description: BRAND.tagline,
    url: '/waitlist',
  },
};

const POINTS = [
  {
    title: 'Made here',
    body: 'Every piece is designed and made by an independent Australian label, in small batches.',
  },
  {
    title: 'One of one',
    body: 'Ready to ship, made to order, or the only one there is. Nothing mass-produced.',
  },
  {
    title: 'Ask the maker',
    body: 'Questions about fit, fabric or a custom version go straight to the person who made it.',
  },
];

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Pre-launch landing page. Standalone (no shop header or bag) so it can be shared on its own,
 * and served at "/" when WAITLIST_MODE=true (see middleware.ts).
 */
export default function WaitlistPage({ searchParams }: { searchParams: SearchParams }) {
  const ref = typeof searchParams.ref === 'string' ? searchParams.ref.slice(0, 60) : undefined;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="container-page flex items-center justify-between py-6">
        <Wordmark />
        <p className="eyebrow">Opening soon</p>
      </header>

      <main id="main" className="flex-1">
        <section className="container-page grid gap-12 pb-16 pt-8 md:pt-16 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:pb-24">
          <div className="flex flex-col justify-center">
            <p className="eyebrow">Independent Australian fashion</p>
            <h1 className="mt-4 max-w-[14ch] text-[48px] leading-[0.95] md:text-[80px]">
              Pieces nobody else is wearing.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[16px] text-muted md:text-[17px]">
              {BRAND.name} is a new marketplace for original fashion from independent Australian
              makers. Join the waitlist for first access to the launch collection.
            </p>
          </div>
          <div className="card p-6 md:p-10">
            <h2 className="text-[28px] leading-tight md:text-[32px]">Get first access</h2>
            <p className="mb-8 mt-2 text-[14px] text-muted">
              Shoppers hear first when we open. Makers can apply to launch with us.
            </p>
            <WaitlistForm source={ref} />
          </div>
        </section>

        <section aria-label="Why One Off" className="border-t border-line bg-stone-light">
          <ul role="list" className="container-page grid gap-10 py-14 md:grid-cols-3 md:gap-12">
            {POINTS.map((p, i) => (
              <li key={p.title}>
                <p className="eyebrow">0{i + 1}</p>
                <h3 className="mt-3 text-[26px] leading-tight">{p.title}</h3>
                <p className="mt-2 max-w-[36ch] text-[14px] text-muted">{p.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="container-page grid gap-6 py-14 md:grid-cols-[1fr_2fr] md:gap-12">
          <h2 className="text-[32px] leading-tight md:text-[40px]">For makers</h2>
          <div className="max-w-[60ch] space-y-3 text-[15px] text-muted">
            <p>
              We’re inviting a small group of labels to launch with us. You keep your brand and your
              story. We handle checkout, payments and buyer protection.
            </p>
            <p>
              A 15% commission on each sale, shipping goes to you, and payouts are handled by
              Stripe. Choose “I’m a maker” above and we’ll be in touch personally.
            </p>
          </div>
        </section>
      </main>

      <footer className="container-page flex flex-col gap-3 border-t border-line py-8 text-[12px] text-muted-2 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {BRAND.name} · Made in Australia
        </p>
        <p className="flex gap-6">
          <a href={`mailto:${BRAND.supportEmail}`} className="link">
            {BRAND.supportEmail}
          </a>
          <Link href="/help/privacy" className="link">
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
