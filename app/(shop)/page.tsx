import { Img as Image } from '@/components/ui/Img';
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
import { BRAND } from '@/lib/brand';
import { FeedTabs } from '@/components/feed/FeedTabs';
import { Filters } from '@/components/feed/Filters';
import { CollectionCard } from '@/components/editorial/CollectionCard';
import { ProductGrid, ProductGridSkeleton } from '@/components/product/ProductCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

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
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
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
      <EmptyState
        title="Follow makers you love"
        action={<ButtonLink href="/login?next=/?tab=following">Sign in</ButtonLink>}
      >
        Sign in and follow makers to see their newest pieces here.
      </EmptyState>
    );
  }
  const [{ items, hasMore }, savedIds] = await Promise.all([
    getFeed(filters, user?.id ?? null),
    getSavedProductIds(user?.id ?? null),
  ]);
  if (items.length === 0) {
    return filters.tab === 'following' && activeFilterCount(filters) === 0 ? (
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
    );
  }
  return (
    <>
      <ProductGrid products={items} savedIds={savedIds} />
      {hasMore && (
        <div className="mt-10 flex justify-center">
          <ButtonLink
            href={queryString(filters, { page: (filters.page ?? 1) + 1 })}
            variant="secondary"
            scroll={false}
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
  const [placements, options] = await Promise.all([getPlacements(), getFacetOptions()]);
  const hero = placements.find((p) => p.slot === 'home_hero');
  const isDefault = filters.tab === 'for-you' && activeFilterCount(filters) === 0 && !filters.page;

  return (
    <div className="container-page pt-4 sm:pt-8">
      {isDefault && hero && (
        <section
          aria-labelledby="hero-title"
          className="mb-8 grid items-center gap-6 overflow-hidden rounded-3xl bg-stone-light sm:mb-12 md:grid-cols-2"
        >
          <div className="order-2 px-6 pb-8 md:order-1 md:px-12 md:py-14">
            <p className="eyebrow">Independent · Australian · Original</p>
            <h1 id="hero-title" className="mt-3 text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
              {hero.title}
            </h1>
            <p className="mt-4 max-w-md text-ink-soft">{BRAND.tagline}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href={hero.href}>Shop statement dresses</ButtonLink>
              <ButtonLink href="/makers" variant="secondary">
                Meet the makers
              </ButtonLink>
            </div>
          </div>
          {hero.imageUrl && (
            <div className="relative order-1 aspect-[4/3] md:order-2 md:aspect-auto md:h-full md:min-h-[420px]">
              <Image
                src={hero.imageUrl}
                alt="A statement gown photographed under a studio arch"
                fill
                priority
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          )}
        </section>
      )}
      {!isDefault && <h1 className="sr-only">Discover</h1>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FeedTabs active={filters.tab} />
        {filters.tab !== 'collections' && (
          <Filters filters={filters} options={options} activeCount={activeFilterCount(filters)} />
        )}
      </div>

      {isDefault && (
        <section
          aria-label="Featured collections"
          className="no-scrollbar -mx-4 mt-6 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        >
          {placements
            .filter((p) => p.slot === 'home_feature')
            .map((p) => (
              <Link
                key={p.id}
                href={p.href}
                className="flex shrink-0 items-center gap-3 rounded-full border border-stone bg-white py-1.5 pl-1.5 pr-4 text-sm hover:border-ink"
              >
                {p.imageUrl && (
                  <Image
                    src={p.imageUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                )}
                {p.title}
              </Link>
            ))}
          <Link
            href="/collections/one-of-one-pieces"
            className="shrink-0 rounded-full border border-stone bg-white px-4 py-2.5 text-sm hover:border-ink"
          >
            One-of-one pieces
          </Link>
          <Link
            href="/collections/melbourne-made"
            className="shrink-0 rounded-full border border-stone bg-white px-4 py-2.5 text-sm hover:border-ink"
          >
            Melbourne made
          </Link>
          <Link
            href="/collections/made-to-order"
            className="shrink-0 rounded-full border border-stone bg-white px-4 py-2.5 text-sm hover:border-ink"
          >
            Made to order
          </Link>
        </section>
      )}

      <section aria-label="Pieces" className="mt-6 sm:mt-8">
        <Suspense key={JSON.stringify(filters)} fallback={<ProductGridSkeleton />}>
          <Feed filters={filters} />
        </Suspense>
      </section>
    </div>
  );
}
