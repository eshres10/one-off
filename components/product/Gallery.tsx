'use client';

import { useRef, useState } from 'react';
import { Img as Image } from '@/components/ui/Img';

/**
 * Desktop: thumbnail rail + main image (a fixed height from 1024px, so the whole photo shows while
 * the column is pinned). Phone: a full-height swipe carousel with dash indicators and a counter,
 * kept 42px off the bottom so the overlapping content card doesn't hide them.
 */
export function Gallery({
  images,
  title,
  overlay,
}: {
  images: Array<{ id: string; url: string; alt: string }>;
  title: string;
  overlay?: React.ReactNode;
}) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const slots = images.length
    ? images
    : [{ id: 'none', url: '', alt: `${title} — photo coming soon` }];

  const goTo = (i: number) => {
    setActive(i);
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="max-md:h-full md:grid md:grid-cols-[84px_1fr] md:gap-[2px]">
      <div
        className="no-scrollbar hidden md:flex md:flex-col md:gap-[2px] lg:max-h-[min(720px,calc(100vh-80px))] lg:overflow-y-auto"
        role="tablist"
        aria-label="Product photos"
      >
        {slots.map((img, i) => (
          <button
            key={img.id}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Show photo ${i + 1} of ${slots.length}`}
            onClick={() => goTo(i)}
            className={`relative aspect-4/5 shrink-0 overflow-hidden bg-stone-light ${i === active ? 'outline outline-1 -outline-offset-1 outline-ink' : 'opacity-80 hover:opacity-100'}`}
          >
            {img.url && (
              <Image src={img.url} alt="" fill sizes="84px" className="object-cover object-top" />
            )}
          </button>
        ))}
      </div>
      <div className="relative max-md:h-full">
        <div
          ref={track}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto max-md:h-full"
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
              className="relative w-full shrink-0 snap-start bg-stone-light max-md:h-full md:aspect-4/5 lg:aspect-auto lg:h-[min(720px,calc(100vh-80px))]"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slots.length}`}
            >
              {img.url ? (
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 768px) 55vw, 100vw"
                  className="object-cover object-top"
                />
              ) : (
                <div className="skeleton h-full w-full" />
              )}
            </div>
          ))}
        </div>
        {overlay}
        {slots.length > 1 && (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 bottom-[42px] flex justify-center gap-1.5 md:hidden"
              aria-hidden
            >
              {slots.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-[2px] w-4 ${i === active ? 'bg-ground' : 'bg-ground/45'}`}
                />
              ))}
            </div>
            <span
              className="glass-chip pointer-events-none absolute bottom-[34px] right-3 px-2 py-0.5 text-[11px] tabular-nums md:hidden"
              data-testid="photo-counter"
            >
              {active + 1}/{slots.length}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
