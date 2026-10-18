'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { CameraIcon, SearchIcon } from '@/components/ui/icons';

const RECENT_KEY = 'oneoff:recent-searches';
const MAX_RECENT = 6;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Private mode: recent searches simply aren't remembered.
  }
}

export const FILTER_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'ready_to_ship', label: 'Ready to ship' },
  { value: 'made_to_order', label: 'Made to order' },
  { value: 'one_of_one', label: 'One of one' },
  { value: 'under_300', label: 'Under A$300' },
] as const;

function href(q: string, filter: string) {
  const p = new URLSearchParams();
  if (q.trim()) p.set('q', q.trim());
  if (filter !== 'all') p.set('filter', filter);
  const s = p.toString();
  return s ? `/search?${s}` : '/search';
}

/**
 * The search field and everything that reacts to typing. Results themselves are rendered on the
 * server from the URL (`?q=&filter=`), so a search is shareable; typing updates the URL after
 * 200ms. Before anything is typed, `idle` (recent searches + browse tiles) is shown instead.
 */
export function SearchShell({
  initialQuery,
  filter,
  idle,
  children,
}: {
  initialQuery: string;
  filter: string;
  idle: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [q, setQ] = useState(initialQuery);
  const [recent, setRecent] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const first = useRef(true);

  useEffect(() => setRecent(readRecent()), []);

  // Debounced URL update while typing.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(
      () => start(() => router.replace(href(q, filter), { scroll: false })),
      200,
    );
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const remember = (term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    const next = [t, ...readRecent().filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(
      0,
      MAX_RECENT,
    );
    writeRecent(next);
    setRecent(next);
  };

  const typed = q.trim().length > 0;
  const showResults = typed || filter !== 'all';

  return (
    <div>
      <div className="sticky top-[var(--header-h)] z-30 bg-ground/80 px-3 pb-3 pt-3 backdrop-blur-md md:px-[var(--gutter)] md:pt-6">
        <h1 className="sr-only">Search</h1>
        <form
          role="search"
          className="mx-auto flex max-w-page items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            remember(q);
            input.current?.blur();
            start(() => router.replace(href(q, filter), { scroll: false }));
          }}
        >
          <label className="glass-chip flex min-h-[48px] flex-1 items-center gap-2.5 px-3.5">
            <SearchIcon width={18} height={18} strokeWidth={1.4} />
            <span className="sr-only">Search pieces, makers and occasions</span>
            <input
              ref={input}
              type="search"
              name="q"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search pieces, makers, occasions"
              autoComplete="off"
              enterKeyHint="search"
              data-testid="search-input"
              className="min-w-0 flex-1 bg-transparent py-3 text-[15px] font-light placeholder:text-muted-2 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            <span className="group relative">
              <button
                type="button"
                aria-disabled="true"
                aria-label="Search by photo (coming soon)"
                aria-describedby="photo-search-tip"
                onClick={(e) => e.preventDefault()}
                className="flex h-11 w-11 cursor-not-allowed items-center justify-center text-muted-2"
              >
                <CameraIcon width={18} height={18} strokeWidth={1.4} />
              </button>
              <span
                id="photo-search-tip"
                role="tooltip"
                className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden whitespace-nowrap bg-ink px-2 py-1 text-[11px] text-ground group-focus-within:block group-hover:block"
              >
                Coming soon
              </span>
            </span>
          </label>
          {typed && (
            <button
              type="button"
              onClick={() => {
                setQ('');
                start(() => router.replace(href('', filter), { scroll: false }));
                input.current?.focus();
              }}
              className="min-h-[44px] text-[11px] uppercase tracking-label"
            >
              Cancel
            </button>
          )}
        </form>
        {showResults && (
          <div
            className="no-scrollbar mx-auto mt-3 flex max-w-page gap-2 overflow-x-auto"
            role="group"
            aria-label="Filter results"
          >
            {FILTER_CHIPS.map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={filter === c.value}
                onClick={() => start(() => router.replace(href(q, c.value), { scroll: false }))}
                className={`min-h-[36px] shrink-0 border px-3.5 text-[11px] uppercase tracking-[0.12em] ${
                  filter === c.value
                    ? 'border-ink bg-ink text-ground'
                    : 'border-line-strong bg-transparent text-ink hover:border-ink'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {showResults ? (
        <div
          aria-busy={pending}
          className={`transition-opacity ${pending ? 'opacity-60' : ''}`}
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('a[href^="/products/"]')) remember(q);
          }}
        >
          {children}
        </div>
      ) : (
        <div>
          {recent.length > 0 && (
            <section aria-labelledby="recent-title" className="px-3 pt-4 md:px-[var(--gutter)]">
              <div className="mx-auto flex max-w-page items-baseline justify-between">
                <h2 id="recent-title" className="font-sans text-[11px] uppercase tracking-label">
                  Recent
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    writeRecent([]);
                    setRecent([]);
                  }}
                  className="min-h-[44px] text-[11px] uppercase tracking-label text-muted-2 underline underline-offset-[5px]"
                >
                  Clear
                </button>
              </div>
              <ul className="mx-auto flex max-w-page flex-wrap gap-2" role="list">
                {recent.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => setQ(r)}
                      className="flex min-h-[36px] items-center gap-2 border border-line-strong px-3 text-[13px]"
                    >
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {idle}
        </div>
      )}
    </div>
  );
}
