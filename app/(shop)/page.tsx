import Link from 'next/link';
import { Suspense } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import {
  activeFilterCount,
  getCollections,
  getFacetOptions,
  getFeed,
  getPlacements,
  getSavedProductIds,
  parseFilters,
  type FeedFilters,
} from '@/lib/queries/catalog';
import { FEED_EDITORIAL, HERO } from '@/lib/editorial';
import { CollectionChips, FeedTabs } from '@/components/feed/FeedTabs';
import { FilterBar } from '@/components/feed/FilterBar';
import { CollectionCard } from '@/components/editorial/CollectionCard';
import { TrustStrip } from '@/components/editorial/TrustStrip';
import { EditorialTile, ProductGrid, ProductGridSkeleton } from '@/components/product/ProductCard';
import { Rail } from '@/components/rails/Rail';
import { MakerTileCard, NewMakerCard, RailProductCard } from '@/components/rails/RailCards';
import {
  getFollowedMakerIds,
  getMostPopular,
  getNewMakers,
  getPickedForYou,
  getShopByMaker,
  getUnder,
} from '@/lib/queries/rails';
import { EmptyState as StateEmpty } from '@/components/states/EmptyState';
import { SpoolIcon, TapeIcon } from '@/components/states/illustrations';
import { SuggestedMakers } from '@/components/states/SuggestedMakers';
import { suggestedMakers } from '@/lib/queries/states';
import { BoxButtonGroup, ButtonLink, boxButtonClass } from '@/components/ui/Button';
import { Img as Image } from '@/components/ui/Img';

type SearchParams = Record<string, string | string[] | undefined>;

function queryString(
  f: FeedFilters,
  overrides: Partial<Record<keyof FeedFilters, string | number | undefined>>,
) {
  const params = new URLSearchParams();
  const merged = { ...f, ...overrides } as Record<string, unknown>;
  for (const [k, v] of Object.entries(merged)) {
    if (
      v === undefined ||
      v === '' ||
      (k === 'tab' && v === 'for-you') ||
      (k === 'page' && Number(v) <= 1)
    )
      continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `/?${s}` : '/';
}

async function HomeRails() {
  const user = await getSessionUser();
  const [picked, popular, newMakers, makers, under, savedIds, following] = await Promise.all([
    user ? getPickedForYou(user.id, 10) : Promise.resolve([]),
    getMostPopular(10),
    getNewMakers(10),
    getShopByMaker(16),
    getUnder(30000, 12),
    getSavedProductIds(user?.id ?? null),
    getFollowedMakerIds(user?.id ?? null),
  ]);
  return (
    <div className="mt-6">
      {picked.length > 0 && (
        <Rail
          title="Picked for you"
          subtitle="Ranked by your style and sizes. The more you save, the better it gets."
          viewAllHref="/discover"
          testId="rail-picked"
        >
          {picked.map((p) => (
            <RailProductCard key={p.id} product={p} saved={savedIds.has(p.id)} />
          ))}
        </Rail>
      )}
      {popular.length > 0 && (
        <Rail
          title="Most popular"
          subtitle="The pieces everyone is saving this week."
          viewAllHref="/?tab=for-you#pieces"
          testId="rail-popular"
        >
          {popular.map((p) => (
            <RailProductCard key={p.id} product={p} saved={savedIds.has(p.id)} />
          ))}
        </Rail>
      )}
      {FEED_EDITORIAL[1] && (
        <div className="md:hidden">
          <EditorialTile tile={FEED_EDITORIAL[1]} />
        </div>
      )}
      {newMakers.length > 0 && (
        <Rail
          title="New makers"
          subtitle="Just joined One Off. Every studio visited in person before going live."
          viewAllHref="/makers"
          gapClass="gap-[10px] md:gap-4"
          testId="rail-new-makers"
        >
          {newMakers.map((m) => (
            <NewMakerCard key={m.id} maker={m} following={following.has(m.id)} />
          ))}
        </Rail>
      )}
      {makers.length > 0 && (
        <Rail
          title="Shop by maker"
          subtitle="We review every maker by hand before a label goes live. No resellers, no dropshippers — just people who make clothes, in studios across Australia."
          viewAllHref="/makers"
          testId="rail-makers"
        >
          {makers.map((m) => (
            <MakerTileCard key={m.id} maker={m} />
          ))}
        </Rail>
      )}
      {under.length > 0 && (
        <Rail
          title="Under A$300"
          subtitle="Made in Australia, without the occasion price tag."
          viewAllHref="/search?filter=under_300"
          testId="rail-under-300"
        >
          {under.map((p) => (
            <RailProductCard key={p.id} product={p} saved={savedIds.has(p.id)} />
          ))}
        </Rail>
      )}
    </div>
  );
}

async function Feed({ filters }: { filters: FeedFilters }) {
  const user = await getSessionUser();
  if (filters.tab === 'collections') {
    const collections = await getCollections();
    return (
      <ul className="grid gap-[2px] md:grid-cols-2" role="list">
        {collections.map((c) => (
          <li key={c.id}>
            <CollectionCard collection={c} />
          </li>
        ))}
      </ul>
    );
  }
  if (filters.tab === 'following' && !user) {
    return (
      <div className="container-page py-10">
        <StateEmpty
          icon={<SpoolIcon size={72} />}
          title="Follow a maker or two."
          body="Their new pieces, restocks and studio news show up here first. Log in to follow."
          actions={[
            { label: 'Log in', href: '/login?next=/?tab=following' },
            { label: 'Find makers', href: '/makers' },
          ]}
        >
          <SuggestedMakers makers={await suggestedMakers(null, 4)} />
        </StateEmpty>
      </div>
    );
  }
  const [{ items, hasMore }, savedIds] = await Promise.all([
    getFeed(filters, user?.id ?? null),
    getSavedProductIds(user?.id ?? null),
  ]);
  if (items.length === 0) {
    return (
      <div className="container-page py-10">
        {filters.tab === 'following' && activeFilterCount(filters) === 0 ? (
          <div data-testid="following-empty">
            <StateEmpty
              icon={<SpoolIcon size={72} />}
              title="Follow a maker or two."
              body="Their new pieces, restocks and studio news show up here first."
              actions={[{ label: 'Find makers', href: '/makers' }]}
            >
              <SuggestedMakers makers={await suggestedMakers(user?.id ?? null, 4)} />
            </StateEmpty>
          </div>
        ) : (
          <StateEmpty
            icon={<TapeIcon size={72} />}
            title="A little too specific."
            body="No pieces match those filters yet. Try removing one, or see what’s new."
            actions={[
              { label: 'Explore new arrivals', href: '/?tab=new' },
              { label: 'Clear all filters', href: '/' },
            ]}
          />
        )}
      </div>
    );
  }
  const showEditorial = filters.tab === 'for-you' && activeFilterCount(filters) === 0;
  return (
    <>
      <ProductGrid
        products={items}
        savedIds={savedIds}
        editorial={showEditorial ? FEED_EDITORIAL : []}
      />
      {hasMore && (
        <div className="mt-10 flex justify-center">
          <ButtonLink
            href={queryString(filters, { page: (filters.page ?? 1) + 1 })}
            variant="secondary"
            scroll={false}
            className="min-w-[250px]"
          >
            Show more pieces
          </ButtonLink>
        </div>
      )}
    </>
  );
}

export default async function DiscoverPage({ searchParams }: { searchParams: SearchParams }) {
  const filters = parseFilters(searchParams);
  const [placements, options, collections] = await Promise.all([
    getPlacements(),
    getFacetOptions(),
    getCollections(),
  ]);
  const placement = placements.find((p) => p.slot === 'home_hero');
  // Placements can swap the image and link; the headline is the brand line.
  const hero = {
    title: HERO.title,
    subtitle: HERO.eyebrow,
    imageUrl: placement?.imageUrl ?? HERO.imageUrl,
    href: placement?.href ?? HERO.href,
  };
  const isDefault = filters.tab === 'for-you' && activeFilterCount(filters) === 0 && !filters.page;

  return (
    <div>
      {isDefault && (
        <section
          data-hero
          aria-labelledby="hero-title"
          className="relative z-0 -mt-[var(--header-h)] flex h-[100svh] min-h-[560px] items-center justify-center overflow-hidden text-ground md:sticky md:top-0"
        >
          {hero.imageUrl && (
            <Image
              src={hero.imageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              quality={70}
              className="object-cover object-[center_30%]"
            />
          )}
          <span aria-hidden className="absolute inset-0 bg-[rgba(0,0,0,0.28)]" />
          <div className="relative px-4 pt-[var(--header-h)] text-center">
            {hero.subtitle && (
              <p className="text-[11px] uppercase tracking-wide2">{hero.subtitle}</p>
            )}
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
          </div>
        </section>
      )}
      {!isDefault && <h1 className="sr-only">Discover</h1>}

      {/* From tablet up the hero stays put and everything after it slides over like a shutter. */}
      <div
        className={isDefault ? 'shutter relative z-[1] bg-ground' : undefined}
        data-shutter={isDefault ? '' : undefined}
      >
        <div className="space-y-6 pt-10 md:pt-14">
          <FeedTabs active={filters.tab} />
          {filters.tab !== 'collections' && (
            <CollectionChips collections={collections.slice(0, 5)} />
          )}
        </div>
        <div className="mt-6">
          {filters.tab !== 'collections' && <FilterBar options={options} />}
        </div>

        <section id="pieces" aria-labelledby="pieces-title" className="mt-[2px]">
          <h2 id="pieces-title" className="sr-only">
            Pieces
          </h2>
          <Suspense key={JSON.stringify(filters)} fallback={<ProductGridSkeleton />}>
            <Feed filters={filters} />
          </Suspense>
        </section>

        {isDefault && (
          <>
            <HomeRails />
            <div className="mt-16">
              <TrustStrip />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
