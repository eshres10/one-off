import Link from 'next/link';
import type { HomeFeature } from '@/lib/queries/home-feature';
import { BoxButtonGroup, boxButtonClass } from '@/components/ui/Button';
import { FeaturedHeroSlides, type HeroSlide } from './FeaturedHeroSlides';

/** The messaging the hero always carries; the featured maker only adds a small note and the photos. */
export interface HeroCopy {
  title: string;
  subtitle: string;
  href: string;
}

function slidesOf(feature: HomeFeature): HeroSlide[] {
  return feature.slides.map(({ id, slug, title, priceCents, src, focus }) => ({
    id,
    slug,
    title,
    priceCents,
    src,
    focus,
  }));
}

/** "Featured brand of the month: Explore Dramalicious", a link to the maker's shop. */
function FeaturedNote({
  feature,
  testId,
  className = 'text-[11px] tracking-wide2',
}: {
  feature: HomeFeature;
  testId: string;
  className?: string;
}) {
  return (
    <p className={`uppercase ${className}`} data-testid={testId}>
      Featured brand of the month:{' '}
      <Link
        href={`/makers/${feature.maker.slug}`}
        className="underline underline-offset-[5px] hover:no-underline"
      >
        Explore {feature.maker.name}
      </Link>
    </p>
  );
}

/** Tablet and up: the original hero copy over the featured maker's rotating photos. */
export function FeaturedHeroDesktop({ feature, hero }: { feature: HomeFeature; hero: HeroCopy }) {
  return (
    <FeaturedHeroSlides
      slides={slidesOf(feature)}
      variant="desktop"
      testId="featured-hero"
      labelledBy="hero-title"
      className="relative z-0 -mt-[var(--header-h)] flex h-[100svh] min-h-[560px] items-center justify-center overflow-hidden text-ground md:sticky md:top-0"
    >
      <div className="relative px-4 pt-[var(--header-h)] text-center">
        {hero.subtitle && <p className="text-[11px] uppercase tracking-wide2">{hero.subtitle}</p>}
        <h1
          id="hero-title"
          className="mx-auto mt-4 max-w-[17ch] text-[clamp(64px,9vw,136px)] leading-[0.92]"
        >
          {hero.title}
        </h1>
        <BoxButtonGroup className="mt-10">
          <Link href={hero.href} className={boxButtonClass('min-w-[150px] md:min-w-[220px]')}>
            Shop the edit
          </Link>
          <Link href="/makers" className={boxButtonClass('min-w-[150px] md:min-w-[220px]')}>
            Meet the makers
          </Link>
        </BoxButtonGroup>
        <div className="mt-6">
          <FeaturedNote feature={feature} testId="hero-featured-note" />
        </div>
      </div>
    </FeaturedHeroSlides>
  );
}

/** Phones: the app's hero card, same copy as before plus the note. */
export function FeaturedHeroPhone({ feature, hero }: { feature: HomeFeature; hero: HeroCopy }) {
  return (
    <FeaturedHeroSlides
      slides={slidesOf(feature)}
      variant="phone"
      testId="hero-card"
      labelledBy="hero-title-phone"
      className="relative mt-2 h-[460px] overflow-hidden rounded-app bg-stone text-ground"
    >
      <div className="absolute inset-x-5 bottom-[76px]">
        <p className="text-[10px] uppercase tracking-wide2">{hero.subtitle}</p>
        <h1
          id="hero-title-phone"
          className="mt-2 max-w-[11ch] font-display text-[40px] leading-[0.95]"
        >
          {hero.title}
        </h1>
        <div className="mt-4 flex gap-2">
          <Link
            href="/discover"
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-app bg-surface text-[11px] uppercase tracking-[0.16em] text-ink"
          >
            Shop the edit
          </Link>
          <Link
            href="/makers"
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-app border border-ground/80 text-[11px] uppercase tracking-[0.16em]"
          >
            The makers
          </Link>
        </div>
        <div className="mt-3">
          <FeaturedNote
            feature={feature}
            testId="hero-featured-note-phone"
            className="text-[10px] tracking-[0.07em]"
          />
        </div>
      </div>
    </FeaturedHeroSlides>
  );
}
