import { BADGE_LABELS, type ProductBadge } from '@/lib/domain/stock';

/** Card badge: ink label on a 92% ground chip, 10px uppercase. */
export function ProductBadgePill({
  badge,
  className = '',
  outlined = false,
}: {
  badge: ProductBadge;
  className?: string;
  outlined?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-[3px] text-[10px] font-normal uppercase leading-4 tracking-[0.14em] text-ink ${
        outlined ? 'border border-ink' : 'bg-[rgba(246,244,240,0.92)]'
      } ${className}`}
    >
      {BADGE_LABELS[badge]}
    </span>
  );
}

/** Status as small uppercase text with a hairline border — never coloured blobs. */
export function StatusPill({ status }: { status: string }) {
  const negative = ['cancelled', 'refunded', 'rejected', 'declined', 'failed', 'paused'].includes(
    status,
  );
  return (
    <span
      className={`inline-flex items-center border px-2 py-[3px] text-[10px] font-normal uppercase leading-4 tracking-[0.14em] ${
        negative ? 'border-error text-error' : 'border-ink text-ink'
      }`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
