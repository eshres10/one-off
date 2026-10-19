'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { addToBagAction } from '@/lib/actions/cart';
import { openThreadAction } from '@/lib/actions/messages';
import { swatchColour } from '@/lib/colours';
import type { FormState } from '@/lib/validation';
import { compactCount } from '@/lib/quickview/format';
import { SaveButton } from '@/components/product/SaveButton';
import { ShareButton } from '@/components/product/ShareButton';
import { ChatIcon } from '@/components/ui/icons';

interface Variant {
  id: string;
  size: string;
  colour: string | null;
  stockQuantity: number;
}

function AddButton({ disabled, label }: { disabled: boolean; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      data-testid="qv-add"
      className="glass-dark min-h-[52px] w-full px-6 text-[11px] uppercase tracking-[0.2em] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Adding…' : label}
    </button>
  );
}

/** Quick view buying: colour swatches, size squares, Add to bag, save, ask, share. */
export function QuickBuy({
  productId,
  slug,
  title,
  colours,
  variants,
  saved,
  saveCount,
  checkoutEnabled,
  disabledLabel,
}: {
  productId: string;
  slug: string;
  title: string;
  colours: string[];
  variants: Variant[];
  saved: boolean;
  saveCount: number;
  checkoutEnabled: boolean;
  disabledLabel: string;
}) {
  const [colour, setColour] = useState<string | null>(colours[0] ?? null);
  const visible = useMemo(
    () => variants.filter((v) => !colour || colours.length < 2 || v.colour === colour),
    [variants, colour, colours.length],
  );
  const onlyOne = variants.length === 1 && variants[0]!.stockQuantity > 0 ? variants[0]!.id : null;
  const [variantId, setVariantId] = useState<string | null>(onlyOne);
  const selected = variants.find((v) => v.id === variantId) ?? null;
  const [state, action] = useFormState<FormState, FormData>(addToBagAction, undefined);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (state?.ok) setAdded(true);
  }, [state]);
  useEffect(() => {
    if (selected && colours.length > 1 && selected.colour !== colour) setVariantId(null);
  }, [colour, selected, colours.length]);

  const soldOut = variants.every((v) => v.stockQuantity <= 0);
  const label = !checkoutEnabled
    ? disabledLabel
    : soldOut
      ? 'Sold out'
      : selected
        ? 'Add to bag'
        : 'Select a size';

  return (
    <div>
      <form
        action={(fd) => {
          setAdded(false);
          action(fd);
        }}
      >
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="variantId" value={variantId ?? ''} />
        <input type="hidden" name="quantity" value="1" />

        {colours.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-[11px] uppercase tracking-label">
              Colour <span className="text-muted-2">— {colour}</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-1">
              {colours.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={colour === c}
                  aria-label={c}
                  title={c}
                  onClick={() => setColour(c)}
                  className={`flex h-11 w-11 items-center justify-center ${colour === c ? 'outline outline-1 -outline-offset-4 outline-ink' : ''}`}
                >
                  <span
                    aria-hidden
                    className="h-7 w-7 border border-black/10"
                    style={{ background: swatchColour(c) }}
                  />
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset className="mt-4">
          <div className="flex items-baseline justify-between">
            <legend className="text-[11px] uppercase tracking-label">
              Size {selected && <span className="text-muted-2">— {selected.size}</span>}
            </legend>
            <a
              href={`/products/${slug}#garment-measurements`}
              className="text-[11px] uppercase tracking-label underline underline-offset-[5px]"
            >
              Size guide
            </a>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {visible.map((v) => {
              const out = v.stockQuantity <= 0;
              const on = v.id === variantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={out}
                  aria-pressed={on}
                  aria-label={`Size ${v.size}${out ? ', sold out' : ''}`}
                  onClick={() => setVariantId(v.id)}
                  className={`min-h-[44px] min-w-[48px] border px-2 text-[13px] ${
                    on
                      ? 'border-ink bg-ink text-ground'
                      : out
                        ? 'cursor-not-allowed border-dashed border-line-strong text-disabled line-through'
                        : 'border-line-strong hover:border-ink'
                  }`}
                >
                  {v.size}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5">
          {added ? (
            <Link
              href="/bag"
              data-testid="qv-view-bag"
              className="glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.2em]"
            >
              Added ✓ · View bag
            </Link>
          ) : (
            <AddButton disabled={!checkoutEnabled || soldOut || !selected} label={label} />
          )}
        </div>
        <div aria-live="polite">
          {state?.ok === false && state.message && (
            <p className="mt-2 bg-error-bg px-3 py-2 text-[13px] text-error">{state.message}</p>
          )}
        </div>
      </form>

      <div className="mt-2 flex items-center gap-2">
        <div className="flex items-center border border-line-strong pr-3">
          <SaveButton productId={productId} saved={saved} title={title} />
          <span className="text-[12px] text-muted" data-testid="qv-saved-by">
            Saved by {compactCount(saveCount)}
          </span>
        </div>
        <form action={openThreadAction} className="flex-1">
          <input type="hidden" name="productId" value={productId} />
          <input type="hidden" name="variantId" value={variantId ?? ''} />
          <input type="hidden" name="returnTo" value={`/products/${slug}`} />
          <button
            type="submit"
            data-testid="qv-ask-maker"
            className="flex min-h-[46px] w-full items-center justify-center gap-2 border border-ink text-[11px] uppercase tracking-[0.18em] hover:bg-ink hover:text-ground"
          >
            <ChatIcon width={15} height={15} /> Ask the maker
          </button>
        </form>
        <ShareButton title={title} className="h-[46px] w-[46px] border border-line-strong" />
      </div>
    </div>
  );
}
