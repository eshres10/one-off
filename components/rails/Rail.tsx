'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronIcon } from '@/components/ui/icons';

/**
 * Horizontal carousel: serif heading, optional subtitle, "View all" and (desktop) arrow buttons
 * that page the track by 80% of its width. Scroll-snaps per item; works with trackpad, touch,
 * and arrow keys on the focused track.
 */
export function Rail({
  title,
  subtitle,
  viewAllHref,
  label,
  gapClass = 'gap-[2px]',
  children,
  testId,
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  /** aria-label for the list; defaults to the title. */
  label?: string;
  gapClass?: string;
  children: ReactNode;
  testId?: string;
}) {
  const track = useRef<HTMLUListElement>(null);
  const headingId = useId();
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const update = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 2);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const el = track.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [update]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  const arrow =
    'flex h-11 w-11 items-center justify-center border border-ink transition-opacity disabled:cursor-default disabled:opacity-40';

  return (
    <section aria-labelledby={headingId} className="py-10 md:py-14" data-testid={testId}>
      <div className="flex items-end justify-between gap-4 px-3 md:px-[var(--gutter)]">
        <div className="min-w-0">
          <h2 id={headingId} className="text-[32px] leading-none md:text-[clamp(40px,4.4vw,56px)]">
            {title}
          </h2>
          {subtitle && <p className="mt-2 max-w-2xl text-[14px] text-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-4">
          {viewAllHref && (
            <Link
              href={viewAllHref}
              className="flex min-h-[44px] items-center text-[11px] uppercase tracking-label underline underline-offset-[6px]"
            >
              View all
              <span className="sr-only"> {title}</span>
            </Link>
          )}
          <div className="hidden gap-2 md:flex">
            <button
              type="button"
              className={arrow}
              aria-label={`Scroll ${title} back`}
              disabled={atStart}
              onClick={() => page(-1)}
              data-testid="rail-prev"
            >
              <ChevronIcon dir="left" width={18} height={18} />
            </button>
            <button
              type="button"
              className={arrow}
              aria-label={`Scroll ${title} forward`}
              disabled={atEnd}
              onClick={() => page(1)}
              data-testid="rail-next"
            >
              <ChevronIcon width={18} height={18} />
            </button>
          </div>
        </div>
      </div>
      <ul
        ref={track}
        role="list"
        aria-label={label ?? title}
        tabIndex={0}
        data-testid="rail-track"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            track.current?.scrollBy({
              left: (e.key === 'ArrowRight' ? 1 : -1) * track.current.clientWidth * 0.8,
              behavior: 'smooth',
            });
          }
        }}
        className={`no-scrollbar mt-6 flex snap-x snap-mandatory scroll-px-3 overflow-x-auto px-3 md:scroll-px-[var(--gutter)] md:px-[var(--gutter)] ${gapClass}`}
      >
        {children}
      </ul>
    </section>
  );
}

/** A rail item: snaps to the start edge. */
export function RailItem({
  className = '',
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <li role="listitem" className={`shrink-0 snap-start ${className}`}>
      {children}
    </li>
  );
}
