'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, MenuIcon } from '@/components/ui/icons';
import { Wordmark } from '@/components/ui/Wordmark';

export function MobileMenu({ links }: { links: Array<{ href: string; label: string }> }) {
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
            <nav aria-label="Menu" className="bleed mt-6 flex flex-col">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="border-b border-line py-4 font-display text-[34px] leading-none"
                >
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
