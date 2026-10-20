'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { setPieceLiveAction } from '@/lib/actions/studio-listings';
import { formatPrice } from '@/lib/domain/money';
import { showToast } from '@/lib/studio/toast';
import type { ListingCard as Card } from '@/lib/services/studio-listings';
import { Img as Image } from '@/components/ui/Img';
import { StockStepper } from './StockStepper';
import { Switch } from './Switch';

const TYPE: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

/** One piece on the Listings grid: stats, stock by size, Live/Hidden, Preview and Edit. */
export function ListingCard({ piece }: { piece: Card }) {
  const [live, setLive] = useState(piece.status === 'approved');
  const [, start] = useTransition();
  const isDraft = piece.status === 'draft' || piece.status === 'pending';
  const hidden = !live;
  return (
    <article
      className={`flex flex-col border border-line bg-surface ${hidden ? 'opacity-70' : ''}`}
      data-testid="listing-card"
      data-status={live ? 'live' : isDraft ? 'draft' : 'hidden'}
    >
      <div className="relative aspect-4/5 overflow-hidden bg-stone">
        {piece.imageUrl && (
          <Image
            src={piece.imageUrl}
            alt=""
            fill
            sizes="(min-width: 768px) 30vw, 50vw"
            className="object-cover object-top"
          />
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          <span className="bg-ground px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]">
            {TYPE[piece.productType]}
          </span>
          {piece.listedByAdmin && (
            <span className="bg-ink px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-ground">
              Set up by Off One
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-sans text-[14px] font-normal leading-snug">{piece.title}</h2>
          <span className="shrink-0 text-[13px] tabular-nums">{formatPrice(piece.priceCents)}</span>
        </div>
        <p className="mt-0.5 text-[12px] text-muted-2">
          {piece.views} views · {piece.saves} saves · {piece.sold} sold
        </p>
        {piece.productType === 'ready_to_ship' ? (
          <ul className="mt-3 space-y-1" role="list">
            {piece.variants.map((v) => (
              <li key={v.id} className="flex items-center justify-between text-[12px]">
                <span>Size {v.size}</span>
                <StockStepper
                  variantId={v.id}
                  stock={v.stock}
                  label={`${piece.title} size ${v.size}`}
                  compact
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[12px] text-muted">
            {piece.variants
              .filter((v) => v.active)
              .map((v) => v.size)
              .join(' · ') || 'No sizes offered'}
          </p>
        )}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
          {isDraft ? (
            <span className="text-[11px] uppercase tracking-label text-muted-2">Draft</span>
          ) : (
            <label className="flex items-center gap-1 text-[11px] uppercase tracking-label">
              <Switch
                checked={live}
                label={`${piece.title} live`}
                testId="live-switch"
                onChange={(next) => {
                  setLive(next);
                  start(async () => {
                    const res = await setPieceLiveAction(piece.id, next);
                    if (!res?.ok) {
                      setLive(!next);
                      showToast(res?.message ?? 'Couldn’t change that.');
                    } else
                      showToast(next ? `${piece.title} is live.` : `${piece.title} is hidden.`);
                  });
                }}
              />
              {live ? 'Live' : 'Hidden'}
            </label>
          )}
          <span className="flex gap-3 text-[11px] uppercase tracking-label">
            <Link
              href={`/studio/listings?preview=${piece.id}`}
              scroll={false}
              className="flex min-h-[44px] items-center underline underline-offset-[5px]"
            >
              Preview
            </Link>
            <Link
              href={`/studio/listings/${piece.id}`}
              className="flex min-h-[44px] items-center underline underline-offset-[5px]"
            >
              Edit
            </Link>
          </span>
        </div>
      </div>
    </article>
  );
}
