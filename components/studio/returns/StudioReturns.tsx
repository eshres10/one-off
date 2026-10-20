import { formatPrice } from '@/lib/domain/money';
import { RETURN_REASONS, RETURN_STATUS_LABEL } from '@/lib/returns/status';
import type { ReturnView } from '@/lib/services/returns';
import { carrierLabel, trackingUrl } from '@/lib/studio/carriers';
import { ReturnActions } from './ReturnActions';

const day = (d: Date) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Sydney',
  });

/** What the maker is waiting for, and by when. */
function due(r: ReturnView): string {
  if (r.status === 'refunded') return r.refundedAt ? `Refunded ${day(r.refundedAt)}` : 'Refunded';
  if (r.status === 'disputed') return 'Off One is deciding';
  if (!['requested', 'in_transit'].includes(r.status)) return '—';
  if (r.confirmBy) return `Confirm by ${day(r.confirmBy)}`;
  return `Buyer posts by ${day(r.sendBy)}`;
}

/** Studio → Orders → Returns: change-of-mind returns on their way back, and what's been settled. */
export function StudioReturns({ returns }: { returns: ReturnView[] }) {
  if (!returns.length)
    return (
      <p className="py-16 text-center text-[14px] text-muted" data-testid="returns-empty">
        Nothing coming back. If a buyer returns a ready-to-ship piece (within 14 days, unworn, with
        tags), it shows here.
      </p>
    );
  return (
    <ul
      className="mt-2 divide-y divide-line border-b border-line"
      role="list"
      data-testid="studio-returns"
    >
      {returns.map((r) => {
        const link = trackingUrl(r.carrier, r.tracking);
        const live = r.status === 'requested' || r.status === 'in_transit';
        return (
          <li
            key={r.id}
            className="grid gap-4 py-5 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-center"
            data-testid="return-row"
          >
            <div className="flex min-w-0 gap-3">
              <span className="relative aspect-4/5 w-12 shrink-0 overflow-hidden bg-stone">
                {r.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.imageUrl} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <div className="min-w-0 text-[13px]">
                <p className="truncate text-[14px]">{r.productTitle}</p>
                <p className="text-muted">
                  {r.number} · {r.variantLabel.replace(/^AU /, 'Size ')} · {r.buyerFirstName} ·
                  order #{r.orderNumber.replace(/^OO-/, '')}
                </p>
                <p className="text-muted">
                  {formatPrice(r.lineTotalCents)}
                  {r.reason
                    ? ` · ${RETURN_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}`
                    : ''}
                </p>
              </div>
            </div>
            <div className="text-[13px]">
              <p data-testid="return-status-label">{RETURN_STATUS_LABEL[r.status]}</p>
              <p className="text-muted">
                {r.tracking ? (
                  link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-[3px]"
                    >
                      {carrierLabel(r.carrier === 'other' ? null : r.carrier) ?? ''} {r.tracking}
                    </a>
                  ) : (
                    `${carrierLabel(r.carrier === 'other' ? null : r.carrier) ?? ''} ${r.tracking}`.trim()
                  )
                ) : live ? (
                  'No tracking yet'
                ) : null}
              </p>
              <p className="text-muted" data-testid="return-due">
                {due(r)}
              </p>
            </div>
            <div className="md:text-right">
              {live && <ReturnActions returnId={r.id} number={r.number} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
