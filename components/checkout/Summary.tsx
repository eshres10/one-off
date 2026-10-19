'use client';

import { useState } from 'react';
import type { CheckoutView } from '@/lib/services/checkout';
import { formatPrice } from '@/lib/domain/money';
import { ChevronIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';

function CodeField() {
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string | null>(null);
  return (
    <div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) setNote('Gift cards and codes aren’t available yet.');
        }}
      >
        <label htmlFor="checkout-code" className="sr-only">
          Gift card or code
        </label>
        <input
          id="checkout-code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setNote(null);
          }}
          placeholder="Gift card or code"
          className="input min-h-[44px] flex-1 bg-surface"
          autoComplete="off"
        />
        <button
          type="submit"
          className="min-h-[44px] border border-ink px-4 text-[11px] uppercase tracking-label"
        >
          Apply
        </button>
      </form>
      {note && (
        <p className="mt-2 text-[12px] text-muted" role="status">
          {note}
        </p>
      )}
    </div>
  );
}

export function Totals({ view, showGst }: { view: CheckoutView; showGst: boolean }) {
  return (
    <dl className="space-y-2 text-[14px]" data-testid="checkout-totals">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{formatPrice(view.subtotalCents)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>
          Delivery · {view.parcels.length} {view.parcels.length === 1 ? 'parcel' : 'parcels'}
        </dt>
        <dd>{view.shippingCents ? formatPrice(view.shippingCents) : 'Free'}</dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-ink pt-3">
        <dt className="text-[16px]">Total</dt>
        <dd className="font-display text-[28px] leading-none" data-testid="checkout-total">
          {formatPrice(view.totalCents)}
        </dd>
      </div>
      {showGst && (
        <p className="text-right text-[12px] text-muted">
          AUD, includes {formatPrice(view.gstCents)} GST
        </p>
      )}
    </dl>
  );
}

function Items({ view }: { view: CheckoutView }) {
  return (
    <div className="space-y-5">
      {view.parcels.map((p) => (
        <div key={p.fulfilmentId}>
          <p className="text-[11px] uppercase tracking-label text-muted-2">From {p.makerName}</p>
          <ul className="mt-2 space-y-3" role="list">
            {p.items.map((i) => (
              <li key={i.id} className="flex gap-3">
                <span className="relative h-[72px] w-[58px] shrink-0 overflow-hidden bg-ground">
                  {i.imageUrl && (
                    <Image src={i.imageUrl} alt="" fill sizes="58px" className="object-cover" />
                  )}
                  {i.quantity > 1 && (
                    <span className="absolute right-0 top-0 bg-ink px-1.5 text-[10px] text-ground">
                      {i.quantity}
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1 text-[13px]">
                  <span className="block truncate">{i.title}</span>
                  <span className="block text-muted">{i.variantLabel}</span>
                </span>
                <span className="text-[13px]">{formatPrice(i.unitPriceCents * i.quantity)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Desktop: the sticky stone summary, grouped by maker. */
export function Summary({ view, showGst }: { view: CheckoutView; showGst: boolean }) {
  return (
    <div className="bg-stone p-6" data-testid="checkout-summary">
      <h2 className="font-display text-[26px] leading-none">Your order</h2>
      <p className="mt-1 text-[12px] text-muted">
        {view.pieces} {view.pieces === 1 ? 'piece' : 'pieces'} from {view.parcels.length}{' '}
        {view.parcels.length === 1 ? 'maker' : 'makers'}
      </p>
      <div className="mt-5">
        <Items view={view} />
      </div>
      <div className="mt-5 border-t border-line-strong pt-5">
        <CodeField />
      </div>
      <div className="mt-5">
        <Totals view={view} showGst={showGst} />
      </div>
    </div>
  );
}

/** Phone: "Show order summary · 3 pieces / A$1,014", opening into the items and totals. */
export function SummaryBar({ view }: { view: CheckoutView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="-mx-4 bg-stone md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="checkout-summary-phone"
        className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-[13px]"
        data-testid="summary-bar"
      >
        <span className="flex items-center gap-2">
          {open ? 'Hide' : 'Show'} order summary · {view.pieces}{' '}
          {view.pieces === 1 ? 'piece' : 'pieces'}
          <span className={`inline-flex transition-transform ${open ? 'rotate-180' : ''}`}>
            <ChevronIcon dir="down" width={14} height={14} />
          </span>
        </span>
        <span className="font-display text-[20px]">{formatPrice(view.totalCents)}</span>
      </button>
      <div
        id="checkout-summary-phone"
        hidden={!open}
        className="border-t border-line-strong px-4 pb-5 pt-4"
      >
        <Items view={view} />
        <div className="mt-5">
          <CodeField />
        </div>
        <div className="mt-5">
          <Totals view={view} showGst />
        </div>
      </div>
    </div>
  );
}
