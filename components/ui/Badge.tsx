import { BADGE_LABELS, type ProductBadge } from '@/lib/domain/stock';

const STYLES: Record<ProductBadge, string> = {
  ready_to_ship: 'bg-white/90 text-ink',
  made_to_order: 'bg-moss-light text-moss',
  one_of_one: 'bg-clay-light text-clay',
  low_stock: 'bg-white/90 text-alert',
  sold_out: 'bg-ink/80 text-paper',
};

export function ProductBadgePill({
  badge,
  className = '',
}: {
  badge: ProductBadge;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-5 ${STYLES[badge]} ${className}`}
    >
      {BADGE_LABELS[badge]}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'delivered' ||
    status === 'approved' ||
    status === 'paid' ||
    status === 'accepted' ||
    status === 'completed'
      ? 'bg-moss-light text-moss'
      : status === 'shipped' || status === 'quoted'
        ? 'bg-[#E7EDF7] text-[#2F51A0]'
        : status === 'cancelled' ||
            status === 'refunded' ||
            status === 'rejected' ||
            status === 'declined' ||
            status === 'failed'
          ? 'bg-alert-light text-alert'
          : 'bg-stone-light text-ink-soft';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
