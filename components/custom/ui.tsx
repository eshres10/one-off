'use client';

import type { ComponentProps, ReactNode } from 'react';

/** Small caps kicker. */
export function Cap({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`block text-[10px] uppercase tracking-[0.18em] text-muted-2 ${className}`}>
      {children}
    </span>
  );
}

/** "What are you <i>dreaming of?</i>" */
export function Title({
  plain,
  italic,
  size = 'md',
  id,
}: {
  plain: string;
  italic?: string;
  size?: 'md' | 'lg';
  id?: string;
}) {
  return (
    <h1
      id={id}
      className={`font-display font-normal leading-[1.02] ${size === 'lg' ? 'text-[44px] md:text-[58px]' : 'text-[38px] md:text-[52px]'}`}
    >
      {plain}
      {italic ? (
        <>
          {' '}
          <em>{italic}</em>
        </>
      ) : null}
    </h1>
  );
}

const ON = 'bg-[rgba(17,17,17,0.86)] text-ground border-ink';
const OFF = 'bg-transparent text-ink border-line-strong hover:border-ink';

/** A pill chip (fabric, occasion, fittings…): a real button with aria-pressed. */
export function Chip({
  pressed,
  className = '',
  children,
  ...props
}: ComponentProps<'button'> & { pressed: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`min-h-[40px] rounded-circle border px-3.5 text-[13px] transition-colors ${pressed ? ON : OFF} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** A square option (date shortcut, budget band). */
export function Square({
  pressed,
  label,
  sub,
  className = '',
  ...props
}: ComponentProps<'button'> & { pressed: boolean; label: string; sub?: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={`flex min-h-[56px] flex-col items-center justify-center border px-1 text-[13px] transition-colors ${pressed ? ON : OFF} ${className}`}
      {...props}
    >
      <span>{label}</span>
      {sub ? (
        <span className={`text-[11px] ${pressed ? 'text-line-strong' : 'text-muted-2'}`}>
          {sub}
        </span>
      ) : null}
    </button>
  );
}

/** A full-width row with a radio mark (fit options, reach). */
export function OptionRow({
  pressed,
  label,
  sub,
  ...props
}: ComponentProps<'button'> & { pressed: boolean; label: string; sub?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={pressed}
      className={`flex min-h-[56px] w-full items-center justify-between gap-3 border px-3.5 py-3 text-left transition-colors ${pressed ? ON : OFF}`}
      {...props}
    >
      <span className="flex flex-col">
        <span className="font-medium">{label}</span>
        {sub ? (
          <span className={`text-[12px] ${pressed ? 'text-line-strong' : 'text-muted-2'}`}>
            {sub}
          </span>
        ) : null}
      </span>
      <span aria-hidden>{pressed ? '●' : '○'}</span>
    </button>
  );
}

/** The black glass call to action. */
export function Glass({ className = '', children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`glass-dark inline-flex min-h-[54px] items-center justify-center px-7 text-[11px] uppercase tracking-[0.18em] text-ground transition-opacity disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Outline({ className = '', children, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-[48px] items-center justify-center border border-ink px-5 text-[10px] uppercase tracking-[0.18em] text-ink ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/** The stone note box. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`bg-stone-light px-3.5 py-3 text-[12px] leading-relaxed text-text2 ${className}`}
    >
      {children}
    </div>
  );
}

export const fieldClass =
  'min-h-[48px] w-full border border-line-strong bg-[#FBFAF8] px-3 text-[16px] text-ink outline-none focus-visible:border-ink';
export const areaClass = `${fieldClass} min-h-0 resize-none py-3 leading-[1.45]`;

/** The Off One loop mark, drawn as two ellipses; animated while finding makers. */
export function Loop({ animate = false, size = 96 }: { animate?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-468 -487 1165 1165"
      aria-hidden
      className={animate ? 'loop-draw' : ''}
    >
      <g transform="rotate(12)">
        <ellipse rx="192" ry="358" fill="none" stroke="currentColor" strokeWidth="22" />
      </g>
      <g transform="translate(230 192.1) rotate(12)">
        <ellipse rx="192" ry="358" fill="none" stroke="currentColor" strokeWidth="22" />
      </g>
    </svg>
  );
}
