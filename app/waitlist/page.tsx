import Link from 'next/link';
import type { Metadata } from 'next';
import { BRAND } from '@/lib/brand';
import { TERMS } from '@/lib/studio/terms';
import { WaitlistForm } from '@/components/forms/WaitlistForm';
import { BoxButtonGroup, boxButtonClass } from '@/components/ui/Button';
import { Img as Image } from '@/components/ui/Img';
import { Wordmark } from '@/components/ui/Wordmark';

export const metadata: Metadata = {
  title: 'Join the waitlist',
  description: `${BRAND.tagline} Join the waitlist for first access when we open.`,
  openGraph: {
    title: `${BRAND.name} — opening soon`,
    description: BRAND.tagline,
    url: '/waitlist',
    images: [{ url: '/waitlist/hero.jpg', width: 1024, height: 1536 }],
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
      <main id="main" className="flex-1">
        <section aria-labelledby="hero-title" className="grid lg:min-h-screen lg:grid-cols-2">
          <div className="relative flex h-[min(82vh,760px)] min-h-[520px] flex-col justify-between overflow-hidden text-ground lg:h-auto lg:min-h-screen">
            <Image
              src="/waitlist/hero.jpg"
              alt="A model wearing a white flower earring and a pastel silk halter top"
              fill
              priority
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover object-[35%_20%]"
            />
            <span
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.22),rgba(0,0,0,0)_28%,rgba(0,0,0,0)_40%,rgba(0,0,0,0.62))]"
            />
            <header className="bleed relative flex items-center justify-between py-6">
              <Wordmark />
              <p className="text-[11px] uppercase tracking-label">Opening soon</p>
            </header>
            <div className="bleed relative pb-10 md:pb-14">
              <p className="text-[11px] uppercase tracking-wide2">Independent Australian fashion</p>
              <h1
                id="hero-title"
                className="mt-4 max-w-[12ch] text-[clamp(52px,7vw,104px)] leading-[0.92]"
              >
                Pieces nobody else is wearing.
              </h1>
              <BoxButtonGroup className="mt-8 lg:hidden">
                <a href="#join" className={boxButtonClass('min-w-[200px]')}>
                  Join the waitlist
                </a>
              </BoxButtonGroup>
            </div>
          </div>
          <div
            id="join"
            className="flex scroll-mt-4 flex-col justify-center px-gutter py-12 md:py-16 lg:px-16 xl:px-24"
          >
            <div className="mx-auto w-full max-w-[480px]">
              <p className="text-[16px] text-muted md:text-[17px]">
                {BRAND.name} is a new marketplace for original fashion from independent Australian
                makers. Join the waitlist for first access to the launch collection.
              </p>
              <div className="card mt-8 p-6 md:p-10">
                <h2 className="text-[28px] leading-tight md:text-[32px]">Get first access</h2>
                <p className="mb-8 mt-2 text-[14px] text-muted">
                  Shoppers hear first when we open. Makers can apply to sell.
                </p>
                <WaitlistForm source={ref} />
              </div>
            </div>
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
              Makers from anywhere in Australia can apply. We review every application by hand, so
              everything on One Off is genuinely made by the people selling it. You keep your brand
              and your story. We handle checkout, payments and buyer protection.
            </p>
            <p>
              A {TERMS.standardCommissionPct}% commission on each sale, shipping goes to you, and
              payouts are handled by Stripe.
            </p>
            <Link
              href="/sell/apply"
              className={boxButtonClass('mt-3 min-w-[200px]')}
              data-testid="waitlist-apply-to-sell"
            >
              Apply to sell
            </Link>
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
