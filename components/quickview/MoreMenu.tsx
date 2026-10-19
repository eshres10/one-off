'use client';

import { useEffect, useRef, useState } from 'react';
import { BRAND } from '@/lib/brand';
import { MoreIcon } from '@/components/ui/icons';

/** "⋯" menu beside the maker: Share, Report. */
export function MoreMenu({ title, slug }: { title: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);

  const link = () => `${window.location.origin}/products/${slug}`;
  const item = 'block min-h-[44px] w-full px-4 text-left text-[13px] hover:bg-stone-light';
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More options"
        onClick={() => setOpen((o) => !o)}
        className="flex h-11 w-11 items-center justify-center"
      >
        <MoreIcon width={18} height={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 w-44 border border-line bg-ground py-1 shadow-[0_8px_24px_rgba(17,17,17,0.12)]"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={async () => {
              try {
                if (navigator.share) await navigator.share({ title, url: link() });
                else {
                  await navigator.clipboard.writeText(link());
                  setNote('Link copied');
                }
              } catch {
                // Dismissed.
              }
              setOpen(false);
            }}
          >
            Share
          </button>
          <a
            role="menuitem"
            className={`${item} flex items-center`}
            href={`mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(`Report: ${title}`)}&body=${encodeURIComponent(`I'd like to report this listing: /products/${slug}\n\nWhat's wrong:\n`)}`}
          >
            Report
          </a>
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {note}
      </span>
    </div>
  );
}
