'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ProductCard, SearchFilter } from '@/lib/queries/catalog';
import { EXPLORE_TILES, SHOP_BY, TRENDING } from '@/lib/app/explore';
import { popScreen } from '@/lib/app/nav';
import { Img as Image } from '@/components/ui/Img';
import {
  ArrowRightIcon,
  ChevronIcon,
  CloseIcon,
  SearchIcon,
  SlidersIcon,
} from '@/components/ui/icons';
import { PhoneProductGrid } from '../ProductGrid';
import { FilterSheet, type FilterValues, filterCount } from '../FilterSheet';
import { Chip } from '../ui';

const FILTER_LABEL: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
  under_300: 'Under A$300',
};

function SearchField({
  initial,
  autoFocus = false,
  onSubmit,
}: {
  initial: string;
  autoFocus?: boolean;
  onSubmit: (q: string) => void;
}) {
  const [q, setQ] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(q.trim());
      }}
      className="relative flex-1"
    >
      <SearchIcon
        width={18}
        height={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-2"
      />
      <input
        type="search"
        inputMode="search"
        enterKeyHint="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus={autoFocus}
        placeholder="Search pieces, fabrics, makers"
        aria-label="Search"
        data-testid="explore-search"
        className="h-12 w-full rounded-app border border-line bg-surface pl-11 pr-10 text-[16px] placeholder:text-muted-2 focus:border-ink focus:outline-none"
      />
      {q && (
        <button
          type="button"
          onClick={() => setQ('')}
          aria-label="Clear search"
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-muted-2"
        >
          <CloseIcon width={14} height={14} />
        </button>
      )}
    </form>
  );
}

/** Explore at rest: large title, search, Shop by, six tiles, Have it made, trending. */
export function ExploreHome() {
  const router = useRouter();
  const [filters, setFilters] = useState(false);
  const go = (q: string) => router.push(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  return (
    <div className="px-4 pt-[calc(env(safe-area-inset-top)+16px)]" data-testid="explore-home">
      <h1 className="text-[44px] leading-none">Explore</h1>
      <div className="mt-4 flex items-center gap-2">
        <SearchField initial="" onSubmit={go} />
        <button
          type="button"
          onClick={() => setFilters(true)}
          aria-label="Filters"
          data-testid="explore-filters"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-app border border-line bg-surface"
        >
          <SlidersIcon width={20} height={20} />
        </button>
      </div>
      <div className="no-scrollbar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4" aria-label="Shop by">
        {SHOP_BY.map((s) => (
          <Chip key={s.label} href={s.href}>
            {s.label}
          </Chip>
        ))}
      </div>
      <ul className="mt-5 grid grid-cols-2 gap-2" role="list" aria-label="Categories">
        {EXPLORE_TILES.map((t) => (
          <li key={t.label}>
            <Link
              href={t.href}
              className="relative block h-[150px] overflow-hidden rounded-app bg-stone text-ground"
              data-testid="explore-tile"
            >
              <Image
                src={t.image}
                alt=""
                fill
                sizes="50vw"
                className="object-cover object-[center_25%]"
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
      <Link
        href="/have-it-made"
        className="mt-4 flex items-center justify-between gap-4 rounded-app bg-ink px-5 py-5 text-ground"
        data-testid="explore-have-it-made"
      >
        <span>
          <span className="block text-[10px] uppercase tracking-[0.2em] text-ground/70">
            Can’t find it?
          </span>
          <span className="mt-1 block font-display text-[26px] leading-none">Have it made</span>
          <span className="mt-1.5 block text-[12px] text-ground/75">
            Up to 3 makers quote within 48 hours.
          </span>
        </span>
        <ArrowRightIcon width={22} height={22} className="shrink-0" />
      </Link>
      <section className="mt-7" aria-labelledby="trending-title">
        <h2
          id="trending-title"
          className="font-sans text-[11px] uppercase tracking-label text-muted-2"
        >
          Trending searches
        </h2>
        <ul className="mt-2 divide-y divide-line" role="list">
          {TRENDING.map((t) => (
            <li key={t}>
              <Link
                href={`/explore?q=${encodeURIComponent(t)}`}
                className="flex min-h-[48px] items-center justify-between text-[15px]"
              >
                {t}
                <ChevronIcon width={16} height={16} className="text-muted-2" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <FilterSheet
        open={filters}
        onOpenChange={setFilters}
        initial={{ filter: 'all', size: null, max: null, colour: null, state: null }}
        onApply={(v) => {
          setFilters(false);
          router.push(`/explore?${toSearch('', v)}`);
        }}
      />
    </div>
  );
}

function toSearch(q: string, v: FilterValues, sort?: string) {
  const p = new URLSearchParams();
  if (q) p.set('q', q);
  if (v.filter && v.filter !== 'all') p.set('filter', v.filter);
  if (v.size) p.set('size', v.size);
  if (v.max) p.set('max', String(v.max));
  if (v.colour) p.set('colour', v.colour);
  if (v.state) p.set('state', v.state);
  if (sort) p.set('sort', sort);
  return p.toString();
}

/** Results (pushed): a sticky row of filter chips, then the grid. */
export function ExploreResults({
  q,
  filter,
  params,
  products,
  savedIds,
}: {
  q: string;
  filter: SearchFilter;
  params: { sort?: string; size?: string; max?: string; colour?: string; state?: string };
  products: ProductCard[];
  savedIds: string[];
}) {
  const router = useRouter();
  const [filters, setFilters] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const values: FilterValues = {
    filter,
    size: params.size ?? null,
    max: params.max ? Number(params.max) : null,
    colour: params.colour ?? null,
    state: params.state ?? null,
  };
  const n = filterCount(values);
  const sticky = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [q, filter]);
  return (
    <div data-testid="explore-results">
      <div
        ref={sticky}
        className="glass-nav sticky top-0 z-40 pt-[env(safe-area-inset-top)]"
        data-phone-bar
      >
        <div className="flex h-[var(--phone-bar-h)] items-center gap-1 pl-1 pr-3">
          <button
            type="button"
            onClick={() => popScreen(router, '/explore')}
            aria-label="Back"
            data-testid="bar-back"
            className="flex h-11 w-11 shrink-0 items-center justify-center"
          >
            <ChevronIcon dir="left" width={20} height={20} strokeWidth={1.6} />
          </button>
          <SearchField
            initial={q}
            onSubmit={(next) => router.replace(`/explore?${toSearch(next, values, params.sort)}`)}
          />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-3 pb-2.5" aria-label="Filters">
          <Chip onClick={() => setFilters(true)} testId="results-filter" pressed={n > 0}>
            <SlidersIcon width={14} height={14} /> Filter{n ? ` · ${n}` : ''}
          </Chip>
          <Chip
            onClick={() => setSortOpen((o) => !o)}
            testId="results-sort"
            pressed={Boolean(params.sort)}
          >
            Sort{params.sort ? ` · ${params.sort === 'price-asc' ? 'Low–high' : 'High–low'}` : ''}
          </Chip>
          {filter !== 'all' && (
            <Chip
              href={`/explore?${toSearch(q, { ...values, filter: 'all' }, params.sort)}`}
              pressed
            >
              {FILTER_LABEL[filter]} <CloseIcon width={12} height={12} />
            </Chip>
          )}
          {values.size && (
            <Chip href={`/explore?${toSearch(q, { ...values, size: null }, params.sort)}`} pressed>
              AU {values.size} <CloseIcon width={12} height={12} />
            </Chip>
          )}
          {values.max && (
            <Chip href={`/explore?${toSearch(q, { ...values, max: null }, params.sort)}`} pressed>
              Under A${values.max} <CloseIcon width={12} height={12} />
            </Chip>
          )}
        </div>
        {sortOpen && (
          <div className="flex gap-2 px-3 pb-3" role="group" aria-label="Sort by">
            {[
              ['', 'Relevant'],
              ['price-asc', 'Price low–high'],
              ['price-desc', 'Price high–low'],
            ].map(([v, l]) => (
              <Chip
                key={v}
                pressed={(params.sort ?? '') === v}
                onClick={() => {
                  setSortOpen(false);
                  router.replace(`/explore?${toSearch(q, values, v || undefined)}`);
                }}
              >
                {l}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <p
        className="px-4 pb-2 pt-3 text-[12px] text-muted"
        data-testid="results-count"
        aria-live="polite"
      >
        {products.length} {products.length === 1 ? 'piece' : 'pieces'}
        {q ? ` for “${q}”` : ''}
      </p>
      {products.length ? (
        <PhoneProductGrid products={products} savedIds={new Set(savedIds)} />
      ) : (
        <div className="px-6 py-16 text-center">
          <p className="font-display text-[26px]">Nothing quite like that yet.</p>
          <p className="mt-2 text-[13px] text-muted">
            Try fewer filters, or have it made by a maker.
          </p>
          <Link
            href="/have-it-made"
            className="mt-5 inline-flex min-h-[48px] items-center rounded-pill bg-ink px-6 text-[12px] uppercase tracking-[0.16em] text-ground"
          >
            Have it made
          </Link>
        </div>
      )}
      <FilterSheet
        open={filters}
        onOpenChange={setFilters}
        initial={values}
        q={q}
        onApply={(v) => {
          setFilters(false);
          router.replace(`/explore?${toSearch(q, v, params.sort)}`);
        }}
      />
    </div>
  );
}
