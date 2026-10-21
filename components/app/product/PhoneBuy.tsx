'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatPrice } from '@/lib/domain/money';
import type { SavedFit } from '@/components/product/CustomMeasurements';
import { ChevronIcon } from '@/components/ui/icons';
import { SizeSheet, type SheetVariant } from './SizeSheet';

/**
 * The size row in the page and the sticky bar at the bottom share one size sheet: "Add to bag"
 * without a size opens it, and adding from the sheet closes it with a toast.
 */
export function PhoneBuy({
  productId,
  productType,
  priceCents,
  variants,
  colours,
  savedFit,
  canBuy,
  disabledLabel,
  askHref,
  soldOut,
}: {
  productId: string;
  productType: 'ready_to_ship' | 'made_to_order' | 'one_of_one';
  priceCents: number;
  variants: SheetVariant[];
  colours: string[];
  savedFit: SavedFit | null;
  canBuy: boolean;
  disabledLabel: string;
  askHref: string;
  soldOut: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sizes = variants
    .filter((v) => v.stockQuantity > 0 || productType === 'made_to_order')
    .map((v) => v.size.replace(/^AU\s*/i, ''));
  const sizeLine = soldOut
    ? 'Sold out'
    : productType === 'one_of_one'
      ? `One size · AU ${sizes[0] ?? '—'}`
      : sizes.length
        ? `AU ${sizes.slice(0, 6).join(' · ')}`
        : 'See sizes';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="size-row"
        className="flex min-h-[56px] w-full items-center justify-between rounded-app border border-line bg-surface px-4 text-left"
      >
        <span>
          <span className="block text-[11px] uppercase tracking-label text-muted-2">Size</span>
          <span className="block text-[15px]">{sizeLine}</span>
        </span>
        <ChevronIcon width={16} height={16} />
      </button>
      <div
        className="glass-nav fixed inset-x-0 bottom-0 z-40 flex gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden"
        data-testid="buy-bar"
      >
        <Link
          href={askHref}
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-app border border-ink text-[12px] uppercase tracking-[0.14em]"
          data-testid="ask-the-maker"
        >
          Ask the maker
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!canBuy && !soldOut}
          data-testid="add-to-bag"
          className="flex min-h-[52px] flex-[1.4] items-center justify-center rounded-app bg-ink text-[12px] uppercase tracking-[0.14em] text-ground disabled:opacity-60"
        >
          {!canBuy
            ? disabledLabel
            : soldOut
              ? 'Sold out'
              : `Add to bag · ${formatPrice(priceCents)}`}
        </button>
      </div>
      <SizeSheet
        open={open}
        onOpenChange={setOpen}
        productId={productId}
        productType={productType}
        priceCents={priceCents}
        variants={variants}
        colours={colours}
        savedFit={savedFit}
        canBuy={canBuy && !soldOut}
        disabledLabel={soldOut ? 'Sold out' : disabledLabel}
      />
    </>
  );
}
