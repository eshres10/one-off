'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addToBagAction } from '@/lib/actions/cart';
import { formatPrice } from '@/lib/domain/money';
import type { FormState } from '@/lib/validation';
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
}: {
  disabled: boolean;
  label: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={`h-12 rounded-full bg-ink px-6 text-[15px] font-medium text-paper transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-ink-muted ${className}`}
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
  checkoutEnabled = true,
  previewMessage,
}: {
  productId: string;
  productSlug: string;
  productType: 'ready_to_ship' | 'made_to_order' | 'one_of_one';
  priceCents: number;
  colours: string[];
  variants: Variant[];
  askHref: string;
  /** False in preview mode: sizes stay browsable but nothing can be added to the bag. */
  checkoutEnabled?: boolean;
  previewMessage?: string;
}) {
  const [colour, setColour] = useState<string | null>(colours[0] ?? null);
  const visible = useMemo(
    () => variants.filter((v) => !colour || colours.length < 2 || v.colour === colour),
    [variants, colour, colours.length],
  );
  const firstAvailable = visible.find((v) => v.stockQuantity > 0);
  const [variantId, setVariantId] = useState<string | null>(
    variants.length === 1 && firstAvailable ? firstAvailable.id : null,
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
  const label = !checkoutEnabled
    ? 'Launching soon'
    : allSoldOut
      ? 'Sold out'
      : !selected
        ? productType === 'one_of_one'
          ? 'Add to bag'
          : 'Select a size'
        : 'Add to bag';

  return (
    <form action={action} className="space-y-5" aria-describedby="purchase-status">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variantId ?? ''} />
      <input type="hidden" name="quantity" value="1" />

      {colours.length > 1 && (
        <fieldset>
          <legend className="text-sm font-medium">
            Colour: <span className="font-normal text-ink-soft">{colour}</span>
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {colours.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColour(c)}
                aria-pressed={colour === c}
                className={`rounded-full border px-4 py-2 text-sm ${colour === c ? 'border-ink bg-ink text-paper' : 'border-stone bg-white hover:border-ink'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <div className="flex items-baseline justify-between">
          <legend className="text-sm font-medium">
            Size (AU)
            {selected ? <span className="font-normal text-ink-soft">: {selected.size}</span> : null}
          </legend>
          <a href="#size-and-fit" className="text-sm text-ink-soft underline underline-offset-4">
            Size & fit
          </a>
        </div>
        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
          {visible.map((v) => {
            const soldOut = v.stockQuantity <= 0;
            const isSel = v.id === variantId;
            return (
              <button
                key={v.id}
                type="button"
                role="radio"
                aria-checked={isSel}
                aria-label={`Size ${v.size}${soldOut ? ', sold out' : ''}`}
                disabled={soldOut}
                onClick={() => setVariantId(v.id)}
                className={`min-w-[3.25rem] rounded-full border px-4 py-2.5 text-sm transition ${
                  isSel
                    ? 'border-ink bg-ink text-paper'
                    : soldOut
                      ? 'cursor-not-allowed border-stone bg-stone-light text-ink-muted line-through'
                      : 'border-stone bg-white hover:border-ink'
                }`}
              >
                {v.size}
              </button>
            );
          })}
        </div>
        {selected && productType === 'ready_to_ship' && (
          <p
            className={`mt-2 text-sm ${selected.stockQuantity <= selected.lowStockThreshold ? 'text-alert' : 'text-ink-soft'}`}
          >
            {selected.stockQuantity <= selected.lowStockThreshold
              ? `Only ${selected.stockQuantity} left`
              : `${selected.stockQuantity} in stock`}
          </p>
        )}
      </fieldset>

      <div className="hidden gap-3 sm:flex">
        <AddButton
          disabled={!checkoutEnabled || allSoldOut || !selected}
          label={label}
          className="flex-1"
        />
      </div>
      <Link
        href={`${askHref}${variantId ? `?variant=${variantId}` : ''}`}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-ink text-[15px] font-medium hover:bg-ink hover:text-paper"
      >
        <ChatIcon width={18} height={18} /> Ask the maker
      </Link>

      <div id="purchase-status" aria-live="polite">
        {!checkoutEnabled && previewMessage && (
          <p
            className="rounded-lg bg-stone-light px-3 py-2 text-sm text-ink-soft"
            data-testid="preview-notice"
          >
            {previewMessage}
          </p>
        )}
        {state?.ok === false && state.message && (
          <p className="rounded-lg bg-alert-light px-3 py-2 text-sm text-alert">{state.message}</p>
        )}
        {showNotice && state?.ok && (
          <div
            className="flex items-center justify-between rounded-lg bg-moss-light px-3 py-2 text-sm text-moss"
            role="status"
          >
            <span>Added to your bag.</span>
            <Link
              href="/bag"
              className="font-medium underline underline-offset-4"
              data-testid="view-bag"
            >
              View bag & checkout
            </Link>
          </div>
        )}
      </div>

      {/* Sticky mobile CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-stone bg-paper/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur sm:hidden"
        data-product={productSlug}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">{formatPrice(priceCents)}</p>
            <p className="truncate text-xs text-ink-muted">
              {selected
                ? `AU ${selected.size}${colours.length > 1 && colour ? ` · ${colour}` : ''}`
                : 'Choose your size'}
            </p>
          </div>
          <AddButton
            disabled={!checkoutEnabled || allSoldOut || !selected}
            label={label}
            className="flex-[1.4]"
          />
        </div>
      </div>
    </form>
  );
}
