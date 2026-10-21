'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addToBagAction } from '@/lib/actions/cart';
import { formatPrice } from '@/lib/domain/money';
import type { SavedFit } from '@/components/product/CustomMeasurements';
import { Sheet } from '../Sheet';
import { AppButton } from '../ui';
import { buzz } from '../Heart';
import { toast } from '../Toast';
import { SoldOutSize } from '@/components/product/SoldOutSize';

export interface SheetVariant {
  id: string;
  size: string;
  colour: string | null;
  stockQuantity: number;
}

/** AU sizes with the letter underneath. */
const LETTER: Record<string, string> = {
  '6': 'XS',
  '8': 'S',
  '10': 'M',
  '12': 'L',
  '14': 'XL',
  '16': 'XXL',
};
const AU = ['6', '8', '10', '12', '14', '16'];

const norm = (s: string) => s.replace(/^AU\s*/i, '').trim();

/**
 * The size sheet: AU 6–16 (letters underneath); sizes the piece doesn't come in struck through
 * as sold out; a one-of-one only has its one size; "Made to my measurements" for made-to-order
 * pieces. "Add to bag · A$x" until a size is chosen.
 */
export function SizeSheet({
  open,
  onOpenChange,
  productId,
  productType,
  priceCents,
  variants,
  colours,
  savedFit,
  canBuy,
  disabledLabel,
  onAdded,
  signedIn = false,
  makeToOrder = null,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  productId: string;
  productType: 'ready_to_ship' | 'made_to_order' | 'one_of_one';
  priceCents: number;
  variants: SheetVariant[];
  colours: string[];
  savedFit: SavedFit | null;
  canBuy: boolean;
  disabledLabel: string;
  onAdded?: () => void;
  signedIn?: boolean;
  makeToOrder?: { makerName: string; leadDays: number; price: string; href: string } | null;
}) {
  const router = useRouter();
  const [colour, setColour] = useState<string | null>(colours[0] ?? null);
  const [variantId, setVariantId] = useState<string | null>(
    productType === 'one_of_one' ? (variants.find((v) => v.stockQuantity > 0)?.id ?? null) : null,
  );
  const [measurements, setMeasurements] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const visible = variants.filter((v) => !colour || colours.length < 2 || v.colour === colour);
  const byAu = new Map(
    visible.filter((v) => AU.includes(norm(v.size))).map((v) => [norm(v.size), v]),
  );
  const custom = visible.find((v) => norm(v.size).toLowerCase() === 'custom') ?? null;
  const others = visible.filter((v) => !AU.includes(norm(v.size)) && v !== custom);
  const selected = variants.find((v) => v.id === variantId) ?? null;
  const mto = productType === 'made_to_order';
  const measureLine = savedFit
    ? [
        savedFit.bust ? `Bust ${savedFit.bust}` : null,
        savedFit.waist ? `Waist ${savedFit.waist}` : null,
        savedFit.hips ? `Hips ${savedFit.hips}` : null,
        savedFit.height ? `Height ${savedFit.height} cm` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  const add = () => {
    if (!selected) return;
    const fd = new FormData();
    fd.set('productId', productId);
    fd.set('variantId', selected.id);
    fd.set('quantity', '1');
    if (measurements && savedFit) {
      if (savedFit.bust) fd.set('measure_bust', String(savedFit.bust));
      if (savedFit.waist) fd.set('measure_waist', String(savedFit.waist));
      if (savedFit.hips) fd.set('measure_hips', String(savedFit.hips));
      if (savedFit.height) fd.set('measure_height', String(savedFit.height));
    }
    start(async () => {
      const res = await addToBagAction(undefined, fd);
      if (res?.ok) {
        buzz();
        toast('Added to bag');
        onOpenChange(false);
        onAdded?.();
        router.refresh();
      } else setError(res?.message ?? 'Couldn’t add that. Try again.');
    });
  };

  const tile = (v: SheetVariant | null, au: string) => {
    const soldOut = !v || v.stockQuantity <= 0;
    const on = v?.id === variantId && !measurements;
    return (
      <button
        key={au}
        type="button"
        disabled={!v}
        aria-pressed={on}
        aria-label={`Size ${au}${soldOut ? ', sold out' : ''}`}
        data-testid={`size-${au}`}
        onClick={() => {
          setVariantId(v!.id);
          setMeasurements(false);
        }}
        className={`flex min-h-[60px] flex-col items-center justify-center rounded-app border text-[15px] ${
          on
            ? 'border-ink bg-ink text-ground'
            : soldOut
              ? 'border-line text-muted-2 line-through'
              : 'border-line-strong bg-surface'
        } ${soldOut && v ? 'no-underline' : ''} }`}
      >
        <span>AU {au}</span>
        <span
          className={`text-[10px] uppercase tracking-[0.12em] no-underline ${on ? 'text-ground/70' : 'text-muted-2'}`}
        >
          {soldOut ? 'Sold out' : LETTER[au]}
        </span>
      </button>
    );
  };

  const selectedSoldOut = !!selected && selected.stockQuantity <= 0 && !measurements;
  const label = !canBuy
    ? disabledLabel
    : selectedSoldOut
      ? `Size ${norm(selected!.size)} sold out`
      : selected || measurements
        ? `Add to bag · ${formatPrice(priceCents)}`
        : 'Choose a size';

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Size"
      testId="size-sheet"
      footer={
        <>
          <AppButton
            onClick={add}
            disabled={!canBuy || !selected || selectedSoldOut || pending}
            className="w-full"
            data-testid="size-sheet-add"
          >
            {pending ? 'Adding…' : label}
          </AppButton>
          {error && (
            <p className="mt-2 text-[12px] text-error" role="alert">
              {error}
            </p>
          )}
        </>
      }
    >
      {colours.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Colour">
          {colours.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={colour === c}
              onClick={() => {
                setColour(c);
                setVariantId(null);
              }}
              className={`min-h-[36px] rounded-pill border px-3.5 text-[13px] ${colour === c ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
            >
              {c}
            </button>
          ))}
        </div>
      )}
      {productType === 'one_of_one' ? (
        <div className="grid grid-cols-3 gap-2" data-testid="size-grid">
          {visible.map((v) => tile(v, norm(v.size)))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2" data-testid="size-grid">
          {AU.map((au) => tile(byAu.get(au) ?? null, au))}
          {others.map((v) => tile(v, norm(v.size)))}
        </div>
      )}
      {selectedSoldOut && productType === 'ready_to_ship' && (
        <SoldOutSize
          variantId={selected!.id}
          size={norm(selected!.size)}
          signedIn={signedIn}
          makeToOrder={makeToOrder}
        />
      )}
      {mto && (
        <button
          type="button"
          aria-pressed={measurements}
          data-testid="size-measurements"
          onClick={() => {
            setMeasurements(true);
            setVariantId(custom?.id ?? visible.find((v) => v.stockQuantity > 0)?.id ?? null);
          }}
          className={`mt-3 flex w-full items-center justify-between rounded-app border px-4 py-3 text-left ${measurements ? 'border-ink bg-ink text-ground' : 'border-line-strong bg-surface'}`}
        >
          <span>
            <span className="block text-[15px]">Made to my measurements</span>
            <span className={`block text-[12px] ${measurements ? 'text-ground/70' : 'text-muted'}`}>
              {measureLine || 'Add your measurements in You › Sizes'}
            </span>
          </span>
        </button>
      )}
      <p className="mt-4 text-[12px] text-muted">
        Not sure? The maker answers fit questions within hours.
      </p>
    </Sheet>
  );
}
