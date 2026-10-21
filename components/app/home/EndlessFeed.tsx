'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductCard } from '@/lib/queries/catalog';
import { PhoneGridSkeleton, PhoneProductTile } from '../ProductGrid';

/**
 * The rest of the feed, loaded a page at a time as the bottom comes into view. Never a button.
 */
export function EndlessFeed({
  query,
  startPage,
  initialHasMore,
  initial = [],
  savedIds,
}: {
  /** The feed's query string (tab, filters) without `page`. */
  query: string;
  startPage: number;
  initialHasMore: boolean;
  initial?: ProductCard[];
  savedIds: string[];
}) {
  const [items, setItems] = useState(initial);
  const [saved, setSaved] = useState(() => new Set(savedIds));
  const [page, setPage] = useState(startPage);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/feed?${query}${query ? '&' : ''}page=${page}`);
      const json = (await res.json()) as {
        items: ProductCard[];
        hasMore: boolean;
        saved: string[];
      };
      setItems((x) => [...x, ...json.items]);
      setSaved((s) => new Set([...s, ...json.saved]));
      setHasMore(json.hasMore);
      setPage((p) => p + 1);
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, query]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && loadMore(), {
      rootMargin: '600px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  return (
    <div data-testid="endless-feed" data-feed-more={hasMore ? '' : undefined}>
      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-[2px]" role="list">
          {items.map((p) => (
            <li key={p.id}>
              <PhoneProductTile product={p} saved={saved.has(p.id)} />
            </li>
          ))}
        </ul>
      )}
      {loading && <PhoneGridSkeleton count={4} />}
      <div ref={sentinel} aria-hidden className="h-px" />
      {!hasMore && items.length > 0 && (
        <p className="py-8 text-center text-[12px] text-muted-2">That’s everything for now.</p>
      )}
    </div>
  );
}
