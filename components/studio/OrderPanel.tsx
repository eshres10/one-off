import Link from 'next/link';
import { messageBuyerAction } from '@/lib/actions/studio-orders';
import { formatPrice } from '@/lib/domain/money';
import { TERMS } from '@/lib/studio/terms';
import { dayLabel, shipByLabel, daysUntil } from '@/lib/studio/format';
import { carrierLabel, trackingUrl, type StudioOrderDetail } from '@/lib/services/studio-orders';
import { Img as Image } from '@/components/ui/Img';
import { MakingSteps, ShipForm } from './OrderForms';
import { OrderStatusPill } from './StatusPill';

const SALE_TYPE: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line py-5">
      <h3 className="mb-3 font-sans text-[11px] font-normal uppercase tracking-label text-muted-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function OrderPanelTitle({ order }: { order: StudioOrderDetail }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-label text-muted-2">
        Order #{order.orderNumber.replace(/^OO-/, '')} ·{' '}
        {new Date(order.placedAt).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'short',
          timeZone: 'Australia/Melbourne',
        })}
      </p>
      <h2 className="mt-1 font-display text-[30px] leading-tight">{order.buyerName ?? 'Buyer'}</h2>
      <div className="mt-1.5">
        <OrderStatusPill status={order.status} mto={order.isMto} />
      </div>
    </div>
  );
}

/** Everything about one order: the piece, making progress, shipping, payout and actions. */
export function OrderPanel({ order }: { order: StudioOrderDetail }) {
  const canShip =
    ['paid', 'preparing', 'ready'].includes(order.status) ||
    (order.status === 'making' && order.mtoStep >= 3);
  const shipDays = daysUntil(order.shipBy);
  const urgent = shipDays !== null && shipDays <= 0 && canShip;
  const to = order.shipTo ?? {};
  const link = trackingUrl(order.carrier, order.trackingNumber);
  const pct = order.commissionPct;
  return (
    <div data-testid="order-panel">
      <Section title="The piece">
        <ul className="space-y-4" role="list">
          {order.items.map((i) => (
            <li key={i.id} className="flex gap-3">
              <span className="relative aspect-4/5 w-16 shrink-0 overflow-hidden bg-stone">
                {i.imageUrl && (
                  <Image
                    src={i.imageUrl}
                    alt=""
                    fill
                    sizes="64px"
                    className="object-cover object-top"
                  />
                )}
              </span>
              <div className="min-w-0 text-[13px]">
                <p className="font-normal">{i.title}</p>
                <p className="text-muted">
                  {i.variantLabel.replace(/^AU /, 'Size ')}
                  {i.quantity > 1 ? ` × ${i.quantity}` : ''} · {SALE_TYPE[i.productType]}
                </p>
                {i.customMeasurements && (
                  <p className="mt-1 text-[12px] text-muted">
                    Measurements:{' '}
                    {Object.entries(i.customMeasurements)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(' · ')}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {order.giftNote && (
          <p className="mt-4 bg-stone px-3 py-2.5 text-[13px]" data-testid="gift-note">
            <span className="block text-[10px] uppercase tracking-label text-muted-2">
              Gift note
            </span>
            “{order.giftNote}”
          </p>
        )}
      </Section>

      {order.isMto && !['shipped', 'delivered', 'completed', 'refunded'].includes(order.status) && (
        <Section title="Making progress">
          <MakingSteps fulfilmentId={order.id} step={order.mtoStep} />
          <p className="mt-2 text-[12px] text-muted">
            The buyer sees each step, and gets an email at Sewing and at Ready.
          </p>
        </Section>
      )}

      <Section title="Shipping">
        <dl className="grid grid-cols-[96px_1fr] gap-y-2 text-[13px]">
          <dt className="text-muted-2">Ship to</dt>
          <dd>
            <address className="not-italic">
              {[
                to.name,
                to.line1,
                to.line2,
                [to.city, to.state, to.postal_code].filter(Boolean).join(' '),
              ]
                .filter(Boolean)
                .map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
            </address>
          </dd>
          <dt className="text-muted-2">They paid</dt>
          <dd>
            {order.shippingCents ? formatPrice(order.shippingCents) : 'Free'} ·{' '}
            {order.shippingMethod ?? 'Standard tracked'}
          </dd>
          <dt className="text-muted-2">Ship by</dt>
          <dd className={urgent ? 'text-alert' : ''} data-testid="panel-ship-by">
            {order.shipBy ? `${dayLabel(order.shipBy)} · ${shipByLabel(order.shipBy)}` : '—'}
          </dd>
          {order.trackingNumber || order.carrier ? (
            <>
              <dt className="text-muted-2">Sent with</dt>
              <dd>
                {carrierLabel(order.carrier)}
                {order.trackingNumber && (
                  <>
                    {' · '}
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer" className="link">
                        {order.trackingNumber}
                      </a>
                    ) : (
                      order.trackingNumber
                    )}
                  </>
                )}
              </dd>
            </>
          ) : null}
          {order.deliveredAt && (
            <>
              <dt className="text-muted-2">Delivered</dt>
              <dd>{dayLabel(new Date(order.deliveredAt))}</dd>
            </>
          )}
        </dl>
      </Section>

      {canShip && (
        <Section title="Mark as shipped">
          <ShipForm fulfilmentId={order.id} />
        </Section>
      )}

      {order.claim && (
        <Section title="Problem reported">
          <p className="text-[13px] text-alert">
            The buyer reported a fault. Your payout for this order is held until it’s sorted.{' '}
            <Link href={`/studio/claims/${order.claim.id}`} className="link text-ink">
              View the claim
            </Link>
          </p>
        </Section>
      )}

      <Section title="Your payout">
        <dl className="space-y-1.5 text-[13px]" data-testid="panel-payout">
          <div className="flex justify-between">
            <dt>Piece</dt>
            <dd>{formatPrice(order.subtotalCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>{formatPrice(order.shippingCents)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>
              Commission ({pct}%{pct === TERMS.foundingCommissionPct ? ', founding maker' : ''})
            </dt>
            <dd>−{formatPrice(order.commissionCents)}</dd>
          </div>
          <div className="flex justify-between text-muted">
            <dt>Card processing</dt>
            <dd>−{formatPrice(order.processingFeeCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 font-display text-[22px]">
            <dt>You get</dt>
            <dd data-testid="panel-you-get">{formatPrice(order.sellerNetCents)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-[12px] text-muted">
          {order.transferReleasedAt
            ? `Released ${dayLabel(new Date(order.transferReleasedAt))}, paid out on your next ${TERMS.payoutWeekday[0]!.toUpperCase()}${TERMS.payoutWeekday.slice(1)} payout.`
            : `Released ${TERMS.releaseDaysAfterDelivery} days after delivery, then paid out weekly.`}
        </p>
      </Section>

      <div className="flex gap-2 border-t border-line pt-5">
        <form action={messageBuyerAction} className="flex-1">
          <input type="hidden" name="fulfilmentId" value={order.id} />
          <button
            type="submit"
            disabled={!order.buyerUserId}
            title={order.buyerUserId ? undefined : 'Guest checkout: no account to message'}
            className="min-h-[48px] w-full border border-ink text-[11px] uppercase tracking-[0.16em] hover:bg-ink hover:text-ground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Message buyer
          </button>
        </form>
        <a
          href={`/studio/orders/${order.id}/packing-slip`}
          className="flex min-h-[48px] flex-1 items-center justify-center border border-line-strong text-[11px] uppercase tracking-[0.16em] hover:border-ink"
          data-testid="packing-slip"
        >
          Packing slip
        </a>
      </div>
    </div>
  );
}
