import type { ComponentProps } from 'react';

/**
 * Option button (size, colour, length, budget…). Options are always buttons, never dropdowns.
 * Selected = aria-pressed + glass-dark. Sold out = disabled, dashed and struck through.
 */
export function Pill({
  pressed = false,
  soldOut = false,
  className = '',
  children,
  ...props
}: ComponentProps<'button'> & { pressed?: boolean; soldOut?: boolean }) {
  const base =
    'inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 px-4 text-[13px] font-light transition-colors';
  const state = pressed
    ? 'glass-dark text-ground'
    : soldOut
      ? 'cursor-not-allowed border border-dashed border-line-strong text-disabled line-through'
      : 'border border-line-strong bg-transparent text-ink hover:border-ink';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={soldOut || props.disabled}
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
