'use client';

import { useEffect, useRef, useState } from 'react';
import { COLOURS, SIZES } from '@/lib/discover/params';
import { SITE } from '@/lib/site/config';
import { Sheet } from './Sheet';
import { AppButton, Chip } from './ui';

export interface FilterValues {
  /** How it's made: all | ready_to_ship | made_to_order | one_of_one | under_300. */
  filter: string;
  size: string | null;
  max: number | null;
  colour: string | null;
  state: string | null;
}

export function filterCount(v: FilterValues) {
  return [v.filter !== 'all', v.size, v.max, v.colour, v.state].filter(Boolean).length;
}

const HOW = [
  ['all', 'Any'],
  ['ready_to_ship', 'Ready to ship'],
  ['made_to_order', 'Made to order'],
  ['one_of_one', 'One of one'],
] as const;
const PRICES = [200, 300, 400, 600];

/**
 * The filter sheet: size, how it's made, price, colour and location. "Show N pieces" counts
 * live from /api/explore/count (debounced 250ms). Clear puts everything back.
 */
export function FilterSheet({
  open,
  onOpenChange,
  initial,
  q = '',
  onApply,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: FilterValues;
  q?: string;
  onApply: (v: FilterValues) => void;
}) {
  const [v, setV] = useState<FilterValues>(initial);
  const [count, setCount] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (open) setV(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (!open) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const p = new URLSearchParams();
      if (q) p.set('q', q);
      if (v.filter !== 'all') p.set('filter', v.filter);
      if (v.size) p.set('size', v.size);
      if (v.max) p.set('max', String(v.max));
      if (v.colour) p.set('colour', v.colour);
      if (v.state) p.set('state', v.state);
      try {
        const res = await fetch(`/api/explore/count?${p.toString()}`);
        const json = (await res.json()) as { total: number };
        setCount(json.total);
      } catch {
        setCount(null);
      }
    }, 250);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [v, q, open]);

  const set = <K extends keyof FilterValues>(k: K, val: FilterValues[K]) =>
    setV((s) => ({ ...s, [k]: val }));
  const row = 'mt-2 flex flex-wrap gap-2';
  const head = 'mt-5 text-[11px] uppercase tracking-label text-muted-2 first:mt-0';

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Filters"
      testId="filter-sheet"
      footer={
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setV({ filter: 'all', size: null, max: null, colour: null, state: null })
            }
            className="min-h-[48px] px-2 text-[12px] uppercase tracking-label underline underline-offset-[5px]"
            data-testid="filter-clear"
          >
            Clear
          </button>
          <AppButton onClick={() => onApply(v)} className="flex-1" data-testid="filter-apply">
            Show {count === null ? '…' : `${count} ${count === 1 ? 'piece' : 'pieces'}`}
          </AppButton>
        </div>
      }
    >
      <p className={head}>Size</p>
      <div className={row} role="group" aria-label="Size">
        {SIZES.map((s) => (
          <Chip
            key={s}
            pressed={v.size === s}
            onClick={() => set('size', v.size === s ? null : s)}
            testId={`filter-size-${s}`}
          >
            AU {s}
          </Chip>
        ))}
      </div>
      <p className={head}>How it’s made</p>
      <div className={row} role="group" aria-label="How it's made">
        {HOW.map(([val, label]) => (
          <Chip
            key={val}
            pressed={v.filter === val}
            onClick={() => set('filter', val)}
            testId={`filter-how-${val}`}
          >
            {label}
          </Chip>
        ))}
      </div>
      <p className={head}>Price</p>
      <div className={row} role="group" aria-label="Price">
        {PRICES.map((p) => (
          <Chip
            key={p}
            pressed={v.max === p}
            onClick={() => set('max', v.max === p ? null : p)}
            testId={`filter-max-${p}`}
          >
            Under A${p}
          </Chip>
        ))}
      </div>
      <p className={head}>Colour</p>
      <div className={row} role="group" aria-label="Colour">
        {COLOURS.map((c) => (
          <Chip
            key={c.value}
            pressed={v.colour === c.value}
            onClick={() => set('colour', v.colour === c.value ? null : c.value)}
          >
            <span
              aria-hidden
              className="h-3 w-3 rounded-circle border border-line-strong"
              style={{ background: c.hex }}
            />
            {c.label}
          </Chip>
        ))}
      </div>
      <p className={head}>Made in</p>
      <div className={row} role="group" aria-label="Location">
        {SITE.makerRegions.map((s) => (
          <Chip
            key={s}
            pressed={v.state === s}
            onClick={() => set('state', v.state === s ? null : s)}
          >
            {s}
          </Chip>
        ))}
      </div>
    </Sheet>
  );
}
