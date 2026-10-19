import { EmptyState } from '@/components/states/EmptyState';
import { TapeIcon } from '@/components/states/illustrations';
import { SITE } from '@/lib/site/config';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth/session';
import {
  getMakersDirectory,
  getSavedProductIds,
  parseSearchFilter,
  searchProducts,
} from '@/lib/queries/catalog';
import { SearchShell } from '@/components/search/SearchShell';
import { ProductCard } from '@/components/product/ProductCard';
import { Img as Image } from '@/components/ui/Img';

export const metadata = { title: 'Search' };

const SHOP_BY = [
  { label: 'Dresses', href: '/search?q=dress', image: '/seed/embroidered-ruffle-dress.jpg' },
  { label: 'Slips', href: '/search?q=slip', image: '/seed/navy-satin-slip.jpg' },
  { label: 'Sets', href: '/search?q=set', image: '/seed/wine-satin-halter-set.jpg' },
  { label: 'Occasion', href: '/search?q=occasion', image: '/seed/tangerine-bias-maxi.jpg' },
  {
    label: 'Made to order',
    href: '/search?filter=made_to_order',
    image: '/seed/lace-trim-maxi-dress.jpg',
  },
  { label: 'One of one', href: '/search?filter=one_of_one', image: '/seed/crochet-lace-maxi.jpg' },
];

async function Idle() {
  const makers = (await getMakersDirectory()).slice(0, 12);
  return (
    <div className="pb-12">
      <section aria-labelledby="shop-by-title" className="px-3 pt-6 md:px-[var(--gutter)]">
        <h2
          id="shop-by-title"
          className="mx-auto mb-3 max-w-page font-sans text-[11px] uppercase tracking-label"
        >
          Shop by
        </h2>
        <ul className="mx-auto grid max-w-page grid-cols-2 gap-[2px] md:grid-cols-3" role="list">
          {SHOP_BY.map((t) => (
            <li key={t.label}>
              <Link
                href={t.href}
                className="group relative block h-[170px] overflow-hidden bg-stone-light text-ground"
              >
                <Image
                  src={t.image}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 33vw, 50vw"
                  className="object-cover object-[center_25%] transition duration-700 group-hover:scale-[1.03]"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
                />
                <span className="absolute bottom-3 left-3 font-display text-[26px] leading-none">
                  {t.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {makers.length > 0 && (
        <section aria-labelledby="makers-know-title" className="pt-8">
          <h2
            id="makers-know-title"
            className="mx-auto mb-3 max-w-page px-3 font-sans text-[11px] uppercase tracking-label md:px-[var(--gutter)]"
          >
            Makers to know
          </h2>
          <ul
            className="no-scrollbar mx-auto flex max-w-page gap-4 overflow-x-auto px-3 md:px-[var(--gutter)]"
            role="list"
          >
            {makers.map((m) => (
              <li key={m.id} className="w-[76px] shrink-0">
                <Link href={`/makers/${m.slug}`} className="group block text-center">
                  <span className="relative mx-auto block h-[68px] w-[68px] overflow-hidden rounded-circle bg-stone-light">
                    {(m.avatarUrl ?? m.coverUrl) && (
                      <Image
                        src={(m.avatarUrl ?? m.coverUrl)!}
                        alt=""
                        fill
                        sizes="68px"
                        className="object-cover object-top"
                      />
                    )}
                  </span>
                  <span className="mt-2 line-clamp-2 block text-[11px] leading-tight group-hover:underline">
                    {m.displayName}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "Nothing for …, yet.": fewer words, each word on its own, or have it made. */
function NoResults({ q }: { q: string }) {
  const words = q.split(/\s+/).filter((w) => w.length > 1);
  return (
    <div data-testid="search-empty">
      <EmptyState
        icon={<TapeIcon size={80} />}
        title={q ? <>Nothing for “{q}”, yet.</> : 'Nothing here, yet.'}
        body={
          words.length > 1
            ? 'Try fewer words, or search each one on its own.'
            : 'Try a broader word, or a colour or fabric instead.'
        }
      >
        {words.length > 1 && (
          <div className="flex flex-wrap justify-center gap-2" data-testid="search-words">
            {words.slice(0, 4).map((w) => (
              <Link
                key={w}
                href={`/search?q=${encodeURIComponent(w)}`}
                className="inline-flex min-h-[40px] items-center border border-line-strong px-4 text-[13px] hover:border-ink"
              >
                {w}
              </Link>
            ))}
          </div>
        )}
        <Link
          href={`/custom${q ? `?q=${encodeURIComponent(q)}` : ''}`}
          className="mt-8 block bg-ink px-6 py-6 text-left text-ground"
          data-testid="have-it-made"
        >
          <span className="block font-display text-[26px] leading-tight">
            Can’t find it? Have it made.
          </span>
          <span className="mt-1 block text-[13px] text-ground/75">
            Tell us what you’re after and we’ll match you with a maker who can make it.
          </span>
          <span className="mt-4 inline-block text-[11px] uppercase tracking-label underline underline-offset-[6px]">
            Start a custom request
          </span>
        </Link>
        <div className="mt-10 text-left">
          <p className="text-[11px] uppercase tracking-label text-muted-2">Popular right now</p>
          <div className="mt-3 flex flex-wrap gap-2" data-testid="popular-searches">
            {SITE.popularSearches.map((p) => (
              <Link
                key={p}
                href={`/search?q=${encodeURIComponent(p)}`}
                className="inline-flex min-h-[40px] items-center bg-stone px-4 text-[13px] hover:bg-stone-light"
              >
                {p}
              </Link>
            ))}
          </div>
        </div>
      </EmptyState>
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const rawQ = Array.isArray(searchParams.q) ? searchParams.q[0] : searchParams.q;
  const q = (rawQ ?? '').trim().slice(0, 80);
  const filter = parseSearchFilter(searchParams.filter);
  const active = Boolean(q) || filter !== 'all';
  const user = await getSessionUser();
  const [results, saved] = await Promise.all([
    active ? searchProducts(q || undefined, filter) : Promise.resolve([]),
    getSavedProductIds(user?.id ?? null),
  ]);
  const noun = results.length === 1 ? 'piece' : 'pieces';

  return (
    <SearchShell key={filter} initialQuery={q} filter={filter} idle={<Idle />}>
      {results.length > 0 ? (
        <>
          <div className="mx-auto flex max-w-page items-baseline justify-between px-3 pb-3 pt-2 md:px-[var(--gutter)]">
            <p className="text-[12px] text-muted" data-testid="search-count" aria-live="polite">
              {results.length} {noun}
              {q ? ` for “${q}”` : ''}
            </p>
            <p className="text-[11px] uppercase tracking-label text-muted-2">Sort: Relevance</p>
          </div>
          <ul
            className="grid grid-cols-2 gap-[2px] md:grid-cols-3 lg:grid-cols-4"
            role="list"
            data-testid="search-results"
          >
            {results.map((p, i) => (
              <li key={p.id}>
                <ProductCard product={p} saved={saved.has(p.id)} priority={i < 4} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <NoResults q={q} />
      )}
    </SearchShell>
  );
}
