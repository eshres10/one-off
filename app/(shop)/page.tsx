import Link from 'next/link';
import { Suspense } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import {
  activeFilterCount,
  getCollections,
  getFacetOptions,
  getFeed,
  getMakersDirectory,
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
import { ProductGrid, ProductGridSkeleton } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
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
        <EmptyState
          title="Follow makers you love"
          action={
            <ButtonLink href="/login?next=/?tab=following" variant="secondary">
              Log in
            </ButtonLink>
          }
        >
          Log in and follow makers to see their newest pieces here.
        </EmptyState>
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
          <EmptyState
            title="Nothing from your makers yet"
            action={
              <ButtonLink href="/makers" variant="secondary">
                Find makers to follow
              </ButtonLink>
            }
          >
            Follow makers to fill this feed with their newest pieces.
          </EmptyState>
        ) : (
          <EmptyState
            title="No pieces match those filters yet."
            action={
              <ButtonLink href="/?tab=new" variant="secondary">
                Explore new arrivals
              </ButtonLink>
            }
          >
            Try removing a filter or explore new arrivals.
          </EmptyState>
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
  const [placements, options, collections, makers] = await Promise.all([
    getPlacements(),
    getFacetOptions(),
    getCollections(),
    getMakersDirectory(),
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
          className="relative -mt-[var(--header-h)] flex h-[min(88vh,860px)] min-h-[560px] items-center justify-center overflow-hidden text-ground"
        >
          {hero.imageUrl && (
            <Image
              src={hero.imageUrl}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
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

      <div className="mt-10 space-y-6 md:mt-14">
        <FeedTabs active={filters.tab} />
        {filters.tab !== 'collections' && <CollectionChips collections={collections.slice(0, 5)} />}
      </div>
      <div className="mt-6">{filters.tab !== 'collections' && <FilterBar options={options} />}</div>

      <section aria-label="Pieces" className="mt-[2px]">
        <Suspense key={JSON.stringify(filters)} fallback={<ProductGridSkeleton />}>
          <Feed filters={filters} />
        </Suspense>
      </section>

      {isDefault && (
        <>
          <section aria-labelledby="makers-title" className="container-page mt-24 text-center">
            <h2 id="makers-title" className="text-[44px] leading-none md:text-[64px]">
              Every maker, hand-selected
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[15px] text-muted">
              Independent studios across Australia, reviewed one by one before they go live. No
              resellers, no dropshippers — just people who make clothes.
            </p>
          </section>
          <ul
            className="no-scrollbar bleed mt-10 flex gap-[2px] overflow-x-auto md:grid md:grid-cols-4 md:overflow-visible"
            role="list"
          >
            {makers.slice(0, 4).map((m) => (
              <li key={m.id} className="w-[44vw] shrink-0 md:w-auto">
                <Link href={`/makers/${m.slug}`} className="group block">
                  <span className="relative block aspect-4/5 overflow-hidden bg-stone-light">
                    {m.coverUrl && (
                      <Image
                        src={m.coverUrl}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 25vw, 45vw"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <span className="mt-3 block px-1 text-left font-display text-[24px] leading-tight group-hover:underline md:text-[28px]">
                    {m.displayName}
                  </span>
                  <span className="block px-1 text-left text-[11px] uppercase tracking-label text-muted-2">
                    {m.city}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-16">
            <TrustStrip />
          </div>
        </>
      )}
    </div>
  );
}
