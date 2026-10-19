'use client';

import { useState } from 'react';
import { Img as Image } from '@/components/ui/Img';
import { ChevronIcon } from '@/components/ui/icons';

/**
 * Quick view gallery: one image at a time (the rest load only when shown), glass arrows, a
 * "1 / 3" counter and a thumbnail strip. ←/→ move between images while the gallery has focus.
 */
export function QuickGallery({
  images,
  title,
}: {
  images: Array<{ id: string; url: string; alt: string }>;
  title: string;
}) {
  const [i, setI] = useState(0);
  const n = images.length;
  const go = (d: number) => n > 1 && setI((x) => (x + d + n) % n);
  const img = images[i];

  return (
    <div
      className="relative h-full bg-stone-light outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
      tabIndex={0}
      data-qv-gallery
      aria-roledescription="carousel"
      aria-label={`${title} photos. Use the left and right arrow keys to change photo.`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault();
          e.stopPropagation();
          go(e.key === 'ArrowRight' ? 1 : -1);
        }
      }}
    >
      {img ? (
        <Image
          key={img.id}
          src={img.url}
          alt={img.alt || title}
          fill
          priority={i === 0}
          sizes="(min-width: 1024px) 600px, 55vw"
          className="object-cover object-top"
        />
      ) : (
        <div className="skeleton h-full w-full" />
      )}
      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label="Previous photo"
            className="glass-chip absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center"
          >
            <ChevronIcon dir="left" width={16} height={16} />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label="Next photo"
            className="glass-chip absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center"
          >
            <ChevronIcon width={16} height={16} />
          </button>
          <p
            className="glass-chip absolute right-3 top-3 px-2.5 py-1 text-[11px] tabular-nums"
            aria-live="polite"
            data-testid="qv-counter"
          >
            {i + 1} / {n}
          </p>
          <div className="absolute inset-x-0 bottom-0 flex gap-[2px] bg-gradient-to-t from-black/25 to-transparent p-3 pt-8">
            {images.map((t, k) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setI(k)}
                aria-label={`Show photo ${k + 1} of ${n}`}
                aria-current={k === i ? 'true' : undefined}
                className={`relative h-[72px] w-[58px] overflow-hidden bg-stone-light ${k === i ? 'outline outline-2 -outline-offset-2 outline-ground' : 'opacity-75 hover:opacity-100'}`}
              >
                <Image src={t.url} alt="" fill sizes="58px" className="object-cover object-top" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
