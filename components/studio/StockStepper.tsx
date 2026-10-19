'use client';

import { useRef, useState, useTransition } from 'react';
import { setStockAction } from '@/lib/actions/studio-listings';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';

/**
 * − n + for one size. Updates instantly and saves in the background (a burst of taps is sent
 * once it settles); reverts if the save fails. Long-press − clears it to zero.
 */
export function StockStepper({
  variantId,
  stock,
  label,
  compact = false,
}: {
  variantId: string;
  stock: number;
  label: string;
  compact?: boolean;
}) {
  const [value, setValue] = useState(stock);
  const [saved, setSaved] = useState(stock);
  const [, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const hold = useRef<ReturnType<typeof setTimeout>>();

  const commit = (next: number) => {
    setValue(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      start(async () => {
        const res = await setStockAction(variantId, next);
        if (res?.ok) setSaved(next);
        else setValue(saved);
      });
    }, 400);
  };

  const btn = `flex ${compact ? 'h-9 w-9' : 'h-11 w-11'} items-center justify-center border border-line-strong hover:border-ink disabled:opacity-40`;
  return (
    <div
      className="flex items-center"
      role="group"
      aria-label={`${label} stock`}
      data-testid="stock-stepper"
    >
      <button
        type="button"
        className={btn}
        aria-label={`One fewer in ${label}`}
        disabled={value <= 0}
        onClick={() => commit(Math.max(0, value - 1))}
        onPointerDown={() => {
          hold.current = setTimeout(() => commit(0), 650);
        }}
        onPointerUp={() => clearTimeout(hold.current)}
        onPointerLeave={() => clearTimeout(hold.current)}
      >
        <MinusIcon width={14} height={14} />
      </button>
      <output
        className={`${compact ? 'w-8' : 'w-10'} text-center text-[14px] tabular-nums ${value === 0 ? 'text-muted-2' : ''}`}
        aria-live="polite"
        data-testid="stock-value"
      >
        {value}
      </output>
      <button
        type="button"
        className={btn}
        aria-label={`One more in ${label}`}
        disabled={value >= 999}
        onClick={() => commit(value + 1)}
      >
        <PlusIcon width={14} height={14} />
      </button>
    </div>
  );
}
