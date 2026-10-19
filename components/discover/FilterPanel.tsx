'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  AVAILABILITY,
  COLOURS,
  PRICE,
  SIZES,
  SORTS,
  clearFilters,
  toQuery,
  type DiscoverParams,
} from '@/lib/discover/params';
import { CloseIcon } from '@/components/ui/icons';

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-b border-line py-5">
      <legend className="text-[11px] uppercase tracking-[0.14em] text-muted-2">{title}</legend>
      <div className="mt-3">{children}</div>
    </fieldset>
  );
}

/**
 * Filters: a 400px right-hand drawer on desktop, an 85vh bottom sheet on phones. Changes are a
 * draft until "Show N pieces" (N counted live). Focus is trapped while open; Esc closes and
 * focus returns to the Filters button.
 */
export function FilterPanel({
  params,
  onApply,
  onClose,
  returnFocus,
}: {
  params: DiscoverParams;
  onApply: (next: DiscoverParams) => void;
  onClose: () => void;
  returnFocus: RefObject<HTMLButtonElement>;
}) {
  const [draft, setDraft] = useState(params);
  const [count, setCount] = useState<number | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/discover?count=1&${toQuery(draft)}`, { signal: ctrl.signal })
        .then((r) => r.json() as Promise<{ total: number }>)
        .then((d) => setCount(d.total))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [draft]);

  // Focus trap, Esc, scroll lock, and focus back to the Filters button on close.
  useEffect(() => {
    const el = panel.current;
    const trigger = returnFocus.current;
    const items = () =>
      Array.from(
        el?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, [href], [tabindex="0"]',
        ) ?? [],
      );
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') {
        const list = items();
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      trigger?.focus();
    };
    // Runs once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const square = (on: boolean) =>
    `min-h-[44px] min-w-[44px] border px-3 text-[13px] ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong hover:border-ink'}`;

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-testid="filter-panel">
      <div aria-hidden className="absolute inset-0 bg-[rgba(17,17,17,0.3)]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filters-title"
        className="glass-light absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col bg-[rgb(var(--ground-rgb)/0.92)] md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[400px]"
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 bg-line-strong md:hidden" />
        <div className="flex items-center justify-between px-5 pt-3 md:pt-5">
          <h2 id="filters-title" className="text-[32px] leading-none">
            Filters
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="-mr-2 flex h-11 w-11 items-center justify-center"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          <Section title="Size">
            <div className="flex flex-wrap gap-2">
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={draft.size.includes(s)}
                  aria-label={`Size ${s}`}
                  className={square(draft.size.includes(s))}
                  onClick={() => setDraft({ ...draft, size: toggle(draft.size, s) })}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Availability">
            <div className="flex flex-wrap gap-2">
              {AVAILABILITY.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  aria-pressed={draft.avail.includes(a.value)}
                  className={square(draft.avail.includes(a.value))}
                  onClick={() => setDraft({ ...draft, avail: toggle(draft.avail, a.value) })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Max price">
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={PRICE.min}
                max={PRICE.max}
                step={PRICE.step}
                value={draft.max ?? PRICE.max}
                aria-label="Max price"
                aria-valuetext={draft.max === null ? 'Any price' : `Up to A$${draft.max}`}
                data-testid="max-price"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDraft({ ...draft, max: v >= PRICE.max ? null : v });
                }}
                className="h-11 flex-1 accent-[#111111]"
              />
              <output className="w-20 text-right text-[13px]" aria-live="polite">
                {draft.max === null ? 'Any' : `A$${draft.max}`}
              </output>
            </div>
          </Section>
          <Section title="Colour">
            <div className="flex flex-wrap gap-3">
              {COLOURS.map((c) => {
                const on = draft.colour.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={on}
                    aria-label={c.label}
                    title={c.label}
                    onClick={() => setDraft({ ...draft, colour: toggle(draft.colour, c.value) })}
                    className={`flex h-11 w-11 items-center justify-center rounded-circle ${on ? 'ring-2 ring-ink' : ''}`}
                  >
                    <span
                      aria-hidden
                      className="h-8 w-8 rounded-circle border border-line-strong"
                      style={{ background: c.hex }}
                    />
                  </button>
                );
              })}
            </div>
          </Section>
          <Section title="Sort">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sort">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.sort === s.value}
                  className={square(draft.sort === s.value)}
                  onClick={() => setDraft({ ...draft, sort: s.value })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Section>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-line px-5 py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setDraft(clearFilters(draft))}
            className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[5px]"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            data-testid="show-pieces"
            className="glass-dark min-h-[52px] flex-1 px-5 text-[11px] uppercase tracking-label"
          >
            {count === null ? 'Show pieces' : `Show ${count} ${count === 1 ? 'piece' : 'pieces'}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
