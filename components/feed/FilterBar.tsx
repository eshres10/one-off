'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { FilterIcon, CloseIcon } from '@/components/ui/icons';
import { Pill } from '@/components/ui/Pill';

type Option = { value: string; label: string };
type Group = { key: string; label: string; options: Option[] };

const STATES: Option[] = [
  { value: 'VIC', label: 'Melbourne & VIC' },
  { value: 'NSW', label: 'Sydney & NSW' },
  { value: 'QLD', label: 'Brisbane & QLD' },
  { value: 'SA', label: 'Adelaide & SA' },
];
const TYPES: Option[] = [
  { value: 'ready_to_ship', label: 'Ready to ship' },
  { value: 'made_to_order', label: 'Made to order' },
  { value: 'one_of_one', label: 'One of one' },
];
const PRICES: Option[] = [
  { value: '0-200', label: 'Under A$200' },
  { value: '200-300', label: 'A$200–300' },
  { value: '300-400', label: 'A$300–400' },
  { value: '400-', label: 'A$400+' },
];
const LEADS: Option[] = [
  { value: '14', label: 'Within 2 weeks' },
  { value: '21', label: 'Within 3 weeks' },
  { value: '28', label: 'Within 4 weeks' },
];

function cap(s: string) {
  return s[0]!.toUpperCase() + s.slice(1);
}

export function FilterBar({
  options,
}: {
  options: { categories: string[]; colours: string[]; sizes: string[] };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const bar = useRef<HTMLDivElement>(null);

  const groups: Group[] = [
    {
      key: 'category',
      label: 'Category',
      options: options.categories.map((c) => ({ value: c, label: cap(c) })),
    },
    { key: 'size', label: 'Size', options: options.sizes.map((s) => ({ value: s, label: s })) },
    { key: 'price', label: 'Price', options: PRICES },
    {
      key: 'colour',
      label: 'Colour',
      options: options.colours.map((c) => ({ value: c, label: c })),
    },
    { key: 'state', label: 'Maker location', options: STATES },
    { key: 'type', label: 'Availability', options: TYPES },
    { key: 'maxLead', label: 'Lead time', options: LEADS },
  ];

  const current = (key: string) => {
    if (key === 'price') {
      const min = params.get('minPrice');
      const max = params.get('maxPrice');
      return min || max ? `${min ?? '0'}-${max ?? ''}` : null;
    }
    return params.get(key);
  };

  function hrefWith(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    next.delete('page');
    if (key === 'price') {
      next.delete('minPrice');
      next.delete('maxPrice');
      if (value) {
        const [min, max] = value.split('-');
        if (min && min !== '0') next.set('minPrice', min);
        if (max) next.set('maxPrice', max);
      }
    } else if (value) next.set(key, value);
    else next.delete(key);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  const select = (key: string, value: string) => {
    router.push(hrefWith(key, current(key) === value ? null : value), { scroll: false });
    setOpenKey(null);
  };

  const activeCount = groups.filter((g) => current(g.key)).length;

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (bar.current && !bar.current.contains(e.target as Node)) setOpenKey(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenKey(null);
        setSheet(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const clearHref = (() => {
    const next = new URLSearchParams();
    const tab = params.get('tab');
    const q = params.get('q');
    if (tab) next.set('tab', tab);
    if (q) next.set('q', q);
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  return (
    <div ref={bar} className="border-y border-line">
      {/* Desktop: triggers + popovers */}
      <div className="container-page relative hidden min-h-[56px] items-center gap-7 md:flex">
        {groups.map((g) => {
          const value = current(g.key);
          const label = value ? (g.options.find((o) => o.value === value)?.label ?? value) : null;
          return (
            <div key={g.key} className="relative">
              <button
                type="button"
                aria-expanded={openKey === g.key}
                aria-haspopup="true"
                onClick={() => setOpenKey(openKey === g.key ? null : g.key)}
                className={`min-h-[44px] text-[11px] uppercase tracking-label ${value ? 'underline underline-offset-[6px]' : ''}`}
              >
                {g.label}
                {label ? `: ${label}` : ''} ▾
              </button>
              {openKey === g.key && (
                <div
                  className="glass-light absolute left-0 top-full z-30 mt-2 w-[min(420px,80vw)] bg-[rgba(246,244,240,0.95)] p-4"
                  role="group"
                  aria-label={g.label}
                >
                  <div className="flex flex-wrap gap-2">
                    {g.options.map((o) => (
                      <Pill
                        key={o.value}
                        pressed={value === o.value}
                        onClick={() => select(g.key, o.value)}
                      >
                        {o.label}
                      </Pill>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {activeCount > 0 && (
          <a
            href={clearHref}
            className="ml-auto text-[11px] uppercase tracking-label text-muted-2 underline underline-offset-[6px]"
          >
            Clear all
          </a>
        )}
      </div>

      {/* Mobile: Filter pill + quick chips */}
      <div className="no-scrollbar bleed flex items-center gap-2 overflow-x-auto py-3 md:hidden">
        <button
          type="button"
          onClick={() => setSheet(true)}
          className="glass-dark inline-flex min-h-[44px] shrink-0 items-center gap-2 px-4 text-[11px] uppercase tracking-label"
          aria-expanded={sheet}
        >
          <FilterIcon width={14} height={14} /> Filter{activeCount ? ` (${activeCount})` : ''}
        </button>
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={current('type') === t.value}
            onClick={() => select('type', t.value)}
            className={`inline-flex min-h-[44px] shrink-0 items-center px-4 text-[11px] uppercase tracking-label ${current('type') === t.value ? 'glass-dark' : 'border border-line-strong'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sheet && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <button
            type="button"
            aria-label="Close filters"
            className="absolute inset-0 bg-black/30"
            onClick={() => setSheet(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto bg-ground px-4 pb-6 pt-4">
            <div className="flex items-center justify-between">
              <p className="font-display text-[28px]">Filter</p>
              <button
                type="button"
                onClick={() => setSheet(false)}
                aria-label="Close filters"
                className="flex h-11 w-11 items-center justify-center"
              >
                <CloseIcon />
              </button>
            </div>
            {groups.map((g) => (
              <fieldset key={g.key} className="border-t border-line py-4">
                <legend className="eyebrow mb-3 text-ink">{g.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {g.options.map((o) => (
                    <Pill
                      key={o.value}
                      pressed={current(g.key) === o.value}
                      onClick={() =>
                        router.push(hrefWith(g.key, current(g.key) === o.value ? null : o.value), {
                          scroll: false,
                        })
                      }
                    >
                      {o.label}
                    </Pill>
                  ))}
                </div>
              </fieldset>
            ))}
            <div className="sticky bottom-0 flex gap-2 bg-ground pt-3">
              <a
                href={clearHref}
                className="flex min-h-[52px] flex-1 items-center justify-center border border-ink text-[11px] uppercase tracking-label"
              >
                Clear all
              </a>
              <button
                type="button"
                onClick={() => setSheet(false)}
                className="glass-dark min-h-[52px] flex-1 text-[11px] uppercase tracking-label"
              >
                Show pieces
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
