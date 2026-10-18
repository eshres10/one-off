'use client';

import { Img as Image } from '@/components/ui/Img';
import { useRef, useState } from 'react';

export function Gallery({
  images,
  title,
}: {
  images: Array<{ id: string; url: string; alt: string }>;
  title: string;
}) {
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const slots = images.length
    ? images
    : [{ id: 'none', url: '', alt: `${title} — photo coming soon` }];

  const goTo = (i: number) => {
    setActive(i);
    const el = track.current?.children[i] as HTMLElement | undefined;
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  return (
    <div className="lg:grid lg:grid-cols-[72px_1fr] lg:gap-4">
      {/* Desktop thumbnails */}
      <div
        className="hidden lg:flex lg:flex-col lg:gap-3"
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
            className={`relative aspect-4/5 overflow-hidden rounded-lg border-2 ${i === active ? 'border-ink' : 'border-transparent opacity-80 hover:opacity-100'}`}
          >
            {img.url && <Image src={img.url} alt="" fill sizes="72px" className="object-cover" />}
          </button>
        ))}
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <div
          ref={track}
          className="no-scrollbar flex snap-x snap-mandatory overflow-x-auto sm:rounded-2xl"
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
              className="relative aspect-4/5 w-full shrink-0 snap-start bg-stone-light"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${slots.length}`}
            >
              {img.url ? (
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  priority={i === 0}
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover"
                />
              ) : (
                <div className="skeleton h-full w-full" />
              )}
            </div>
          ))}
        </div>
        {slots.length > 1 && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5 lg:hidden"
            aria-hidden
          >
            {slots.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-ink' : 'w-1.5 bg-ink/30'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
