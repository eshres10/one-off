import { Suspense } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { getSavedProductIds, parseSearchFilter } from '@/lib/queries/catalog';
import { exploreProducts } from '@/lib/queries/explore';
import { DesktopRedirect } from '@/components/app/DesktopRedirect';
import { ExploreHome, ExploreResults } from '@/components/app/explore/ExploreView';
import { PhoneGridSkeleton } from '@/components/app/ProductGrid';

export const metadata = { title: 'Explore' };

type Params = {
  q?: string;
  filter?: string;
  sort?: string;
  size?: string;
  max?: string;
  colour?: string;
  state?: string;
};

async function Results({ params }: { params: Params }) {
  const q = params.q?.trim() ?? '';
  const filter = parseSearchFilter(params.filter);
  const user = await getSessionUser();
  let [products, saved] = await Promise.all([
    exploreProducts({
      q,
      filter,
      size: params.size ?? null,
      max: params.max && Number(params.max) > 0 ? Number(params.max) : null,
      colour: params.colour ?? null,
      state: params.state ?? null,
    }),
    getSavedProductIds(user?.id ?? null),
  ]);
  if (params.sort === 'price-asc')
    products = [...products].sort((a, b) => a.priceCents - b.priceCents);
  if (params.sort === 'price-desc')
    products = [...products].sort((a, b) => b.priceCents - a.priceCents);
  return (
    <ExploreResults
      q={q}
      filter={filter}
      params={params}
      products={products}
      savedIds={[...saved]}
    />
  );
}

/** Explore (phones): search, Shop by pills, category tiles, Have it made, trending; results pushed. */
export default function ExplorePage({ searchParams }: { searchParams: Params }) {
  const searching = Boolean(
    searchParams.q?.trim() ||
      (searchParams.filter && searchParams.filter !== 'all') ||
      searchParams.size ||
      searchParams.max ||
      searchParams.colour ||
      searchParams.state,
  );
  const desktopTarget = searching
    ? `/search?${new URLSearchParams(
        Object.entries(searchParams).filter(([k]) => k === 'q' || k === 'filter') as [
          string,
          string,
        ][],
      ).toString()}`
    : '/search';
  return (
    <div className="pb-6 md:hidden">
      <DesktopRedirect to={desktopTarget} />
      {searching ? (
        <Suspense
          key={JSON.stringify(searchParams)}
          fallback={
            <div className="pt-[calc(var(--phone-bar-h)+8px)]">
              <PhoneGridSkeleton count={6} />
            </div>
          }
        >
          <Results params={searchParams} />
        </Suspense>
      ) : (
        <ExploreHome />
      )}
    </div>
  );
}
