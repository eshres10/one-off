'use client';

import { useEffect, useState } from 'react';
import { toInches } from '@/content/pages/size-guide';

const KEY = 'oo:size-unit';

/**
 * The size chart with a cm / in switch (remembered on this device) and the buyer's saved size
 * highlighted in stone. On phones it scrolls sideways with the row labels pinned.
 */
export function SizeTable({
  title,
  sizes,
  rows,
  highlight,
}: {
  title: string;
  sizes: string[];
  rows: Array<{ label: string; cm: number[] }>;
  highlight: string | null;
}) {
  const [unit, setUnit] = useState<'cm' | 'in'>('cm');
  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) === 'in') setUnit('in');
    } catch {
      // Storage blocked: stay on cm.
    }
  }, []);
  const choose = (u: 'cm' | 'in') => {
    setUnit(u);
    try {
      window.localStorage.setItem(KEY, u);
    } catch {
      // Not remembered; that's fine.
    }
  };
  const col = highlight ? sizes.indexOf(highlight.replace(/^AU\s*/i, '')) : -1;
  const hl = (i: number) => (i === col ? 'bg-stone' : '');
  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-[30px] leading-none md:text-[34px]">{title}</h2>
        <div role="group" aria-label="Units" className="flex border border-ink">
          {(['cm', 'in'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => choose(u)}
              className={`min-h-[36px] min-w-[56px] text-[11px] uppercase tracking-label ${unit === u ? 'bg-ink text-ground' : ''}`}
              data-testid={`unit-${u}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 overflow-x-auto" data-testid="size-table-scroll">
        <table
          className="w-full min-w-[640px] border-t border-ink text-center text-[14px]"
          data-testid="size-table"
        >
          <thead>
            <tr className="border-b border-ink">
              <th
                scope="col"
                className="sticky left-0 z-[1] bg-ground py-4 pr-4 text-left text-[11px] font-normal uppercase tracking-label text-muted-2"
              >
                AU size
              </th>
              {sizes.map((s, i) => (
                <th
                  key={s}
                  scope="col"
                  className={`py-4 font-display text-[26px] font-normal ${hl(i)}`}
                  data-highlight={i === col ? '' : undefined}
                >
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-line">
                <th
                  scope="row"
                  className="sticky left-0 z-[1] bg-ground py-4 pr-4 text-left text-[11px] font-normal uppercase tracking-label"
                >
                  {r.label} <span className="text-muted-2">({unit})</span>
                </th>
                {r.cm.map((v, i) => (
                  <td
                    key={i}
                    className={`py-4 tabular-nums ${hl(i)}`}
                    data-testid={`cell-${r.label.toLowerCase()}-${sizes[i]}`}
                  >
                    {unit === 'cm' ? v : toInches(v).toFixed(1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
