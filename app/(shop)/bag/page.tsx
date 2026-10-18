import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { getSessionUser } from '@/lib/auth/session';
import { formatPrice } from '@/lib/domain/money';
import { updateCartAction } from '@/lib/actions/cart';
import { getCartSessionId } from '@/lib/actions/util';
import { getCart } from '@/lib/services/cart';
import { checkoutEnabled } from '@/lib/features';
import { CheckoutForm } from '@/components/cart/CheckoutForm';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import { ProductBadgePill } from '@/components/ui/Badge';
import { TrustBlock } from '@/components/product/TrustBlock';

export const metadata = { title: 'Your bag' };

export default async function BagPage({ searchParams }: { searchParams: { cancelled?: string } }) {
  if (!checkoutEnabled()) {
    return (
      <div className="container-page pt-12">
        <h1 className="sr-only">Your bag</h1>
        <EmptyState
          title="Checkout opens at launch"
          action={<ButtonLink href="/account/saved">View saved pieces</ButtonLink>}
        >
          Save the pieces you love and we’ll let you know as soon as you can buy them.
        </EmptyState>
      </div>
    );
  }
  const [cart, user] = await Promise.all([getCart(getCartSessionId()), getSessionUser()]);
  if (!cart.lines.length) {
    return (
      <div className="container-page pt-12">
        <h1 className="sr-only">Your bag</h1>
        <EmptyState
          title="Your bag is empty"
          action={<ButtonLink href="/">Discover pieces</ButtonLink>}
        >
          Find something original from an independent Australian maker.
        </EmptyState>
      </div>
    );
  }
  const { totals } = cart;
  return (
    <div className="container-page pt-8">
      <h1 className="text-3xl sm:text-4xl">Your bag</h1>
      {searchParams.cancelled && (
        <p className="mt-4 rounded-lg bg-stone-light px-3 py-2 text-sm" role="status">
          Checkout was cancelled — your bag is saved.
        </p>
      )}
      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-8">
          {totals.groups.map((group) => (
            <section
              key={group.makerId}
              aria-label={`Ships from ${group.makerName}`}
              className="card p-4 sm:p-5"
            >
              <div className="flex items-baseline justify-between gap-3 border-b border-stone/70 pb-3">
                <p className="text-sm">
                  Ships from <span className="font-medium">{group.makerName}</span>
                </p>
                <p className="text-sm text-ink-muted">
                  Shipping {group.shippingCents ? formatPrice(group.shippingCents) : 'free'}
                </p>
              </div>
              <ul className="divide-y divide-stone/60" role="list">
                {cart.lines
                  .filter((l) => l.makerId === group.makerId)
                  .map((line) => (
                    <li key={line.id} className="flex gap-4 py-4" data-testid="bag-line">
                      <Link
                        href={`/products/${line.productSlug}`}
                        className="relative aspect-4/5 w-24 shrink-0 overflow-hidden rounded-lg bg-stone-light sm:w-28"
                      >
                        {line.imageUrl && (
                          <Image
                            src={line.imageUrl}
                            alt={line.productTitle}
                            fill
                            sizes="112px"
                            className="object-cover"
                          />
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link
                              href={`/products/${line.productSlug}`}
                              className="font-medium hover:underline"
                            >
                              {line.productTitle}
                            </Link>
                            <p className="text-sm text-ink-muted">{line.variantLabel}</p>
                          </div>
                          <p className="font-medium">
                            {formatPrice(line.unitPriceCents * line.quantity)}
                          </p>
                        </div>
                        <div className="mt-1.5">
                          <ProductBadgePill
                            badge={line.productType}
                            className="border border-stone/70"
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-ink-muted">
                          Estimated delivery {line.deliveryEstimate}
                        </p>
                        {line.problem && (
                          <p className="mt-1.5 text-sm text-alert" role="alert">
                            {line.problem}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                          {line.productType !== 'one_of_one' && (
                            <form action={updateCartAction} className="flex items-center gap-2">
                              <input type="hidden" name="itemId" value={line.id} />
                              <label htmlFor={`qty-${line.id}`} className="text-sm text-ink-muted">
                                Qty
                              </label>
                              <select
                                id={`qty-${line.id}`}
                                name="quantity"
                                defaultValue={line.quantity}
                                className="input w-auto py-1.5 pr-8 text-sm"
                              >
                                {Array.from(
                                  {
                                    length: Math.max(
                                      1,
                                      Math.min(10, line.stockQuantity || line.quantity),
                                    ),
                                  },
                                  (_, i) => i + 1,
                                ).map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="text-sm underline underline-offset-4"
                              >
                                Update
                              </button>
                            </form>
                          )}
                          <form action={updateCartAction}>
                            <input type="hidden" name="itemId" value={line.id} />
                            <input type="hidden" name="quantity" value="0" />
                            <button
                              type="submit"
                              className="text-sm text-ink-muted underline underline-offset-4 hover:text-ink"
                            >
                              Remove
                            </button>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-4 p-5">
            <h2 className="font-sans text-base font-semibold">Order summary</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt>
                  Subtotal ({totals.itemCount} {totals.itemCount === 1 ? 'piece' : 'pieces'})
                </dt>
                <dd>{formatPrice(totals.subtotalCents)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>
                  Shipping{totals.groups.length > 1 ? ` (${totals.groups.length} makers)` : ''}
                </dt>
                <dd>{totals.shippingCents ? formatPrice(totals.shippingCents) : 'Free'}</dd>
              </div>
              <div className="flex justify-between border-t border-stone/70 pt-2 text-base font-semibold">
                <dt>Total (AUD)</dt>
                <dd data-testid="bag-total">{formatPrice(totals.totalCents)}</dd>
              </div>
            </dl>
            <CheckoutForm
              signedInEmail={user?.email ?? null}
              disabled={cart.hasProblems}
              total={formatPrice(totals.totalCents)}
            />
          </div>
          <div className="mt-4">
            <TrustBlock
              shipping="Each maker ships their piece directly with tracking. Shipping shown is the total you pay."
              returns="Ready-to-ship pieces can be returned within 14 days. Made-to-order and one-of-one pieces are final sale unless faulty."
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
