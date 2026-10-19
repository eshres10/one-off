'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { MegaPanel } from '@/lib/nav/mega';
import { ChevronIcon, CloseIcon, MenuIcon } from '@/components/ui/icons';
import { Wordmark } from '@/components/ui/Wordmark';

export function MobileMenu({
  links,
  groups = [],
}: {
  links: Array<{ href: string; label: string }>;
  /** Mega-menu groups, shown as accordions in place of the matching link. */
  groups?: MegaPanel[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 items-center justify-center"
      >
        <MenuIcon />
      </button>
      {/* Portalled to <body>: the glass header's backdrop-filter would otherwise trap a
          fixed overlay inside the header's own box. */}
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="glass-light fixed inset-0 z-[60] flex flex-col bg-[rgba(246,244,240,0.92)]"
          >
            <div className="bleed flex h-[60px] items-center justify-between">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center"
              >
                <CloseIcon />
              </button>
              <Wordmark size="mobile" />
              <span className="w-11" />
            </div>
            <nav aria-label="Menu" className="bleed mt-6 flex flex-col overflow-y-auto pb-10">
              {links.map((l) => {
                const group = groups.find((g) => g.label === l.label);
                if (!group)
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className="border-b border-line py-4 font-display text-[34px] leading-none"
                    >
                      {l.label}
                    </Link>
                  );
                return (
                  <details key={l.href} className="group border-b border-line">
                    <summary className="flex cursor-pointer list-none items-center justify-between py-4 font-display text-[34px] leading-none [&::-webkit-details-marker]:hidden">
                      {l.label}
                      <ChevronIcon
                        dir="down"
                        width={18}
                        height={18}
                        className="transition-transform group-open:rotate-180"
                      />
                    </summary>
                    <div className="space-y-5 pb-5">
                      {group.columns.map((col) => (
                        <div key={col.title}>
                          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-2">
                            {col.title}
                          </p>
                          <ul className="mt-2 space-y-1" role="list">
                            {(col.links ?? []).map((link) => (
                              <li key={link.href + link.label}>
                                <Link href={link.href} className="block py-1.5 text-[16px]">
                                  {link.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                );
              })}
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
