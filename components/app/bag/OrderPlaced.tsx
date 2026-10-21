import Link from 'next/link';
import { appButtonLinkClass } from '../classes';

/** After express pay on the bag: the order number, what happens next, and "Track my order". */
export function OrderPlaced({ number }: { number: string }) {
  return (
    <div
      className="rounded-app bg-ink px-5 py-6 text-ground"
      data-testid="order-placed"
      role="status"
    >
      <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">Order {number}</p>
      <p className="mt-2 font-display text-[30px] leading-none">Order placed.</p>
      <p className="mt-2 text-[13px] text-ground/80">
        Your payment is held until it arrives. Each maker ships their piece separately.
      </p>
      <Link
        href="/you?tab=orders"
        className={appButtonLinkClass('ink', 'mt-5 w-full bg-ground !text-ink')}
        data-testid="track-my-order"
      >
        Track my order
      </Link>
    </div>
  );
}
