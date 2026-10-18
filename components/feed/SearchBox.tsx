'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SearchIcon } from '@/components/ui/icons';

const KEY = 'oneoff:recent-searches';

function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function SearchBox({
  initial = '',
  suggestions,
}: {
  initial?: string;
  suggestions: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => setRecent(readRecent()), []);

  const go = (term: string) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...readRecent().filter((r) => r.toLowerCase() !== t.toLowerCase())].slice(
      0,
      6,
    );
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // private mode: recent searches simply aren't remembered
    }
    router.push(`/search?q=${encodeURIComponent(t)}`);
  };

  return (
    <div>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex items-center gap-3 border-b border-ink pb-2"
      >
        <SearchIcon width={22} height={22} />
        <label htmlFor="search-q" className="sr-only">
          Search pieces and makers
        </label>
        <input
          id="search-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search pieces, makers, colours…"
          autoFocus={!initial}
          className="min-h-[56px] flex-1 bg-transparent font-display text-[32px] leading-none placeholder:text-muted-2 focus:outline-none md:text-[48px]"
        />
      </form>
      {!initial && (
        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {recent.length > 0 && (
            <div>
              <p className="eyebrow mb-3">Recent searches</p>
              <ul className="space-y-2">
                {recent.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      onClick={() => go(r)}
                      className="min-h-[44px] text-[15px] hover:underline"
                    >
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="eyebrow mb-3">Suggested</p>
            <ul className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => go(s)}
                    className="min-h-[44px] border border-line-strong px-4 text-[13px] hover:border-ink"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
