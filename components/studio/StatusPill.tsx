const LABELS: Record<string, string> = {
  paid: 'To ship',
  preparing: 'Preparing',
  making: 'Making',
  ready: 'Ready',
  shipped: 'Shipped',
  delivered: 'Delivered',
  completed: 'Completed',
  issue: 'Issue',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

/** Order status pill (pills are the one rounded shape). */
export function OrderStatusPill({ status, mto = false }: { status: string; mto?: boolean }) {
  const label = status === 'paid' && mto ? 'Ordered' : (LABELS[status] ?? status);
  const tone =
    status === 'issue'
      ? 'border-alert text-alert'
      : status === 'paid' || status === 'ready'
        ? 'border-ink bg-ink text-ground'
        : status === 'completed' || status === 'refunded'
          ? 'border-line-strong text-muted-2'
          : 'border-ink text-ink';
  return (
    <span
      className={`inline-flex min-h-[22px] items-center whitespace-nowrap rounded-circle border px-2.5 text-[10px] uppercase tracking-[0.12em] ${tone}`}
      data-testid="order-status"
    >
      {label}
    </span>
  );
}
