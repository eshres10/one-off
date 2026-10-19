'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { MegaKey, MegaPanel } from '@/lib/nav/mega';
import { PRIMARY_NAV, currentNavKey, navLinkClass } from '@/lib/nav/primary';
import { Img as Image } from '@/components/ui/Img';
import { useHeaderMenu } from './HeaderFrame';

const OPEN_DELAY = 120;
const CLOSE_DELAY = 200;

const focusables = (root: HTMLElement | null) =>
  root ? Array.from(root.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')) : [];

/**
 * Desktop mega menu (≥1024px): disclosure buttons for New in, Occasions and Makers that open a
 * full-width glass panel under the header, plus plain links for Discover and Pop-ups. Hover has
 * intent delays; switching between triggers swaps the panel in place. Esc, a click outside, the
 * backdrop, leaving the header and panel, or navigating closes it.
 */
export function MegaMenu({ panels }: { panels: MegaPanel[] }) {
  const { setOpen: setHeaderOpen } = useHeaderMenu();
  const [active, setActive] = useState<MegaKey | null>(null);
  const [mounted, setMounted] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout>>();
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const openedAt = useRef(0);
  const suppressFocusOpen = useRef(false);
  const root = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggers = useRef<Partial<Record<MegaKey, HTMLButtonElement | null>>>({});
  const panelId = useId();

  const pathname = usePathname() ?? '/';
  const params = useSearchParams();
  const current = currentNavKey(pathname, params?.get('sort') ?? null, params?.get('cat') ?? null);

  useEffect(() => setMounted(true), []);
  useEffect(() => setHeaderOpen(active !== null), [active, setHeaderOpen]);
  // Navigating anywhere closes the menu.
  useEffect(() => setActive(null), [pathname, params]);

  const clearTimers = () => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
  };

  const show = useCallback((key: MegaKey) => {
    clearTimeout(closeTimer.current);
    setActive((prev) => {
      if (prev !== key) openedAt.current = Date.now();
      return key;
    });
  }, []);

  const close = useCallback((refocus = false) => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    setActive((prev) => {
      if (refocus && prev) {
        suppressFocusOpen.current = true;
        triggers.current[prev]?.focus();
        suppressFocusOpen.current = false;
      }
      return null;
    });
  }, []);

  const hoverOpen = (key: MegaKey) => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    // Already open: swap content straight away rather than closing and reopening.
    if (active) show(key);
    else openTimer.current = setTimeout(() => show(key), OPEN_DELAY);
  };

  const scheduleClose = useCallback(() => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setActive(null), CLOSE_DELAY);
  }, []);
  const cancelClose = useCallback(() => clearTimeout(closeTimer.current), []);

  // Leaving both the header and the panel closes it.
  useEffect(() => {
    const header = root.current?.closest('header');
    if (!header) return;
    header.addEventListener('mouseenter', cancelClose);
    header.addEventListener('mouseleave', scheduleClose);
    return () => {
      header.removeEventListener('mouseenter', cancelClose);
      header.removeEventListener('mouseleave', scheduleClose);
    };
  }, [cancelClose, scheduleClose]);

  // Esc and clicks outside.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') close(true);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      const header = root.current?.closest('header');
      if (header?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [active, close]);

  useEffect(() => clearTimers, []);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>, key: MegaKey) => {
    // Tab from an open trigger moves into its panel (the panel lives at the end of <body>).
    if (e.key === 'Tab' && !e.shiftKey && active === key) {
      const first = focusables(panelRef.current)[0];
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
    if (e.key === 'ArrowDown' && active === key) {
      e.preventDefault();
      focusables(panelRef.current)[0]?.focus();
    }
  };

  const onPanelKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = focusables(panelRef.current);
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Tab') {
      if (e.shiftKey && i === 0) {
        e.preventDefault();
        if (active) triggers.current[active]?.focus();
      } else if (!e.shiftKey && i === items.length - 1) {
        // Leave the panel to whatever follows the trigger in the header.
        e.preventDefault();
        const trigger = active ? triggers.current[active] : null;
        const header = focusables(root.current?.closest('header') ?? null);
        const next = trigger ? header[header.indexOf(trigger) + 1] : null;
        close();
        next?.focus();
      }
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      // Move between columns (and the tiles).
      const groups = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('[data-mega-col]') ?? [],
      );
      const g = groups.findIndex((col) => col.contains(document.activeElement));
      const target =
        groups[(g + (e.key === 'ArrowRight' ? 1 : -1) + groups.length) % groups.length];
      const link = target?.querySelector<HTMLElement>('a[href]');
      if (link) {
        e.preventDefault();
        link.focus();
      }
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const col = (document.activeElement as HTMLElement | null)?.closest('[data-mega-col]');
      const links = col ? Array.from(col.querySelectorAll<HTMLElement>('a[href]')) : [];
      const j = links.indexOf(document.activeElement as HTMLElement);
      const next = links[j + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  };

  const panel = panels.find((p) => p.key === active);

  return (
    <div ref={root} className="flex items-center gap-7" data-testid="mega-menu">
      {PRIMARY_NAV.map((n) => {
        const mega = panels.find((p) => p.key === n.key);
        const isCurrent = current === n.key;
        if (!mega)
          return (
            <Link
              key={n.key}
              href={n.href}
              aria-current={isCurrent ? 'page' : undefined}
              className={navLinkClass(isCurrent)}
              onMouseEnter={() => active && scheduleClose()}
              onFocus={() => active && close()}
            >
              {n.label}
            </Link>
          );
        const open = active === mega.key;
        return (
          <button
            key={n.key}
            ref={(el) => {
              triggers.current[mega.key] = el;
            }}
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-current={isCurrent ? 'page' : undefined}
            data-testid={`mega-trigger-${mega.key}`}
            className={`${navLinkClass(isCurrent || open)} min-h-[44px]`}
            onMouseEnter={() => hoverOpen(mega.key)}
            onFocus={() => {
              if (!suppressFocusOpen.current && active !== mega.key) show(mega.key);
            }}
            onClick={() => {
              // A click right after hover-open keeps it open; otherwise it toggles.
              if (open && Date.now() - openedAt.current > 300) close();
              else show(mega.key);
            }}
            onKeyDown={(e) => onTriggerKey(e, mega.key)}
          >
            {n.label}
          </button>
        );
      })}

      {mounted &&
        panel &&
        createPortal(
          <>
            <div
              aria-hidden
              data-testid="mega-backdrop"
              className="fixed inset-x-0 bottom-0 top-[var(--header-h)] z-40 bg-[rgba(17,17,17,0.12)]"
              onMouseDown={() => close()}
            />
            <div
              ref={panelRef}
              id={panelId}
              role="region"
              aria-label={panel.label}
              data-testid="mega-panel"
              className="glass-nav mega-panel fixed inset-x-0 top-[var(--header-h)] z-[45]"
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              onKeyDown={onPanelKey}
            >
              <div
                key={panel.key}
                className="container-page relative grid grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,0.9fr)_minmax(0,0.9fr)] gap-8 py-10"
              >
                {panel.columns.map((col) => (
                  <div key={col.title} data-mega-col>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted-2">
                      {col.title}
                    </p>
                    <ul className="mt-4 space-y-2" role="list">
                      {(col.links ?? []).map((l) => (
                        <li key={l.href + l.label}>
                          <Link
                            href={l.href}
                            className="font-display text-[22px] leading-tight text-ink underline-offset-[5px] hover:underline"
                          >
                            {l.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {panel.tiles.map((t) => (
                  <div key={t.title} data-mega-col>
                    <Link
                      href={t.href}
                      className="group relative block aspect-4/5 overflow-hidden bg-stone-light text-ground"
                    >
                      <Image
                        src={t.image}
                        alt=""
                        fill
                        sizes="240px"
                        className="object-cover transition duration-[600ms] group-hover:scale-[1.03]"
                      />
                      <span
                        aria-hidden
                        className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent"
                      />
                      <span className="absolute inset-x-0 bottom-0 p-4">
                        <span className="block font-display text-[24px] leading-[1.05]">
                          {t.title}
                        </span>
                        <span className="mt-2 block text-[10px] uppercase tracking-label">
                          {t.cta} →
                        </span>
                      </span>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
