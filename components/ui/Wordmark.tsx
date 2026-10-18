import { BRAND } from '@/lib/brand';

const SIZES = {
  header: 'text-[32px] md:text-[40px]',
  mobile: 'text-[32px]',
  footer: 'text-[30px]',
} as const;

/** The ONE OFF wordmark (Direction A, compressed Didone). Never type the brand ad hoc. */
export function Wordmark({
  size = 'header',
  className = '',
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={`font-wordmark font-medium uppercase leading-none ${SIZES[size]} ${className}`}
      style={{ letterSpacing: '-0.035em', wordSpacing: '-0.08em', fontOpticalSizing: 'auto' }}
    >
      {BRAND.name}
    </span>
  );
}
