'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

/** A round chip (phones): a link or a button, pressed = ink. */
export function Chip({
  href,
  onClick,
  pressed = false,
  children,
  testId,
  className = '',
  small = false,
}: {
  href?: string;
  onClick?: () => void;
  pressed?: boolean;
  children: ReactNode;
  testId?: string;
  className?: string;
  small?: boolean;
}) {
  const cls = `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 ${small ? 'min-h-[32px] text-[12px]' : 'min-h-[36px] text-[13px]'} ${pressed ? 'border-ink bg-ink text-ground' : 'border-line-strong bg-surface text-ink'} ${className}`;
  if (href)
    return (
      <Link
        href={href}
        className={cls}
        data-chip
        data-testid={testId}
        aria-current={pressed ? 'true' : undefined}
      >
        {children}
      </Link>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cls}
      data-chip
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** Two or three options in one rounded control (Messages / Notifications…). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  testId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  label: string;
  testId?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      data-testid={testId}
      className="grid rounded-pill bg-stone p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            data-testid={testId ? `${testId}-${o.value}` : undefined}
            className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-pill text-[13px] ${on ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(17,17,17,0.08)]' : 'text-muted'}`}
          >
            {o.label}
            {o.count ? (
              <span className="rounded-pill bg-ink px-1.5 text-[10px] leading-4 text-ground">
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** The app's primary button (rounded on phones). */
export function AppButton({
  children,
  variant = 'ink',
  className = '',
  ...rest
}: React.ComponentProps<'button'> & { variant?: 'ink' | 'outline' | 'ground' }) {
  const v =
    variant === 'ink'
      ? 'bg-ink text-ground disabled:opacity-50'
      : variant === 'ground'
        ? 'bg-ground text-ink'
        : 'border border-ink text-ink';
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-app px-5 text-[12px] uppercase tracking-[0.16em] disabled:cursor-not-allowed ${v} ${className}`}
    >
      {children}
    </button>
  );
}

export const appButtonLinkClass = (variant: 'ink' | 'outline' = 'ink', extra = '') =>
  `inline-flex min-h-[52px] items-center justify-center gap-2 rounded-app px-5 text-[12px] uppercase tracking-[0.16em] ${variant === 'ink' ? 'bg-ink text-ground' : 'border border-ink text-ink'} ${extra}`;
