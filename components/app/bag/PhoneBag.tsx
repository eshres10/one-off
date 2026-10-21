import Link from 'next/link';
import type { CartView } from '@/lib/services/cart';
import type { BagDelivery, CheckoutView } from '@/lib/services/checkout';
import type { PaymentsConfig } from '@/components/checkout/CheckoutClient';
import { updateCartAction } from '@/lib/actions/cart';
import { formatPrice } from '@/lib/domain/money';
import { PAYMENT_HELD } from '@/lib/content/returns';
import { SITE } from '@/lib/site/config';
import { Img as Image } from '@/components/ui/Img';
import { MinusIcon, PlusIcon, ShieldIcon } from '@/components/ui/icons';
import { BagExpress } from './BagExpress';
import { appButtonLinkClass } from '../classes';

const TYPE: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

function Qty({ itemId, quantity, max }: { itemId: string; quantity: number; max: number }) {
  const btn = 'flex h-9 w-9 items-center justify-center disabled:text-disabled';
  return (
    <div
      className="inline-flex items-center rounded-pill border border-line-strong"
      role="group"
      aria-label="Quantity"
    >
      <form action={updateCartAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={quantity - 1} />
        <button
          className={btn}
          aria-label={quantity <= 1 ? 'Remove from bag' : 'Decrease quantity'}
        >
          <MinusIcon width={14} height={14} />
        </button>
      </form>
      <span className="w-5 text-center text-[13px]">{quantity}</span>
      <form action={updateCartAction}>
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="quantity" value={quantity + 1} />
        <button className={btn} disabled={quantity >= max} aria-label="Increase quantity">
          <PlusIcon width={14} height={14} />
        </button>
      </form>
    </div>
  );
}

/** The bag on phones: pieces grouped by maker with each maker's delivery, totals, express pay. */
export function PhoneBag({
  cart,
  delivery,
  total,
  express,
  payments,
}: {
  cart: CartView;
  delivery: BagDelivery;
  total: number;
  express: CheckoutView | null;
  payments: PaymentsConfig;
}) {
  const groups = cart.totals.groups;
  return (
    <div className="px-4 pb-8" data-testid="phone-bag">
      {groups.map((g) => (
        <section
          key={g.makerId}
          className="mt-4 rounded-app border border-line bg-surface"
          aria-label={`From ${g.makerName}`}
          data-testid="bag-group"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3 text-[13px]">
            <span>{g.makerName}</span>
            <span className="text-muted" data-testid="bag-group-shipping">
              Delivery {g.shippingCents ? formatPrice(g.shippingCents) : 'free'}
            </span>
          </div>
          <ul className="divide-y divide-line" role="list">
            {g.lines.map((raw) => {
              const line = cart.lines.find((l) => l.id === raw.id) ?? null;
              if (!line) return null;
              return (
                <li key={line.id} className="flex gap-3 px-4 py-3" data-testid="bag-line">
                  <Link
                    href={`/products/${line.productSlug}`}
                    className="relative block h-[100px] w-[80px] shrink-0 overflow-hidden rounded-[8px] bg-stone"
                  >
                    {line.imageUrl && (
                      <Image
                        src={line.imageUrl}
                        alt=""
                        fill
                        sizes="80px"
                        className="object-cover object-top"
                      />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/products/${line.productSlug}`} className="truncate text-[14px]">
                        {line.productTitle}
                      </Link>
                      <span className="shrink-0">
                        {formatPrice(line.unitPriceCents * line.quantity)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-muted">
                      {line.variantLabel.replace(/^AU /, 'Size ')} · {TYPE[line.productType]}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-2" data-dynamic>
                      Est. {line.deliveryEstimate}
                    </p>
                    {line.problem && (
                      <p
                        className="mt-1 rounded-[6px] bg-error-bg px-2 py-1 text-error"
                        role="alert"
                      >
                        {line.problem}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <Qty
                        itemId={line.id}
                        quantity={line.quantity}
                        max={
                          line.productType === 'one_of_one'
                            ? 1
                            : Math.max(1, Math.min(10, line.stockQuantity))
                        }
                      />
                      <form action={updateCartAction}>
                        <input type="hidden" name="itemId" value={line.id} />
                        <input type="hidden" name="quantity" value="0" />
                        <button className="min-h-[36px] text-[12px] text-muted underline underline-offset-[4px]">
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <dl className="mt-5 space-y-1.5 text-[14px]">
        <div className="flex justify-between">
          <dt>Pieces</dt>
          <dd>{formatPrice(cart.totals.subtotalCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Delivery{delivery.from ? ' (from)' : ''}</dt>
          <dd data-testid="bag-delivery">
            {delivery.cents ? formatPrice(delivery.cents) : 'Free'}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-[17px]">
          <dt>Total</dt>
          <dd data-testid="bag-total">{formatPrice(total)}</dd>
        </div>
      </dl>
      <p className="mt-1 text-[12px] text-muted">
        or {SITE.payments.afterpayInstalments} payments of{' '}
        {formatPrice(Math.ceil(total / SITE.payments.afterpayInstalments))} with Afterpay
      </p>

      {cart.hasProblems ? (
        <p className="mt-4 rounded-app bg-error-bg px-3 py-2.5 text-[13px] text-error" role="alert">
          Some pieces in your bag are no longer available. Remove them to check out.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {express && <BagExpress view={express} payments={payments} />}
          <Link
            href="/checkout"
            className={appButtonLinkClass('ink', 'w-full')}
            data-testid="checkout-button"
          >
            Checkout · {formatPrice(total)}
          </Link>
        </div>
      )}
      <p className="mt-4 flex gap-2 text-[12px] text-muted" data-testid="bag-reassurance">
        <ShieldIcon width={16} height={16} className="mt-0.5 shrink-0" />
        <span>{PAYMENT_HELD} Faulty or not as described? We’ll make it right.</span>
      </p>
    </div>
  );
}
