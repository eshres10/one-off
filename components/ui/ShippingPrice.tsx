import { formatPrice } from '@/lib/domain/money';

/**
 * A delivery price, with the makers' normal price crossed out when the buyer pays less
 * (a maker's bundle deal or One Off's shipping offer). The crossed-out price is always the
 * makers' real total, never an invented "was" price.
 */
export function ShippingPrice({
  paidCents,
  listCents,
  from = false,
  testId,
}: {
  paidCents: number;
  listCents: number;
  from?: boolean;
  testId?: string;
}) {
  const saving = listCents > paidCents;
  return (
    <span
      className="inline-flex flex-wrap items-baseline justify-end gap-x-1.5"
      data-testid={testId}
    >
      {saving && (
        <s className="text-muted-2" data-testid={testId ? `${testId}-was` : undefined}>
          <span className="sr-only">Usually </span>
          {formatPrice(listCents)}
        </s>
      )}
      <span>
        {saving && <span className="sr-only">now </span>}
        {paidCents ? `${from ? 'from ' : ''}${formatPrice(paidCents)}` : 'Free'}
      </span>
    </span>
  );
}

/** "You save A$16 on shipping", shown under totals when there's a saving. */
export function ShippingSaving({
  savingCents,
  reason,
  testId,
  className = '',
}: {
  savingCents: number;
  reason?: string | null;
  testId?: string;
  className?: string;
}) {
  if (savingCents <= 0) return null;
  return (
    <p
      className={`${/\bbg-/.test(className) ? '' : 'bg-stone'} px-3 py-2 text-[13px] ${className}`}
      data-testid={testId}
    >
      You save {formatPrice(savingCents)} on shipping{reason ? ` · ${reason}` : ''}
    </p>
  );
}

/** Why shipping costs less: One Off's cap, its free-shipping threshold, or a maker's deal. */
export function savingReason(
  applied: 'cap' | 'free_over' | null,
  offer: { capCents: number | null; freeOverCents: number | null },
): string | null {
  if (applied === 'free_over' && offer.freeOverCents)
    return `free over ${formatPrice(offer.freeOverCents)}`;
  if (applied === 'cap') return 'one shipping price across makers';
  return 'maker’s shipping deal';
}

/** "Add A$45 for free shipping", with a thin progress bar. */
export function FreeShippingProgress({
  toFreeCents,
  freeOverCents,
  testId,
  className = '',
}: {
  toFreeCents: number | null;
  freeOverCents: number | null;
  testId?: string;
  className?: string;
}) {
  if (!toFreeCents || !freeOverCents) return null;
  const done = Math.max(0, Math.min(100, ((freeOverCents - toFreeCents) / freeOverCents) * 100));
  return (
    <div className={className} data-testid={testId}>
      <p className="text-[13px]">Add {formatPrice(toFreeCents)} more for free standard shipping</p>
      <div
        className="mt-1.5 h-[3px] w-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(done)}
        aria-label="Towards free shipping"
      >
        <div className="h-full bg-ink" style={{ width: `${done}%` }} />
      </div>
    </div>
  );
}
