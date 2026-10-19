import { D as MONOGRAM_D } from '@/components/ui/Monogram';

/**
 * Small line drawings for empty and error states: 1px ink strokes, no fills, drawn on a 64-unit
 * grid and scaled to the size asked for. The stroke stays 1px at any size.
 */
type Props = { size?: number; className?: string };

function Frame({ size = 72, className = '', children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`block text-ink ${className}`}
    >
      {children}
    </svg>
  );
}

const s = { vectorEffect: 'non-scaling-stroke' as const };

export function NeedleIcon(p: Props) {
  return (
    <Frame {...p}>
      <path {...s} d="M14 52 L50 12" />
      <path {...s} d="M47 13.5 a2.2 4.5 41 1 1 4 4" />
      <path {...s} d="M49.5 14.5 C40 22 58 32 44 40 C32 47 44 56 26 58 C18 59 12 56 10 52" />
    </Frame>
  );
}

export function CloudOffIcon(p: Props) {
  return (
    <Frame {...p}>
      <path {...s} d="M18 44 h30 a9 9 0 0 0 1-17.9 A14 14 0 0 0 22 22 a10 10 0 0 0 -4 22 z" />
      <path {...s} d="M12 54 L52 12" />
    </Frame>
  );
}

export function HeartIcon(p: Props) {
  return (
    <Frame {...p}>
      <path
        {...s}
        d="M32 52 C14 40 8 31 8 23 a11 11 0 0 1 24 -5 a11 11 0 0 1 24 5 c0 8 -6 17 -24 29 z"
      />
    </Frame>
  );
}

export function ParcelIcon(p: Props) {
  return (
    <Frame {...p}>
      <path {...s} d="M32 8 L54 18 L54 44 L32 56 L10 44 L10 18 Z" />
      <path {...s} d="M10 18 L32 29 L54 18" />
      <path {...s} d="M32 29 L32 56" />
      <path {...s} d="M21 13 L43 24 L43 33" />
    </Frame>
  );
}

export function BubbleIcon(p: Props) {
  return (
    <Frame {...p}>
      <path {...s} d="M10 14 h44 v28 h-24 l-10 10 v-10 h-10 z" />
      <path {...s} d="M20 25 h24 M20 32 h16" />
    </Frame>
  );
}

export function HangerIcon(p: Props) {
  return (
    <Frame {...p}>
      <path {...s} d="M28 18 a4 4 0 1 1 6 3.5 c-1.5 1 -2 2 -2 4 v3" />
      <path {...s} d="M32 28.5 L58 46 H6 Z" />
    </Frame>
  );
}

export function SpoolIcon(p: Props) {
  return (
    <Frame {...p}>
      <path {...s} d="M18 12 h28 M18 52 h28" />
      <path {...s} d="M22 12 v40 M42 12 v40" />
      <path {...s} d="M22 18 L42 22 M22 24 L42 28 M22 30 L42 34 M22 36 L42 40 M22 42 L42 46" />
      <path {...s} d="M42 40 C50 42 54 48 58 56" />
    </Frame>
  );
}

export function TapeIcon(p: Props) {
  return (
    <Frame {...p}>
      <circle {...s} cx="26" cy="30" r="16" />
      <circle {...s} cx="26" cy="30" r="4" />
      <path {...s} d="M26 46 H58 V38 H40" />
      <path {...s} d="M46 46 v-3 M51 46 v-4 M56 46 v-3" />
    </Frame>
  );
}

/** The OO monogram as a 1px outline. */
export function MonogramOutline({ size = 72, className = '' }: Props) {
  return (
    <svg
      viewBox="0 0 2000 2000"
      width={size}
      height={size}
      aria-hidden
      className={`block text-ink ${className}`}
    >
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
        fillRule="evenodd"
        transform="translate(0,2000) scale(0.1,-0.1)"
        d={MONOGRAM_D}
      />
    </svg>
  );
}
