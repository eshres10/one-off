'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { popScreen } from '@/lib/app/nav';
import { Img as Image } from '@/components/ui/Img';
import { ChevronIcon, HeartIcon, ShareIcon } from '@/components/ui/icons';
import { Heart, buzz } from '../Heart';
import { ShareSheet } from '../ShareSheet';

/** Asks the page's hearts for this product to turn on (a double-tapped photo). */
export const LIKE_EVENT = 'oo:like';

/**
 * Full-width photos with scroll-snap and dots, glass back / share / heart over the top, and a
 * double-tap that likes the piece with a big heart. A tap opens the photo in the lightbox
 * (the existing gallery's full-screen slide), so pinch-zoom works where the browser has it.
 */
export function PhoneGallery({
  images,
  title,
  productId,
  saved,
  slug,
}: {
  images: Array<{ id: string; url: string; alt: string }>;
  title: string;
  productId: string;
  saved: boolean;
  slug: string;
}) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [burst, setBurst] = useState(0);
  const [share, setShare] = useState(false);
  const lastTap = useRef(0);
  const slots = images.length ? images : [{ id: 'none', url: '', alt: '' }];

  const onTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      lastTap.current = 0;
      setBurst((n) => n + 1);
      buzz();
      window.dispatchEvent(new CustomEvent(LIKE_EVENT, { detail: productId }));
    } else lastTap.current = now;
  };

  return (
    <div className="relative bg-stone" data-testid="phone-gallery">
      <div
        className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== active) setActive(i);
        }}
        aria-roledescription="carousel"
        aria-label={`${title} photos`}
      >
        {slots.map((img, i) => (
          <div
            key={img.id}
            className="relative aspect-[4/5] w-full shrink-0 snap-start"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${slots.length}`}
            onClick={onTap}
          >
            {img.url ? (
              <Image
                src={img.url}
                alt={img.alt}
                fill
                priority={i === 0}
                sizes="100vw"
                className="object-cover object-top"
              />
            ) : (
              <div className="skeleton-shimmer h-full w-full" />
            )}
          </div>
        ))}
      </div>
      {burst > 0 && (
        <span
          key={burst}
          aria-hidden
          className="heart-burst pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-ground drop-shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
        >
          <HeartIcon filled width={96} height={96} />
        </span>
      )}
      {slots.length > 1 && (
        <div
          className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5"
          aria-hidden
        >
          {slots.map((s, i) => (
            <span
              key={s.id}
              className={`h-1.5 w-1.5 rounded-circle ${i === active ? 'bg-ground' : 'bg-ground/45'}`}
            />
          ))}
        </div>
      )}
      <div className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+12px)] flex items-center justify-between">
        <button
          type="button"
          onClick={() => popScreen(router, '/')}
          aria-label="Back"
          data-testid="product-back"
          className="glass-chip flex h-11 w-11 items-center justify-center rounded-circle"
        >
          <ChevronIcon dir="left" width={18} height={18} />
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShare(true)}
            aria-label={`Share ${title}`}
            data-testid="product-share"
            className="glass-chip flex h-11 w-11 items-center justify-center rounded-circle"
          >
            <ShareIcon width={16} height={16} />
          </button>
          <Heart productId={productId} saved={saved} title={title} glass size={18} />
        </div>
      </div>
      <ShareSheet open={share} onOpenChange={setShare} title={title} path={`/products/${slug}`} />
    </div>
  );
}
