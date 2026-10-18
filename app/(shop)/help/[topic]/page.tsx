import { notFound } from 'next/navigation';
import { HELP } from '@/lib/help-content';
import { Accordion } from '@/components/ui/Panels';
import { SellerInterestForm } from '@/components/forms/SellerInterestForm';
import { BRAND } from '@/lib/brand';

export function generateMetadata({ params }: { params: { topic: string } }) {
  return { title: HELP[params.topic]?.title ?? 'Help' };
}

const NAV = [
  ['how-it-works', 'How it works'],
  ['shipping', 'Shipping'],
  ['returns-and-fit', 'Returns & fit'],
  ['contact', 'Contact & help'],
  ['about', 'About'],
  ['sell-with-us', 'Sell with us'],
] as const;

export default function HelpPage({ params }: { params: { topic: string } }) {
  const topic = HELP[params.topic];
  if (!topic) notFound();
  return (
    <article className="container-page pt-12 md:pt-20">
      <header className="max-w-4xl">
        <p className="eyebrow">{topic.kicker}</p>
        <h1 className="mt-3 text-[48px] leading-[0.95] md:text-[80px]">{topic.title}</h1>
        <p className="mt-6 max-w-2xl font-display text-[24px] leading-snug text-text2 md:text-[28px]">
          {topic.intro}
        </p>
      </header>
      <div className="mt-14 grid gap-12 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Help topics" className="hidden md:block">
          <ul className="space-y-3 border-t border-ink pt-4">
            {NAV.map(([slug, label]) => (
              <li key={slug}>
                <a
                  href={`/help/${slug}`}
                  className={`text-[11px] uppercase tracking-label ${slug === params.topic ? 'underline underline-offset-[6px]' : 'text-muted-2 hover:text-ink'}`}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          {topic.sections.length > 0 && (
            <div className="gap-12 md:columns-2">
              {topic.sections.map((s) => (
                <section
                  key={s.heading}
                  id={s.id}
                  className="mb-10 break-inside-avoid border-t border-line pt-4"
                >
                  <h2 className="text-[28px] leading-none">{s.heading}</h2>
                  {s.body.map((p) => (
                    <p key={p} className="mt-3 text-[14px] leading-relaxed text-text2">
                      {p}
                    </p>
                  ))}
                </section>
              ))}
            </div>
          )}
          {topic.faqs && (
            <section aria-labelledby="faqs" className="max-w-3xl">
              <h2 id="faqs" className="mb-4 text-[34px] italic leading-none">
                Frequently asked
              </h2>
              <div className="border-t border-line">
                {topic.faqs.map((f) => (
                  <Accordion key={f.q} title={f.q}>
                    <p>{f.a}</p>
                  </Accordion>
                ))}
              </div>
              <p className="mt-6 text-[14px]">
                Still stuck? Email{' '}
                <a className="link" href={`mailto:${BRAND.supportEmail}`}>
                  {BRAND.supportEmail}
                </a>
                .
              </p>
            </section>
          )}
          {params.topic === 'sell-with-us' && (
            <section aria-labelledby="interest" className="max-w-2xl border-t border-ink pt-6">
              <h2 id="interest" className="mb-6 text-[34px] italic leading-none">
                Tell us about your studio
              </h2>
              <SellerInterestForm />
            </section>
          )}
        </div>
      </div>
    </article>
  );
}
