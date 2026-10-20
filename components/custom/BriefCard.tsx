'use client';

import { briefRows, type Brief } from '@/lib/custom/brief';
import { Cap } from './ui';

/** Desktop: the sticky "Your brief" card that fills in as the buyer goes. */
export function BriefCard({ brief, today }: { brief: Brief; today: Date }) {
  const photos = brief.inspiration.slice(0, 3);
  return (
    <aside
      className="sticky top-[120px] hidden flex-col gap-3.5 border border-line bg-surface px-6 py-[22px] md:flex"
      aria-label="Your brief"
      data-testid="brief-card"
    >
      <Cap>Your brief</Cap>
      {photos.length > 0 && (
        <div className="flex gap-1">
          {photos.map((src) => (
            <span key={src} className="relative aspect-4/5 flex-1 overflow-hidden bg-[#D2CBC1]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
              />
            </span>
          ))}
        </div>
      )}
      <dl className="grid grid-cols-[80px_1fr] gap-x-2.5 gap-y-2 text-[13px]">
        {briefRows(brief, today).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-2">{k}</dt>
            <dd className="m-0">{v}</dd>
          </div>
        ))}
      </dl>
      <span className="border-t border-line pt-3 text-[11px] text-muted-2">
        Free to send. You only pay if you accept a quote.
      </span>
    </aside>
  );
}
