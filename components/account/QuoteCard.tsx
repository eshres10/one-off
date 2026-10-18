import type { QuoteView } from '@/lib/queries/account';
import { formatPrice } from '@/lib/domain/money';
import { StatusPill } from '@/components/ui/Badge';

export function QuoteCard({ quote, children }: { quote: QuoteView; children?: React.ReactNode }) {
  return (
    <div className="card p-5" data-testid="quote">
      <div className="flex items-center justify-between">
        <p className="font-medium">
          Quote · {new Date(quote.createdAt).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
        </p>
        <StatusPill status={quote.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-ink-muted">Total price</dt>
          <dd className="font-medium">{formatPrice(quote.totalPriceCents)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Deposit</dt>
          <dd className="font-medium">{formatPrice(quote.depositCents)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Production time</dt>
          <dd>{quote.productionDays} days</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Revisions included</dt>
          <dd>{quote.revisionsIncluded}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Shipping</dt>
          <dd>{formatPrice(quote.shippingCents)}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Estimated delivery</dt>
          <dd>
            {quote.estimatedDeliveryDate
              ? new Date(quote.estimatedDeliveryDate).toLocaleDateString('en-AU', {
                  dateStyle: 'medium',
                })
              : '—'}
          </dd>
        </div>
      </dl>
      {quote.message && (
        <p className="mt-3 whitespace-pre-line rounded-lg bg-stone-light/60 p-3 text-sm">
          {quote.message}
        </p>
      )}
      {children}
    </div>
  );
}
