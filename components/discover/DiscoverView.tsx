'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIES,
  EMPTY,
  activePills,
  clearFilters,
  discoverHref,
  isNarrowed,
  panelFilterCount,
  toQuery,
  type DiscoverParams,
} from '@/lib/discover/params';
import { placeInColumns } from '@/lib/discover/masonry';
import type { DiscoverItem, DiscoverPage } from '@/lib/queries/discover';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { CameraIcon, CloseIcon, FilterIcon, SearchIcon } from '@/components/ui/icons';
import { SavedHeart } from '@/components/layout/SavedHeart';
import { EditCard, MakerCard, PIECE_TEXT, PieceCard, pieceRatio } from './DiscoverCards';
import { FilterPanel } from './FilterPanel';

const LAYOUTS = [
  { cols: 2, className: 'flex gap-2 md:hidden', col: 'gap-2' },
  { cols: 3, className: 'hidden gap-3 md:flex lg:hidden', col: 'gap-3' },
  { cols: 4, className: 'hidden gap-3 lg:flex xl:hidden', col: 'gap-3' },
  { cols: 5, className: 'hidden gap-3 xl:flex', col: 'gap-3' },
] as const;

/** Placeholders match a typical card: a 2:3 photo plus the name and maker lines. */
const SKELETON_HEIGHT = 1.5 + PIECE_TEXT;

function itemHeight(item: DiscoverItem) {
  if (item.id.startsWith('skeleton-')) return SKELETON_HEIGHT;
  if (item.kind === 'piece') return pieceRatio(item) + PIECE_TEXT;
  if (item.kind === 'edit') return 1.25;
  return 0.95;
}

const STORE = 'oneoff:discover';

interface Stored {
  query: string;
  items: DiscoverItem[];
  nextCursor: string | null;
  scrollY: number;
  at: number;
}

/**
 * Discover: search, single-select category chips, a Filters panel, removable pills and a
 * shortest-column masonry with infinite scroll. Everything is in the URL; returning from a
 * product page restores what was loaded and where you were.
 */
export function DiscoverView({
  params,
  initial,
  savedIds,
  followingIds,
  savedCount,
}: {
  params: DiscoverParams;
  initial: DiscoverPage;
  savedIds: string[];
  followingIds: string[];
  savedCount: number;
}) {
  const router = useRouter();
  const query = toQuery(params);
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [saved, setSaved] = useState(() => new Set(savedIds));
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [q, setQ] = useState(params.q);
  const filtersButton = useRef<HTMLButtonElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const following = useMemo(() => new Set(followingIds), [followingIds]);
  const total = initial.total ?? 0;

  // A new URL brings a new first page from the server (the search box keeps focus meanwhile).
  const shown = useRef(initial);
  useEffect(() => {
    if (shown.current === initial) return;
    shown.current = initial;
    setItems(initial.items);
    setNextCursor(initial.nextCursor);
  }, [initial]);

  // A pill or "Clear all" can change the search from outside the box.
  useEffect(() => {
    if (document.activeElement?.getAttribute('data-testid') !== 'discover-search') setQ(params.q);
  }, [params.q]);

  // Restore what was loaded (and the scroll position) when coming back to the same feed.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORE);
      const s = raw ? (JSON.parse(raw) as Stored) : null;
      if (
        s &&
        s.query === query &&
        Date.now() - s.at < 30 * 60_000 &&
        s.items.length > items.length
      ) {
        setItems(s.items);
        setNextCursor(s.nextCursor);
        requestAnimationFrame(() => window.scrollTo(0, s.scrollY));
      }
    } catch {
      // Storage unavailable: start at the top.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remember = useCallback(() => {
    try {
      const s: Stored = { query, items, nextCursor, scrollY: window.scrollY, at: Date.now() };
      sessionStorage.setItem(STORE, JSON.stringify(s));
    } catch {
      // ignore
    }
  }, [query, items, nextCursor]);

  useEffect(() => {
    window.addEventListener('pagehide', remember);
    return () => {
      window.removeEventListener('pagehide', remember);
      remember();
    };
  }, [remember]);

  // Search: debounced into the URL.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = setTimeout(
      () => router.replace(discoverHref({ ...params, q: q.trim() }), { scroll: false }),
      250,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/discover?${query}${query ? '&' : ''}cursor=${encodeURIComponent(nextCursor)}`,
      );
      const page = (await res.json()) as DiscoverPage & { saved?: string[] };
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      if (page.saved?.length) setSaved((s) => new Set([...s, ...page.saved!]));
      setNextCursor(page.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !nextCursor) return;
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && void loadMore(),
      {
        rootMargin: '800px 0px',
      },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore, nextCursor]);

  const go = (next: DiscoverParams) => router.push(discoverHref(next), { scroll: false });
  const pills = activePills(params);
  const filterCount = panelFilterCount(params);
  // While more pages exist, two rows of placeholders sit under the feed. Next pages fill in
  // where they are, so nothing on screen (the footer included) moves when they arrive.
  const remaining = Math.max(0, total - items.filter((i) => i.kind === 'piece').length);
  const skeletons = (cols: number): DiscoverItem[] =>
    nextCursor
      ? Array.from({ length: Math.min(cols * 2, remaining || cols) }, (_, i) => ({
          kind: 'edit' as const,
          id: `skeleton-${items.length}-${i}`,
          slug: '',
          title: '',
          image: '',
        }))
      : [];

  return (
    <div className="pb-16">
      <div className="container-page pt-6 md:pt-12">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[44px] leading-none md:text-[72px]">Discover</h1>
            <p className="mt-2 text-[14px] text-muted md:text-[15px]">
              Original pieces from Melbourne studios, newest and most-loved first.
            </p>
          </div>
          <div className="md:hidden">
            <SavedHeart count={savedCount} always />
          </div>
        </div>
      </div>

      <div className="glass-light follow-header sticky top-[var(--header-offset)] z-30 mt-5 border-b-0 py-3">
        <div className="container-page space-y-3">
          <form
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              router.replace(discoverHref({ ...params, q: q.trim() }), { scroll: false });
            }}
          >
            <label className="glass-chip flex min-h-[48px] items-center gap-2.5 px-3.5">
              <SearchIcon width={18} height={18} strokeWidth={1.4} />
              <span className="sr-only">Search Discover</span>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search pieces, makers, fabrics"
                autoComplete="off"
                enterKeyHint="search"
                data-testid="discover-search"
                className="min-w-0 flex-1 bg-transparent py-3 text-[15px] font-light placeholder:text-muted-2 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              <span className="group relative">
                <button
                  type="button"
                  aria-disabled="true"
                  aria-label="Search by photo (coming soon)"
                  aria-describedby="discover-photo-tip"
                  onClick={(e) => e.preventDefault()}
                  className="flex h-11 w-11 cursor-not-allowed items-center justify-center text-muted-2"
                >
                  <CameraIcon width={18} height={18} strokeWidth={1.4} />
                </button>
                <span
                  id="discover-photo-tip"
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap bg-ink px-2 py-1 text-[11px] text-ground group-focus-within:block group-hover:block"
                >
                  Coming soon
                </span>
              </span>
            </label>
          </form>
          <div className="flex items-center gap-3">
            <button
              ref={filtersButton}
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              data-testid="filters-button"
              className="order-first flex min-h-[44px] shrink-0 items-center gap-2 border border-ink px-3.5 text-[11px] uppercase tracking-label md:order-last"
            >
              <FilterIcon width={14} height={14} />
              Filters{filterCount ? ` · ${filterCount}` : ''}
            </button>
            <nav
              aria-label="Categories"
              className="no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto"
            >
              {CATEGORIES.map((c) => {
                const on = params.cat === c.value;
                return (
                  <Link
                    key={c.value}
                    href={discoverHref({ ...params, cat: c.value })}
                    scroll={false}
                    aria-current={on ? 'true' : undefined}
                    className={`flex min-h-[44px] shrink-0 items-center rounded-circle border px-4 text-[11px] uppercase tracking-[0.12em] ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong hover:border-ink'}`}
                  >
                    {c.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      <div className="container-page">
        {(pills.length > 0 || items.length > 0) && (
          <div className="flex flex-wrap items-center gap-2 py-4" data-testid="discover-pills">
            {pills.map((p) => (
              <Link
                key={p.key}
                href={discoverHref(p.without)}
                scroll={false}
                data-testid="filter-pill"
                className="flex min-h-[36px] items-center gap-1.5 rounded-circle bg-stone-light px-3 text-[12px] hover:bg-line"
                aria-label={`Remove ${p.label}`}
              >
                {p.label} <CloseIcon width={10} height={10} />
              </Link>
            ))}
            {pills.length > 0 && (
              <Link
                href={discoverHref(clearFilters(params))}
                scroll={false}
                className="flex min-h-[36px] items-center px-2 text-[11px] uppercase tracking-label underline underline-offset-[5px]"
              >
                Clear all
              </Link>
            )}
            <p
              className="ml-auto text-[12px] text-muted"
              data-testid="discover-count"
              aria-live="polite"
            >
              {total}{' '}
              {total === 1
                ? params.cat === 'makers'
                  ? 'maker'
                  : 'piece'
                : params.cat === 'makers'
                  ? 'makers'
                  : 'pieces'}
            </p>
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-20 text-center" data-testid="discover-empty">
            <p className="font-display text-[40px] leading-tight">Nothing matches that yet</p>
            <p className="mt-2 text-[14px] text-muted">
              Try fewer filters, or ask a maker to make it for you.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={discoverHref({ ...EMPTY })} className={buttonClass('secondary')}>
                Clear filters
              </Link>
              <ButtonLink href="/custom">Request a custom piece</ButtonLink>
            </div>
          </div>
        ) : (
          <div onClickCapture={remember} data-qv-list data-feed-more={nextCursor ? '' : undefined}>
            {LAYOUTS.map((layout) => (
              <div key={layout.cols} className={layout.className} data-masonry={layout.cols}>
                {placeInColumns([...items, ...skeletons(layout.cols)], layout.cols, itemHeight).map(
                  (col, c) => (
                    <div key={c} className={`flex min-w-0 flex-1 flex-col ${layout.col}`}>
                      {col.map((item) =>
                        item.id.startsWith('skeleton-') ? (
                          <div
                            key={item.id}
                            className="skeleton"
                            style={{ aspectRatio: `1 / ${SKELETON_HEIGHT}` }}
                            aria-hidden
                          />
                        ) : item.kind === 'piece' ? (
                          <PieceCard
                            key={item.id}
                            piece={item}
                            saved={saved.has(item.id)}
                            priority={layout.cols === 2 && items.indexOf(item) < 2}
                          />
                        ) : item.kind === 'edit' ? (
                          <EditCard key={item.id} edit={item} />
                        ) : (
                          <MakerCard
                            key={item.id}
                            maker={item}
                            following={following.has(item.id)}
                          />
                        ),
                      )}
                    </div>
                  ),
                )}
              </div>
            ))}
            <div ref={sentinel} aria-hidden className="h-px" />
            {/* Visually hidden until the end, so it never moves while pages load in. */}
            <p
              className={nextCursor ? 'sr-only' : 'py-10 text-center text-[12px] text-muted'}
              aria-live="polite"
              data-testid="discover-status"
            >
              {loading
                ? 'Loading more pieces…'
                : nextCursor
                  ? ''
                  : isNarrowed(params) || items.length > 12
                    ? 'You’ve seen it all'
                    : ''}
            </p>
          </div>
        )}
      </div>

      {filtersOpen && (
        <FilterPanel
          params={params}
          returnFocus={filtersButton}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            setFiltersOpen(false);
            go(next);
          }}
        />
      )}
    </div>
  );
}
