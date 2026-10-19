'use client';

import { SoldOutSize } from '@/components/product/SoldOutSize';
import { CustomMeasurements, type SavedFit } from '@/components/product/CustomMeasurements';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addToBagAction } from '@/lib/actions/cart';
import { openThreadAction } from '@/lib/actions/messages';
import { formatPrice } from '@/lib/domain/money';
import { swatchColour } from '@/lib/colours';
import type { FormState } from '@/lib/validation';
import { Pill, Swatch } from '@/components/ui/Pill';
import { ChatIcon } from '@/components/ui/icons';

interface Variant {
  id: string;
  size: string;
  colour: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
}

function AddButton({
  disabled,
  label,
  className = '',
  light = false,
}: {
  disabled: boolean;
  label: string;
  className?: string;
  light?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`min-h-[52px] px-6 text-[11px] uppercase tracking-[0.2em] disabled:cursor-not-allowed ${
        light ? 'bg-surface text-ink disabled:text-muted-2' : 'glass-dark disabled:opacity-60'
      } ${className}`}
    >
      {pending ? 'Adding…' : label}
    </button>
  );
}

export function PurchasePanel({
  productId,
  productSlug,
  productType,
  priceCents,
  colours,
  variants,
  askHref,
  requestHref,
  modelLine,
  checkoutEnabled = true,
  previewMessage,
  disabledLabel = 'Launching soon',
  savedSizes = null,
  sizeNotes = null,
  signedIn = false,
  makeToOrder = null,
}: {
  productId: string;
  productSlug: string;
  productType: 'ready_to_ship' | 'made_to_order' | 'one_of_one';
  priceCents: number;
  colours: string[];
  variants: Variant[];
  askHref: string;
  requestHref?: string;
  modelLine?: string | null;
  /** False in preview mode: sizes stay browsable but nothing can be added to the bag. */
  checkoutEnabled?: boolean;
  previewMessage?: string;
  /** Button text when buying is off (e.g. "Away until 12 Jan"). */
  disabledLabel?: string;
  /** The buyer's Sizes & fit: pre-selects their usual size and pre-fills custom measurements. */
  savedSizes?: SavedFit | null;
  /** The maker's own sizing notes, shown above the sizes. */
  sizeNotes?: string | null;
  signedIn?: boolean;
  /** The maker can make a sold-out size to order: who, how long, and where to ask. */
  makeToOrder?: { makerName: string; leadDays: number; href: string } | null;
}) {
  const [colour, setColour] = useState<string | null>(colours[0] ?? null);
  const visible = useMemo(
    () => variants.filter((v) => !colour || colours.length < 2 || v.colour === colour),
    [variants, colour, colours.length],
  );
  const firstAvailable = visible.find((v) => v.stockQuantity > 0);
  const usual = savedSizes?.usualSize
    ? visible.find(
        (v) => v.stockQuantity > 0 && v.size.replace(/^AU\s*/i, '') === savedSizes.usualSize,
      )
    : undefined;
  const [variantId, setVariantId] = useState<string | null>(
    variants.length === 1 && firstAvailable ? firstAvailable.id : (usual?.id ?? null),
  );
  const selected = variants.find((v) => v.id === variantId) ?? null;
  const [state, action] = useFormState<FormState, FormData>(addToBagAction, undefined);
  const [showNotice, setShowNotice] = useState(false);

  useEffect(() => {
    if (state?.ok) setShowNotice(true);
  }, [state]);
  useEffect(() => {
    if (selected && colour && colours.length > 1 && selected.colour !== colour) setVariantId(null);
  }, [colour, selected, colours.length]);

  const allSoldOut = variants.every((v) => v.stockQuantity <= 0);
  const selectedSoldOut = !!selected && selected.stockQuantity <= 0;
  const label = !checkoutEnabled
    ? disabledLabel
    : allSoldOut
      ? 'Sold out'
      : !selected
        ? 'Select a size'
        : selectedSoldOut
          ? `Size ${selected.size} sold out`
          : `Add to bag · ${formatPrice(priceCents)}`;
  const disabled = !checkoutEnabled || allSoldOut || !selected || selectedSoldOut;
  const variantText = [
    colours.length > 1 ? colour : null,
    selected ? `Size ${selected.size}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <form action={action} aria-describedby="purchase-status">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId ?? ''} />
      <input type="hidden" name="quantity" value="1" />

      {colours.length > 1 && (
        <fieldset className="mb-5">
          <legend className="mb-2 text-[11px] uppercase tracking-label">
            Colour <span className="text-muted-2">— {colour}</span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {colours.map((c) => (
              <Pill
                key={c}
                pressed={colour === c}
                onClick={() => setColour(c)}
                aria-label={`Colour ${c}`}
              >
                <Swatch colour={swatchColour(c)} size={14} />
                {c}
              </Pill>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <div className="mb-2 flex items-baseline justify-between">
          <legend className="text-[11px] uppercase tracking-label">
            Size {selected && <span className="text-muted-2">— {selected.size}</span>}
          </legend>
          <span className="flex gap-4">
            <a
              href="#garment-measurements"
              className="text-[11px] uppercase tracking-label underline underline-offset-[5px]"
            >
              Measurements
            </a>
            <Link
              href="/size-guide"
              className="text-[11px] uppercase tracking-label underline underline-offset-[5px]"
              data-testid="size-guide-link"
            >
              Size guide
            </Link>
          </span>
        </div>
        {sizeNotes && (
          <p className="mb-3 bg-stone-light px-3 py-2 text-[13px]" data-testid="maker-size-notes">
            {sizeNotes}
          </p>
        )}
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(60px,1fr))] gap-2"
          aria-label="Size"
        >
          {visible.map((v) => (
            <Pill
              key={v.id}
              pressed={v.id === variantId}
              soldOut={v.stockQuantity <= 0}
              selectable={productType === 'ready_to_ship'}
              onClick={() => setVariantId(v.id)}
              aria-label={`Size ${v.size}${v.stockQuantity <= 0 ? ', sold out' : ''}`}
              className="px-2"
            >
              {v.size}
            </Pill>
          ))}
        </div>
        {modelLine && <p className="mt-2 text-[12px] text-muted-2">{modelLine}</p>}
        {selected &&
          productType === 'ready_to_ship' &&
          selected.stockQuantity > 0 &&
          selected.stockQuantity <= selected.lowStockThreshold && (
            <p className="mt-1 text-[12px] text-ink">
              Only {selected.stockQuantity} left in this size
            </p>
          )}
      </fieldset>
      {selected?.size === 'Custom' && <CustomMeasurements saved={savedSizes} />}
      {selected && selectedSoldOut && (
        <SoldOutSize
          variantId={selected.id}
          size={selected.size}
          signedIn={signedIn}
          makeToOrder={
            makeToOrder
              ? {
                  ...makeToOrder,
                  price: formatPrice(priceCents),
                  href: `${makeToOrder.href}&size=${encodeURIComponent(selected.size)}`,
                }
              : null
          }
        />
      )}

      <div className="mt-6 hidden md:block">
        <AddButton disabled={disabled} label={label} className="w-full" />
      </div>
      <input type="hidden" name="returnTo" value={askHref} />
      <button
        type="submit"
        formAction={openThreadAction}
        formNoValidate
        data-testid="ask-the-maker"
        className="mt-2 flex min-h-[52px] w-full items-center justify-center gap-2 border border-ink text-[11px] uppercase tracking-[0.2em] hover:bg-ink hover:text-ground"
      >
        <ChatIcon width={16} height={16} /> Ask the maker
      </button>
      {requestHref && (
        <p className="mt-4 text-center">
          <Link href={requestHref} className="text-[13px] underline underline-offset-[5px]">
            Want it different? Request something similar
          </Link>
        </p>
      )}

      <div id="purchase-status" aria-live="polite" className="mt-4 space-y-2">
        {!checkoutEnabled && previewMessage && (
          <p className="bg-stone-light px-3 py-2.5 text-[13px]" data-testid="preview-notice">
            {previewMessage}
          </p>
        )}
        {state?.ok === false && state.message && (
          <p className="bg-error-bg px-3 py-2.5 text-[13px] text-error">{state.message}</p>
        )}
        {showNotice && state?.ok && (
          <div
            className="flex items-center justify-between bg-stone-light px-3 py-2.5 text-[13px]"
            role="status"
          >
            <span>Added to your bag.</span>
            <Link
              href="/bag"
              className="text-[11px] uppercase tracking-label underline underline-offset-[5px]"
              data-testid="view-bag"
            >
              View bag & checkout
            </Link>
          </div>
        )}
      </div>

      {/* Sticky mobile buy bar */}
      <div
        className="glass-dark fixed inset-x-0 bottom-[var(--tabbar-h)] z-30 border-x-0 border-b-0 px-4 pb-3 pt-3 text-ground md:hidden"
        data-product={productSlug}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[22px] leading-none">{formatPrice(priceCents)}</p>
            <p className="mt-1 truncate text-[11px] text-ground/80">
              {variantText || 'Choose your size'}
            </p>
          </div>
          <AddButton
            disabled={disabled}
            label={
              checkoutEnabled && !allSoldOut && selected && !selectedSoldOut ? 'Add to bag' : label
            }
            light
            className="shrink-0"
          />
        </div>
      </div>
    </form>
  );
}
