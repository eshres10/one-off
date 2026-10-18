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
import { ButtonLink } from '@/components/ui/Button';
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
        <div className="px-4 py-16 text-center" data-testid="search-empty">
          <p className="font-display text-[36px] leading-tight">
            Nothing yet for “{q || 'these filters'}”
          </p>
          <p className="mt-2 text-[14px] text-muted">Can’t find it? A maker can make it for you.</p>
          <div className="mt-6 flex justify-center">
            <ButtonLink href="/custom">Request a custom piece</ButtonLink>
          </div>
        </div>
      )}
    </SearchShell>
  );
}
