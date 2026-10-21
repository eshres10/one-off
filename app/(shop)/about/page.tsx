import type { Metadata } from 'next';
import { ABOUT } from '@/content/pages/about';
import { SITE } from '@/lib/site/config';
import { ButtonLink } from '@/components/ui/Button';
import { Img as Image } from '@/components/ui/Img';
import { Monogram } from '@/components/ui/Monogram';

export function generateMetadata(): Metadata {
  return { title: ABOUT.meta.title, description: ABOUT.meta.description };
}

/** Our story. */
export default function AboutPage() {
  const a = ABOUT;
  return (
    <div data-testid="about-page">
      {/* Hero: full-bleed, under the header, with a gradient so the headline reads. */}
      <section
        data-hero
        className="relative -mt-[var(--header-h)] h-[480px] overflow-hidden text-ground md:h-[640px]"
      >
        <Image
          src={a.hero.image}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[center_25%] grayscale"
        />
        <span
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
        />
        <div className="container-page absolute inset-x-0 bottom-10 md:bottom-16">
          <p className="text-[11px] uppercase tracking-label text-ground/80">{a.hero.kicker}</p>
          <h1 className="mt-3 text-[56px] leading-[0.95] md:text-[104px]">
            {a.hero.title}
            <br />
            <em>{a.hero.titleItalic}</em>
          </h1>
        </div>
      </section>

      <section className="container-page grid gap-8 py-16 md:grid-cols-2 md:gap-16 md:py-24">
        <p className="font-display text-[30px] leading-[1.1] md:text-[40px]">{a.pullLine}</p>
        <div className="space-y-4 text-[15px] leading-relaxed text-text2">
          {a.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </section>

      {/* Three images, 1.1 : 1 : 1; a swipeable row on phones. */}
      <section aria-label="From the studios" className="md:container-page">
        <div className="no-scrollbar flex snap-x gap-2 overflow-x-auto px-[var(--gutter)] md:grid md:grid-cols-[1.1fr_1fr_1fr] md:overflow-visible md:px-0">
          {a.images.map((img) => (
            <div
              key={img.src}
              className="relative h-[420px] w-[78vw] shrink-0 snap-start overflow-hidden bg-stone md:h-[520px] md:w-auto"
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 768px) 33vw, 78vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="container-page py-16 md:py-24" aria-labelledby="promises-title">
        <div className="flex items-baseline justify-between border-t border-ink pt-4">
          <h2
            id="promises-title"
            className="font-sans text-[11px] uppercase tracking-label text-muted-2"
          >
            {a.promises.kicker}
          </h2>
          <p className="text-[11px] uppercase tracking-label text-muted-2">{a.promises.aside}</p>
        </div>
        <ol className="mt-8 grid gap-10 md:grid-cols-4 md:gap-8">
          {a.promises.items.map((p, i) => (
            <li key={p.title}>
              <span className="font-display text-[44px] leading-none text-muted-2/60">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 text-[24px] leading-tight">{p.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-text2">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container-page" aria-label="A note from the founder">
        <div className="grid overflow-hidden bg-ink text-ground md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative h-[360px] md:h-auto">
            <Image
              src={a.founder.image}
              alt=""
              fill
              sizes="(min-width: 768px) 45vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="relative overflow-hidden px-6 py-12 md:px-12 md:py-16">
            <Monogram className="pointer-events-none absolute -right-10 -top-10 h-[220px] w-[220px] text-ground opacity-[0.06]" />
            <p className="text-[11px] uppercase tracking-label text-ground/60">
              {a.founder.kicker}
            </p>
            <blockquote className="mt-5 font-display text-[28px] leading-[1.15] md:text-[34px]">
              {a.founder.quote}
            </blockquote>
            <p className="mt-6 max-w-[52ch] text-[13px] leading-relaxed text-ground/75">
              {a.founder.body}
            </p>
            <p className="mt-8 font-display text-[30px] italic" data-testid="founder-signature">
              {SITE.founderName}
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-label text-ground/60">
              {a.founder.role}
            </p>
          </div>
        </div>
      </section>

      <section className="container-page grid gap-3 py-16 md:grid-cols-2 md:py-24">
        <div className="bg-stone px-6 py-8 md:px-8 md:py-10">
          <p className="text-[11px] uppercase tracking-label text-muted-2">
            {a.closing.shoppers.kicker}
          </p>
          <p className="mt-3 font-display text-[30px] leading-tight">{a.closing.shoppers.title}</p>
          <ButtonLink href={a.closing.shoppers.href} className="mt-6">
            {a.closing.shoppers.cta}
          </ButtonLink>
        </div>
        <div className="border border-ink px-6 py-8 md:px-8 md:py-10">
          <p className="text-[11px] uppercase tracking-label text-muted-2">
            {a.closing.makers.kicker}
          </p>
          <p className="mt-3 font-display text-[30px] leading-tight">{a.closing.makers.title}</p>
          <ButtonLink href={a.closing.makers.href} variant="secondary" className="mt-6">
            {a.closing.makers.cta}
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
