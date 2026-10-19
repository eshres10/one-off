import type { ComponentProps } from 'react';

/**
 * Option button (size, colour, length, budget…). Options are always buttons, never dropdowns.
 * Selected = aria-pressed + glass-dark. Sold out = crossed corner to corner, and disabled unless
 * `selectable` (sizes that can be picked to ask for a restock alert).
 */
export function Pill({
  pressed = false,
  soldOut = false,
  className = '',
  children,
  selectable = false,
  ...props
}: ComponentProps<'button'> & {
  pressed?: boolean;
  soldOut?: boolean;
  /** A sold-out size that can still be picked (to ask for a restock alert). */
  selectable?: boolean;
}) {
  const base =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 px-4 text-[13px] font-light transition-colors';
  // Sold out: crossed through corner to corner.
  const cross =
    'bg-[linear-gradient(to_top_right,transparent_calc(50%-0.5px),currentColor_calc(50%-0.5px),currentColor_calc(50%+0.5px),transparent_calc(50%+0.5px))]';
  const state = pressed
    ? `glass-dark text-ground ${soldOut ? cross : ''}`
    : soldOut
      ? `border border-line-strong text-muted-2 ${cross} ${selectable ? 'hover:border-ink' : 'cursor-not-allowed'}`
      : 'border border-line-strong bg-transparent text-ink hover:border-ink';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={(soldOut && !selectable) || props.disabled}
      className={`${base} ${state} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** Small square colour swatch (10px on cards, 14px in pills). */
export function Swatch({ colour, size = 10 }: { colour: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 border border-black/10"
      style={{ width: size, height: size, background: colour }}
    />
  );
}
