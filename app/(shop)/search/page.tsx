import { getSessionUser } from '@/lib/auth/session';
import { getFacetOptions, getFeed, getSavedProductIds, parseFilters } from '@/lib/queries/catalog';
import { SearchBox } from '@/components/feed/SearchBox';
import { FilterBar } from '@/components/feed/FilterBar';
import { ProductGrid } from '@/components/product/ProductCard';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Search' };

const SUGGESTIONS = [
  'Wedding guest',
  'Slip dress',
  'Linen',
  'Silk',
  'Midi skirt',
  'Upcycled',
  'Made to order',
  'Melbourne',
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parseFilters(searchParams);
  const user = await getSessionUser();
  const [options, saved] = await Promise.all([
    getFacetOptions(),
    getSavedProductIds(user?.id ?? null),
  ]);
  const results = filters.q
    ? await getFeed({ ...filters, tab: 'for-you' }, user?.id ?? null, { limit: 96 })
    : null;
  return (
    <div>
      <div className="glass-light border-b-0 bg-[rgba(246,244,240,0.7)] py-12 md:py-20">
        <div className="container-page">
          <h1 className="sr-only">Search</h1>
          <SearchBox initial={filters.q} suggestions={SUGGESTIONS} />
          {results && (
            <p className="mt-4 text-[11px] uppercase tracking-label text-muted-2">
              {results.items.length} {results.items.length === 1 ? 'piece' : 'pieces'} for “
              {filters.q}”
            </p>
          )}
        </div>
      </div>
      {results && (
        <>
          <FilterBar options={options} />
          {results.items.length ? (
            <div className="mt-[2px]">
              <ProductGrid products={results.items} savedIds={saved} />
            </div>
          ) : (
            <div className="container-page py-16 text-center">
              <p className="font-display text-[36px] leading-tight">
                Nothing matches “{filters.q}” yet.
              </p>
              <p className="mt-2 text-[14px] text-muted">
                Try a broader word, or explore what’s new this week.
              </p>
              <div className="mt-6 flex justify-center">
                <ButtonLink href="/?tab=new" variant="secondary">
                  New this week
                </ButtonLink>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
