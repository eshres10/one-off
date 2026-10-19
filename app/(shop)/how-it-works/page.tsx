import type { Metadata } from 'next';
import Link from 'next/link';
import { HOW_IT_WORKS } from '@/content/pages/how-it-works';
import { ButtonLink } from '@/components/ui/Button';
import { Img as Image } from '@/components/ui/Img';

export function generateMetadata(): Metadata {
  return { title: HOW_IT_WORKS.meta.title, description: HOW_IT_WORKS.meta.description };
}

/** How it works: three ways to buy, the order step by step, payment, delivery and returns. */
export default function HowItWorksPage() {
  const h = HOW_IT_WORKS;
  const { payment, delivery, returns } = h.panels;
  return (
    <div data-testid="how-it-works-page">
      <header className="container-page grid gap-6 border-b border-line pb-14 pt-12 md:grid-cols-2 md:items-end md:pb-20 md:pt-20">
        <div>
          <p className="eyebrow">{h.kicker}</p>
          <h1 className="mt-4 text-[52px] leading-[0.95] md:text-[88px]">
            {h.title}
            <br />
            <em>{h.titleItalic}</em>
          </h1>
        </div>
        <p className="max-w-[46ch] text-[15px] leading-relaxed text-text2 md:justify-self-end">
          {h.intro}
        </p>
      </header>

      <section className="container-page py-14 md:py-20" aria-labelledby="ways-title">
        <h2 id="ways-title" className="eyebrow font-sans">
          {h.waysKicker}
        </h2>
        <ul className="mt-6 grid gap-8 md:grid-cols-3 md:gap-4">
          {h.ways.map((w) => (
            <li key={w.badge}>
              <Link href={w.href} className="group block">
                <span className="relative block aspect-[4/4.4] overflow-hidden bg-stone">
                  <Image
                    src={w.image}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="object-cover object-top transition duration-700 group-hover:scale-[1.02]"
                  />
                </span>
                <span className="mt-4 inline-block border border-ink px-2 py-[2px] text-[10px] uppercase tracking-[0.14em]">
                  {w.badge}
                </span>
                <span className="mt-3 block font-display text-[24px] leading-tight group-hover:underline group-hover:underline-offset-4">
                  {w.line}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="container-page pb-14 md:pb-20" aria-labelledby="steps-title">
        <div className="border-t border-ink pt-4">
          <h2 id="steps-title" className="eyebrow font-sans">
            {h.stepsKicker}
          </h2>
        </div>
        <ol className="mt-8 grid gap-0 md:grid-cols-4 md:gap-6">
          {h.steps.map((s, i) => (
            <li key={s.title} className="relative flex gap-5 pb-8 md:block md:pb-0">
              {/* The timeline: across on desktop, down on phone. */}
              <span aria-hidden className="relative flex flex-col items-center md:flex-row">
                <span className="h-3 w-3 shrink-0 rounded-circle bg-ink" />
                {i < h.steps.length - 1 && (
                  <span className="mt-1 w-px flex-1 bg-line-strong md:ml-1 md:mt-0 md:h-px md:w-full md:flex-1" />
                )}
                {i === h.steps.length - 1 && <span className="hidden flex-1 md:block" />}
              </span>
              <div className="md:mt-5">
                <p className="text-[11px] uppercase tracking-label text-muted-2">Step {i + 1}</p>
                <h3 className="mt-2 text-[26px] leading-tight">{s.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-text2">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="container-page grid gap-3 md:grid-cols-3"
        aria-label="Payment, delivery and returns"
      >
        <div className="bg-ink px-6 py-8 text-ground md:px-8">
          <p className="text-[11px] uppercase tracking-label text-ground/60">{payment.kicker}</p>
          <h2 className="mt-3 text-[28px] leading-tight">{payment.title}</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-ground/80">{payment.body}</p>
        </div>
        <div className="bg-stone px-6 py-8 md:px-8">
          <p className="eyebrow">{delivery.kicker}</p>
          <h2 className="mt-3 text-[28px] leading-tight">{delivery.title}</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-text2">{delivery.body}</p>
        </div>
        <div className="bg-stone px-6 py-8 md:px-8" data-testid="hiw-returns">
          <p className="eyebrow">{returns.kicker}</p>
          <h2 className="mt-3 text-[28px] leading-tight">{returns.title}</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-text2">{returns.body}</p>
        </div>
      </section>

      <section className="container-page grid items-center gap-10 py-16 md:grid-cols-2 md:py-24">
        <div>
          <h2 className="text-[40px] leading-none md:text-[48px]">{h.fit.title}</h2>
          <p className="mt-5 max-w-[48ch] text-[14px] leading-relaxed text-text2">{h.fit.body}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/size-guide">Size guide</ButtonLink>
            <ButtonLink href="/makers" variant="secondary">
              Ask a maker
            </ButtonLink>
          </div>
        </div>
        <div className="relative aspect-[4/3.7] overflow-hidden bg-stone">
          <Image
            src={h.fit.image}
            alt=""
            fill
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover object-top"
          />
        </div>
      </section>
    </div>
  );
}
