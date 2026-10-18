'use client';

import { useState } from 'react';
import { FilterIcon } from '@/components/ui/icons';
import type { FeedFilters } from '@/lib/queries/catalog';

const TYPES = [
  { v: 'ready_to_ship', l: 'Ready to ship' },
  { v: 'made_to_order', l: 'Made to order' },
  { v: 'one_of_one', l: 'One of one' },
];
const STATES = [
  { v: 'VIC', l: 'Melbourne & VIC' },
  { v: 'NSW', l: 'Sydney & NSW' },
  { v: 'QLD', l: 'Brisbane & QLD' },
  { v: 'SA', l: 'Adelaide & SA' },
];
const PRICES = [150, 200, 250, 300, 400, 500];
const LEADS = [
  { v: 14, l: 'Within 2 weeks' },
  { v: 21, l: 'Within 3 weeks' },
  { v: 28, l: 'Within 4 weeks' },
];

export function Filters({
  filters,
  options,
  action = '/',
  activeCount,
}: {
  filters: FeedFilters;
  options: { categories: string[]; colours: string[]; sizes: string[] };
  action?: string;
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);
  const select = 'input py-2 text-sm';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="feed-filters"
        className="inline-flex items-center gap-2 rounded-full border border-stone bg-white px-4 py-2 text-sm hover:border-ink"
      >
        <FilterIcon width={16} height={16} /> Filters{activeCount ? ` (${activeCount})` : ''}
      </button>
      <form
        id="feed-filters"
        action={action}
        method="get"
        className={`card basis-full grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 ${open ? 'grid' : 'hidden'}`}
      >
        {filters.tab !== 'for-you' && <input type="hidden" name="tab" value={filters.tab} />}
        <label className="text-sm">
          <span className="label">Category</span>
          <select name="category" defaultValue={filters.category ?? ''} className={select}>
            <option value="">All</option>
            {options.categories.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c[0]!.toUpperCase() + c.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Size (AU)</span>
          <select name="size" defaultValue={filters.size ?? ''} className={select}>
            <option value="">Any</option>
            {options.sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Colour</span>
          <select name="colour" defaultValue={filters.colour ?? ''} className={select}>
            <option value="">Any</option>
            {options.colours.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Availability</span>
          <select name="type" defaultValue={filters.type ?? ''} className={select}>
            <option value="">Any</option>
            {TYPES.map((t) => (
              <option key={t.v} value={t.v}>
                {t.l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Min price</span>
          <select name="minPrice" defaultValue={filters.minPrice ?? ''} className={select}>
            <option value="">No min</option>
            {PRICES.map((p) => (
              <option key={p} value={p}>
                A${p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Max price</span>
          <select name="maxPrice" defaultValue={filters.maxPrice ?? ''} className={select}>
            <option value="">No max</option>
            {PRICES.map((p) => (
              <option key={p} value={p}>
                A${p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Maker location</span>
          <select name="state" defaultValue={filters.state ?? ''} className={select}>
            <option value="">Anywhere in Australia</option>
            {STATES.map((s) => (
              <option key={s.v} value={s.v}>
                {s.l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="label">Lead time</span>
          <select name="maxLead" defaultValue={filters.maxLead ?? ''} className={select}>
            <option value="">Any</option>
            {LEADS.map((l) => (
              <option key={l.v} value={l.v}>
                {l.l}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex items-center justify-end gap-3 sm:col-span-3 lg:col-span-4">
          <a
            href={filters.tab === 'for-you' ? action : `${action}?tab=${filters.tab}`}
            className="text-sm text-ink-soft underline-offset-4 hover:underline"
          >
            Clear all
          </a>
          <button
            type="submit"
            className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-paper hover:bg-ink-soft"
          >
            Show pieces
          </button>
        </div>
      </form>
    </>
  );
}
