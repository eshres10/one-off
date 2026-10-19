'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface MagneticTab {
  id: string;
  label: string;
}

const EASE = 'cubic-bezier(.22,1,.36,1)';

/**
 * Serif tabs with a "magnetic" letter wave: on hover, the letters nearest the cursor lift (up to
 * ~9.5px) with a Gaussian falloff and settle back when the mouse leaves. Movement is written
 * straight to the letters' styles in a requestAnimationFrame, so moving the mouse never
 * re-renders React; only the hovered tab (colour and underline) is state. Fine pointers only;
 * nothing moves with reduced motion. Arrow keys / Home / End move focus, Enter or Space selects.
 */
export function MagneticTabs({
  tabs,
  active,
  onSelect,
  label,
}: {
  tabs: MagneticTab[];
  active: string;
  onSelect: (id: string) => void;
  /** Accessible name for the tab list. */
  label: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [canHover, setCanHover] = useState(false);
  const [still, setStill] = useState(false);
  const letters = useRef<Record<string, Array<HTMLSpanElement | null>>>({});
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});
  const pointer = useRef<{ id: string; mx: number } | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => {
      setCanHover(fine.matches);
      setStill(reduce.matches);
    };
    read();
    fine.addEventListener('change', read);
    reduce.addEventListener('change', read);
    return () => {
      fine.removeEventListener('change', read);
      reduce.removeEventListener('change', read);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const paint = useCallback(() => {
    frame.current = 0;
    const p = pointer.current;
    if (!p) return;
    const spans = letters.current[p.id] ?? [];
    const n = spans.length;
    spans.forEach((el, i) => {
      if (!el) return;
      const d = (p.mx - (i + 0.5) / n) * n; // distance from the cursor, in letters
      const pull = Math.exp(-(d * d) / 8); // 1 under the cursor, falling off either side
      const ty = -(1.5 + 8 * pull);
      el.style.transform = `translate3d(0, ${ty.toFixed(2)}px, 0)`;
    });
  }, []);

  const settle = (id: string) => {
    for (const el of letters.current[id] ?? []) if (el) el.style.transform = 'translate3d(0,0,0)';
  };

  const wave = canHover && !still;

  const onMove = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    if (!canHover) return;
    if (hovered !== id) setHovered(id);
    if (!wave) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pointer.current = { id, mx: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) };
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  };

  const onLeave = (id: string) => {
    if (pointer.current?.id === id) pointer.current = null;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    settle(id);
    setHovered((h) => (h === id ? null : h));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const to =
      e.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (to === null) return;
    e.preventDefault();
    buttons.current[tabs[to]!.id]?.focus();
  };

  const transition = (props: string) => (still ? 'none' : props);

  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 md:gap-x-9"
      style={{ marginBottom: 22 }}
      data-testid="magnetic-tabs"
    >
      {tabs.map((t, index) => {
        const isActive = t.id === active;
        const lit = isActive || hovered === t.id || focused === t.id;
        const underline = isActive ? '100%' : hovered === t.id || focused === t.id ? '40%' : '0%';
        return (
          <button
            key={t.id}
            ref={(el) => {
              buttons.current[t.id] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-label={t.label}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(t.id)}
            onMouseMove={(e) => onMove(t.id, e)}
            onMouseLeave={() => onLeave(t.id)}
            onFocus={() => setFocused(t.id)}
            onBlur={() => setFocused((f) => (f === t.id ? null : f))}
            onKeyDown={(e) => onKeyDown(e, index)}
            className="relative min-h-[44px] border-0 bg-transparent px-1 py-1.5 font-display text-[22px] leading-[1.1] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ink md:text-[30px]"
            style={{
              color: lit ? '#111111' : '#8A857E',
              transition: transition(`color 400ms ${EASE}`),
            }}
            data-testid={`feed-tab-${t.id}`}
          >
            <span aria-hidden className="inline-block">
              {Array.from(t.label).map((ch, i) => (
                <span
                  key={i}
                  ref={(el) => {
                    (letters.current[t.id] ??= [])[i] = el;
                  }}
                  className="inline-block whitespace-pre"
                  style={
                    wave
                      ? {
                          transition: `transform 650ms ${EASE}`,
                          willChange: 'transform',
                        }
                      : undefined
                  }
                >
                  {ch}
                </span>
              ))}
            </span>
            <span
              aria-hidden
              className="absolute left-1/2 h-px -translate-x-1/2 bg-current"
              style={{
                bottom: 0,
                width: underline,
                transition: transition(`width 650ms ${EASE}`),
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
