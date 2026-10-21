import Link from 'next/link';
import { ReturnsPolicy } from '@/components/ui/ReturnsPolicy';
import { Img as Image } from '@/components/ui/Img';
import { getSessionUser } from '@/lib/auth/session';
import { formatPrice } from '@/lib/domain/money';
import { updateCartAction } from '@/lib/actions/cart';
import { getCartSessionId } from '@/lib/actions/util';
import { getCart } from '@/lib/services/cart';
import { PREVIEW_MESSAGE, checkoutEnabled } from '@/lib/features';
import { PAYMENT_HELD } from '@/lib/content/returns';

import {
  FreeShippingProgress,
  ShippingPrice,
  ShippingSaving,
  savingReason,
} from '@/components/ui/ShippingPrice';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { ProductBadgePill } from '@/components/ui/Badge';
import { InfoPanel } from '@/components/ui/Panels';
import { MinusIcon, PlusIcon, ShieldIcon } from '@/components/ui/icons';
import { PhoneBag } from '@/components/app/bag/PhoneBag';
import { OrderPlaced } from '@/components/app/bag/OrderPlaced';
import { CartError } from '@/lib/services/cart';
import { bagDeliveryEstimate, openCheckout, type CheckoutView } from '@/lib/services/checkout';
import { env } from '@/lib/env';
import { SITE } from '@/lib/site/config';

export const metadata = { title: 'Your bag' };

function Stepper({ itemId, quantity, max }: { itemId: string; quantity: number; max: number }) {
  const btn = 'flex h-11 w-11 items-center justify-center disabled:text-disabled';
  return (
    <div
      className="inline-flex items-center border border-line-strong"
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
      <span className="w-6 text-center text-[13px]" aria-live="polite">
        {quantity}
      </span>
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

export default async function BagPage({
  searchParams,
}: {
  searchParams: { cancelled?: string; placed?: string };
}) {
  if (!(await checkoutEnabled())) {
    return (
      <div className="container-page pt-16">
        <h1 className="sr-only">Your bag</h1>
        <EmptyState
          title={PREVIEW_MESSAGE}
          action={
            <div className="flex flex-wrap justify-center gap-3" data-testid="checkout-closed">
              <ButtonLink href="/waitlist">Join the waitlist</ButtonLink>
              <ButtonLink href="/saved" variant="secondary">
                View saved pieces
              </ButtonLink>
            </div>
          }
        >
          Save the pieces you love and we’ll let you know as soon as you can buy them.
        </EmptyState>
      </div>
    );
  }
  const [cart, user] = await Promise.all([getCart(getCartSessionId()), getSessionUser()]);
  if (!cart.lines.length && searchParams.placed && /^OO-\d+$/.test(searchParams.placed)) {
    // Just paid with Apple Pay or Google Pay on a phone: the bag is empty, the order is placed.
    return (
      <div className="md:container-page px-4 pt-6 md:pt-16">
        <h1 className="sr-only">Your bag</h1>
        <OrderPlaced number={searchParams.placed} />
      </div>
    );
  }
  if (!cart.lines.length) {
    return (
      <div className="container-page pt-10 md:pt-16" data-testid="bag-empty">
        <h1 className="sr-only">Your bag</h1>
        <EmptyState
          title="Your bag is empty"
          action={
            <ButtonLink href="/" variant="secondary">
              Discover pieces
            </ButtonLink>
          }
        >
          Find something original from an independent Australian maker.
        </EmptyState>
      </div>
    );
  }
  const { totals } = cart;
  const delivery = await bagDeliveryEstimate(cart.lines, user?.id ?? null);
  const total = totals.subtotalCents + delivery.cents;
  // Phones: express pay needs the pending order the checkout works from.
  let express: CheckoutView | null = null;
  if (!cart.hasProblems) {
    const sessionId = getCartSessionId();
    try {
      express = sessionId
        ? await openCheckout({ sessionId, userId: user?.id ?? null, email: user?.email ?? null })
        : null;
    } catch (err) {
      if (!(err instanceof CartError)) throw err;
    }
  }
  const e = env();
  return (
    <>
      <div className="md:hidden">
        <PhoneBag
          cart={cart}
          delivery={delivery}
          total={total}
          express={express}
          payments={{
            driver: e.PAYMENTS_DRIVER,
            publishableKey: e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
            methods: SITE.payments.methods,
            afterpayInstalments: SITE.payments.afterpayInstalments,
            showGst: SITE.tax.showGstIncludedLine,
          }}
        />
      </div>
      <div className="container-page pt-8 max-md:hidden md:pt-12">
        <h1 className="text-center text-[40px] leading-none md:text-left md:text-[56px]">
          Your bag <span className="font-sans text-[14px] text-muted-2">({totals.itemCount})</span>
        </h1>
        {searchParams.cancelled && (
          <p className="mt-4 bg-stone-light px-3 py-2.5 text-[13px]" role="status">
            Checkout was cancelled — your bag is saved.
          </p>
        )}
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16">
          <ul className="min-w-0 border-t border-line" role="list">
            {cart.lines.map((line) => (
              <li
                key={line.id}
                className="flex gap-4 border-b border-line py-5"
                data-testid="bag-line"
              >
                <Link
                  href={`/products/${line.productSlug}`}
                  className="relative aspect-4/5 w-[104px] shrink-0 overflow-hidden bg-stone-light md:w-[128px]"
                >
                  {line.imageUrl && (
                    <Image
                      src={line.imageUrl}
                      alt={line.productTitle}
                      fill
                      sizes="128px"
                      className="object-cover object-top"
                    />
                  )}
                </Link>
                <div className="min-w-0 flex-1 text-[13px]">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/products/${line.productSlug}`}
                      className="text-[14px] font-normal hover:underline"
                    >
                      {line.productTitle}
                    </Link>
                    <p className="shrink-0 text-[14px]">
                      {formatPrice(line.unitPriceCents * line.quantity)}
                    </p>
                  </div>
                  <p className="mt-0.5 text-muted">
                    {line.variantLabel.replace(/^AU /, 'Size ').split(' · ').reverse().join(' · ')}
                  </p>
                  <div className="mt-2">
                    <ProductBadgePill badge={line.productType} outlined />
                  </div>
                  <p className="mt-2">
                    Ships from{' '}
                    <Link
                      href={`/makers/${line.makerSlug}`}
                      className="underline underline-offset-[3px]"
                    >
                      {line.makerName}
                    </Link>
                  </p>
                  <p className="mt-0.5 text-muted" data-dynamic>
                    Estimated delivery {line.deliveryEstimate}
                  </p>
                  <ReturnsPolicy
                    itemType={line.productType}
                    short
                    className="mt-1 text-[12px] text-muted-2"
                    testId="bag-returns-note"
                  />
                  {line.problem && (
                    <p className="mt-2 bg-error-bg px-2 py-1 text-error" role="alert">
                      {line.problem}
                    </p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <Stepper
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
                      <button className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[5px]">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <dl className="space-y-2 text-[14px]">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPrice(totals.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>
                  Standard delivery{' '}
                  <span className="text-muted-2">
                    (from {delivery.makers} maker{delivery.makers === 1 ? '' : 's'}, est.)
                  </span>
                </dt>
                <dd data-testid="bag-delivery">
                  <ShippingPrice
                    paidCents={delivery.cents}
                    listCents={delivery.listCents}
                    from={delivery.from}
                    testId="bag-delivery-price"
                  />
                </dd>
              </div>
              <div className="flex justify-between border-t border-ink pt-3 text-[17px] font-normal">
                <dt>Total (AUD, incl. GST)</dt>
                <dd data-testid="bag-total">{formatPrice(total)}</dd>
              </div>
            </dl>
            <ShippingSaving
              className="mt-3"
              savingCents={delivery.listCents - delivery.cents}
              reason={savingReason(delivery.applied, delivery.offer)}
              testId="bag-shipping-saving"
            />
            <FreeShippingProgress
              className="mt-3"
              toFreeCents={delivery.toFreeCents}
              freeOverCents={
                delivery.offer.enabled && delivery.cents > 0 ? delivery.offer.freeOverCents : null
              }
              testId="bag-free-progress"
            />
            <p className="mt-3 text-[13px] text-muted">
              One payment, one order. Each maker ships their piece separately and you’ll get
              tracking for each.
              {delivery.makers > 1 && delivery.offer.enabled && delivery.offer.capCents !== null
                ? ` Standard shipping is never more than ${formatPrice(delivery.offer.capCents)} in total, however many makers.`
                : ''}
            </p>
            {cart.hasProblems ? (
              <p className="mt-5 bg-error-bg px-3 py-2.5 text-[13px] text-error" role="alert">
                Some pieces in your bag are no longer available. Remove them to check out.
              </p>
            ) : (
              <Link
                href="/checkout"
                className="glass-dark mt-5 flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
                data-testid="checkout-button"
              >
                Checkout · {formatPrice(total)}
              </Link>
            )}
            <InfoPanel className="mt-5 flex gap-3">
              <ShieldIcon width={16} height={16} className="mt-0.5 shrink-0" />
              <span data-testid="bag-reassurance">
                {PAYMENT_HELD} Faulty or not as described? We’ll make it right.
              </span>
            </InfoPanel>
          </aside>
        </div>
      </div>
    </>
  );
}
