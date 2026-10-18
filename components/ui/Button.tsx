import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'white' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'glass-dark text-ground hover:bg-[rgba(17,17,17,0.92)] disabled:opacity-60',
  secondary: 'border border-ink bg-transparent text-ink hover:bg-ink hover:text-ground',
  ghost: 'text-ink hover:bg-stone-light',
  white: 'bg-surface text-ink hover:bg-ground',
  danger: 'border border-error bg-transparent text-error hover:bg-error hover:text-ground',
};
const SIZES: Record<Size, string> = {
  sm: 'min-h-[44px] px-4 text-[11px]',
  md: 'min-h-[52px] px-6 text-[11px]',
  lg: 'min-h-[56px] px-8 text-[12px]',
};

export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra = '') {
  return `inline-flex items-center justify-center gap-2 font-normal uppercase tracking-[0.18em] transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return <button {...props} className={buttonClass(variant, size, className)} />;
}

export function ButtonLink({
  href,
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode } & Omit<
  ComponentProps<typeof Link>,
  'href' | 'className'
>) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

/** Adjoining white box buttons with a 1px gap, for use on imagery (hero, maker profile). */
export function BoxButtonGroup({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`inline-grid auto-cols-fr grid-flow-col gap-px bg-line ${className}`}>
      {children}
    </div>
  );
}

export function boxButtonClass(extra = '') {
  return `flex min-h-[52px] items-center justify-center bg-surface px-6 text-center text-[11px] uppercase tracking-[0.18em] text-ink hover:bg-ground ${extra}`;
}
