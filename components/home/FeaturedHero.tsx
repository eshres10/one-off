import Link from 'next/link';
import { openMakerThreadAction } from '@/lib/actions/messages';
import type { HomeFeature } from '@/lib/queries/home-feature';
import { BoxButtonGroup, boxButtonClass } from '@/components/ui/Button';
import { FeaturedHeroSlides, type HeroSlide } from './FeaturedHeroSlides';

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

function kicker(feature: HomeFeature) {
  return feature.maker.foundingNumber
    ? `Featured maker · Founding maker No. ${feature.maker.foundingNumber}`
    : 'Featured maker';
}

function place(feature: HomeFeature) {
  return [feature.maker.city, feature.maker.state].filter(Boolean).join(', ');
}

/** "Message the maker" opens the existing maker conversation (or sends you to log in first). */
function MessageForm({
  feature,
  className,
  testId,
  children,
}: {
  feature: HomeFeature;
  className: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <form action={openMakerThreadAction} className="contents">
      <input type="hidden" name="makerId" value={feature.maker.id} />
      <input type="hidden" name="returnTo" value="/" />
      <button type="submit" className={className} data-testid={testId}>
        {children}
      </button>
    </form>
  );
}

/** Tablet and up: the full-bleed, sticky hero. The text is static; only the photos move. */
export function FeaturedHeroDesktop({ feature }: { feature: HomeFeature }) {
  const loc = place(feature);
  return (
    <FeaturedHeroSlides
      slides={slidesOf(feature)}
      variant="desktop"
      testId="featured-hero"
      labelledBy="hero-title"
      className="relative z-0 -mt-[var(--header-h)] flex h-[100svh] min-h-[560px] items-center justify-center overflow-hidden text-ground md:sticky md:top-0"
    >
      <div className="relative px-4 pt-[var(--header-h)] text-center">
        <p className="text-[11px] uppercase tracking-wide2" data-testid="hero-kicker">
          {kicker(feature)}
        </p>
        <h1
          id="hero-title"
          className="mx-auto mt-4 max-w-[17ch] text-[clamp(64px,9vw,136px)] leading-[0.92]"
        >
          {feature.headline}
        </h1>
        {feature.blurb && (
          <p className="mx-auto mt-5 max-w-[46ch] font-sans text-[16px] leading-snug md:text-[18px]">
            {feature.blurb}
          </p>
        )}
        {loc && <p className="mt-2 text-[11px] uppercase tracking-wide2">{loc}</p>}
        <BoxButtonGroup className="mt-8">
          <Link
            href={`/makers/${feature.maker.slug}`}
            className={boxButtonClass('min-w-[150px] md:min-w-[220px]')}
          >
            Shop {feature.maker.name}
          </Link>
          <MessageForm
            feature={feature}
            testId="hero-message"
            className={boxButtonClass('min-w-[150px] md:min-w-[220px]')}
          >
            Message the maker
          </MessageForm>
        </BoxButtonGroup>
      </div>
    </FeaturedHeroSlides>
  );
}

/** Phones: the app's hero card. */
export function FeaturedHeroPhone({ feature }: { feature: HomeFeature }) {
  const loc = place(feature);
  return (
    <FeaturedHeroSlides
      slides={slidesOf(feature)}
      variant="phone"
      testId="hero-card"
      labelledBy="hero-title-phone"
      className="relative mt-2 h-[440px] overflow-hidden rounded-app bg-stone text-ground"
    >
      <div className="absolute inset-x-5 bottom-[76px]">
        <p className="text-[10px] uppercase tracking-wide2">{kicker(feature)}</p>
        <h1 id="hero-title-phone" className="mt-2 font-display text-[44px] leading-[0.95]">
          {feature.headline}
        </h1>
        {feature.blurb && (
          <p className="mt-2 line-clamp-2 max-w-[34ch] text-[14px] leading-snug">{feature.blurb}</p>
        )}
        {loc && <p className="mt-1 text-[10px] uppercase tracking-wide2">{loc}</p>}
        <div className="mt-3 flex gap-2">
          <Link
            href={`/makers/${feature.maker.slug}`}
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-app bg-surface px-2 text-center text-[11px] uppercase tracking-[0.16em] text-ink"
          >
            Shop {feature.maker.name}
          </Link>
          <MessageForm
            feature={feature}
            testId="hero-message-phone"
            className="flex min-h-[44px] flex-1 items-center justify-center rounded-app border border-ground/80 px-2 text-center text-[11px] uppercase tracking-[0.16em]"
          >
            Message the maker
          </MessageForm>
        </div>
      </div>
    </FeaturedHeroSlides>
  );
}
