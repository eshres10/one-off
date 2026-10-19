'use client';

import { AddressElement } from '@stripe/react-stripe-js';
import { useEffect, useRef, useState, useTransition } from 'react';
import { saveDeliveryAction, setSpeedAction } from '@/lib/actions/checkout';
import { formatPrice } from '@/lib/domain/money';
import type { CheckoutAddress, CheckoutView } from '@/lib/services/checkout';
import { Img as Image } from '@/components/ui/Img';
import { stepButton } from './DetailsStep';
import { useStripeReady } from './StripeProvider';

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];
const TYPE: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};
const EMPTY: CheckoutAddress = {
  name: '',
  line1: '',
  line2: '',
  suburb: '',
  state: '',
  postcode: '',
};

const complete = (a: CheckoutAddress) =>
  a.name.trim().length > 1 &&
  a.line1.trim().length > 2 &&
  a.suburb.trim() &&
  STATES.includes(a.state) &&
  /^\d{4}$/.test(a.postcode);

const oneLine = (a: CheckoutAddress) =>
  `${a.line1}${a.line2 ? `, ${a.line2}` : ''}, ${a.suburb} ${a.state} ${a.postcode}`;

/** Address fields when Stripe's Address Element isn't available (local and test builds). */
function PlainAddress({
  value,
  onChange,
}: {
  value: CheckoutAddress;
  onChange: (a: CheckoutAddress) => void;
}) {
  const set =
    (k: keyof CheckoutAddress) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-4" data-testid="address-fields">
      <div>
        <label htmlFor="co-name" className="label">
          Full name
        </label>
        <input
          id="co-name"
          value={value.name}
          onChange={set('name')}
          autoComplete="name"
          className="input"
        />
      </div>
      <div>
        <label htmlFor="co-line1" className="label">
          Address
        </label>
        <input
          id="co-line1"
          value={value.line1}
          onChange={set('line1')}
          autoComplete="address-line1"
          placeholder="Start typing your address"
          className="input"
        />
      </div>
      <div className="grid grid-cols-[1fr_96px_96px] gap-3">
        <div>
          <label htmlFor="co-suburb" className="label">
            Suburb
          </label>
          <input
            id="co-suburb"
            value={value.suburb}
            onChange={set('suburb')}
            autoComplete="address-level2"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="co-state" className="label">
            State
          </label>
          <select
            id="co-state"
            value={value.state}
            onChange={set('state')}
            autoComplete="address-level1"
            className="input"
          >
            <option value="">–</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="co-postcode" className="label">
            Postcode
          </label>
          <input
            id="co-postcode"
            value={value.postcode}
            onChange={set('postcode')}
            autoComplete="postal-code"
            inputMode="numeric"
            maxLength={4}
            className="input"
          />
        </div>
      </div>
    </div>
  );
}

/** Stripe's Address Element (country locked to AU, with address autocomplete). */
function StripeAddress({
  value,
  onChange,
}: {
  value: CheckoutAddress;
  onChange: (a: CheckoutAddress) => void;
}) {
  return (
    <AddressElement
      options={{
        mode: 'shipping',
        allowedCountries: ['AU'],
        autocomplete: { mode: 'automatic' },
        fields: { phone: 'never' },
        defaultValues: {
          name: value.name,
          address: {
            line1: value.line1,
            line2: value.line2,
            city: value.suburb,
            state: value.state,
            postal_code: value.postcode,
            country: 'AU',
          },
        },
      }}
      onChange={(e) => {
        const a = e.value.address;
        onChange({
          name: e.value.name ?? '',
          line1: a.line1 ?? '',
          line2: a.line2 ?? '',
          suburb: a.city ?? '',
          state: (a.state ?? '').toUpperCase(),
          postcode: a.postal_code ?? '',
        });
      }}
    />
  );
}

/** 02 Delivery: where it's going, then a card per maker with Standard or Express. */
export function DeliveryStep({
  view,
  onChange,
  onSaved,
  setBusy,
}: {
  view: CheckoutView;
  onChange: (v: CheckoutView) => void;
  onSaved: (v: CheckoutView) => void;
  setBusy: (b: boolean) => void;
}) {
  const stripe = useStripeReady();
  const saved = view.savedAddresses;
  const [chosen, setChosen] = useState<string | 'new'>(
    saved.length ? (saved.find((a) => a.isDefault) ?? saved[0])!.id : 'new',
  );
  const [address, setAddress] = useState<CheckoutAddress>(view.address ?? EMPTY);
  const [editing, setEditing] = useState(!view.address || !complete(view.address));
  const [giftOpen, setGiftOpen] = useState(false);
  const [gift, setGift] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const speeds = useRef<Record<string, string>>(
    Object.fromEntries(view.parcels.map((p) => [p.makerId, p.speed])),
  );

  const current: CheckoutAddress =
    chosen !== 'new' ? (saved.find((a) => a.id === chosen) ?? address) : address;

  // Re-price for the buyer's state as soon as there's a full address (without leaving the step).
  const lastPriced = useRef('');
  useEffect(() => {
    if (!complete(current)) return;
    const key = `${current.state}|${current.postcode}|${current.line1}`;
    if (key === lastPriced.current) return;
    const t = setTimeout(async () => {
      lastPriced.current = key;
      const res = await saveDeliveryAction({
        address: current,
        speeds: speeds.current,
        advance: false,
      });
      if (res.ok) onChange(res.view);
    }, 400);
    return () => clearTimeout(t);
  }, [current, onChange]);

  const pickSpeed = (makerId: string, speed: string) => {
    speeds.current = { ...speeds.current, [makerId]: speed };
    start(async () => {
      const res = await setSpeedAction(makerId, speed);
      if (res.ok) onChange(res.view);
    });
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    start(async () => {
      const res = await saveDeliveryAction({
        address: current,
        speeds: speeds.current,
        giftNote: giftOpen ? gift : undefined,
      });
      setBusy(false);
      if (!res.ok) setError(res.message);
      else {
        setError(null);
        onSaved(res.view);
      }
    });
  };

  return (
    <form id="checkout-form-2" onSubmit={submit} className="space-y-6" noValidate>
      {saved.length > 0 && (
        <fieldset>
          <legend className="label">Deliver to</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {saved.map((a) => (
              <label
                key={a.id}
                className={`flex cursor-pointer gap-3 border p-4 text-[13px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${chosen === a.id ? 'border-ink' : 'border-line-strong'}`}
              >
                <input
                  type="radio"
                  name="saved-address"
                  checked={chosen === a.id}
                  onChange={() => setChosen(a.id)}
                  className="mt-1 accent-ink"
                />
                <span>
                  <span className="block text-[11px] uppercase tracking-label text-muted-2">
                    {a.label}
                    {a.isDefault ? ' · Default' : ''}
                  </span>
                  <span className="mt-1 block">{a.name}</span>
                  <span className="block text-muted">{oneLine(a)}</span>
                </span>
              </label>
            ))}
            <label
              className={`flex cursor-pointer items-center gap-3 border p-4 text-[13px] ${chosen === 'new' ? 'border-ink' : 'border-line-strong'}`}
            >
              <input
                type="radio"
                name="saved-address"
                checked={chosen === 'new'}
                onChange={() => setChosen('new')}
                className="accent-ink"
              />
              A new address
            </label>
          </div>
        </fieldset>
      )}

      {chosen === 'new' &&
        (editing || !complete(address) ? (
          <div>
            {stripe ? (
              <StripeAddress value={address} onChange={setAddress} />
            ) : (
              <PlainAddress value={address} onChange={setAddress} />
            )}
            {complete(address) && !stripe && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="mt-3 min-h-[44px] text-[12px] underline underline-offset-4"
              >
                Use this address
              </button>
            )}
          </div>
        ) : (
          <div>
            <div
              className="flex items-start justify-between gap-4 border border-ink p-4 text-[13px]"
              data-testid="address-card"
            >
              <span>
                <span className="block">{address.name}</span>
                <span className="block text-muted">{oneLine(address)}</span>
              </span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="min-h-[32px] text-[12px] underline underline-offset-4"
              >
                Edit
              </button>
            </div>
            <label htmlFor="co-line2" className="label mt-4">
              Apartment, unit (optional)
            </label>
            <input
              id="co-line2"
              value={address.line2}
              onChange={(e) => setAddress({ ...address, line2: e.target.value })}
              autoComplete="address-line2"
              className="input"
            />
          </div>
        ))}

      <div>
        <p className="text-[13px] text-muted">
          Each maker sends their piece from their own studio, so you’ll get{' '}
          {view.parcels.length === 1 ? 'one parcel' : `${view.parcels.length} parcels`}, each with
          its own tracking.
        </p>
        <ul className="mt-4 space-y-3" role="list">
          {view.parcels.map((p) => (
            <li
              key={p.fulfilmentId}
              className="border border-line bg-surface p-4"
              data-testid="parcel"
            >
              <div className="flex gap-3">
                <span className="relative h-[80px] w-[64px] shrink-0 overflow-hidden bg-stone">
                  {p.items[0]?.imageUrl && (
                    <Image
                      src={p.items[0].imageUrl}
                      alt=""
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px]">From {p.makerName}</p>
                  <p className="text-[12px] text-muted">{p.makerPlace}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {Array.from(new Set(p.items.map((i) => i.productType))).map((t) => (
                      <span
                        key={t}
                        className="border border-line-strong px-2 py-0.5 text-[10px] uppercase tracking-label"
                      >
                        {TYPE[t]}
                      </span>
                    ))}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-muted">
                    {p.items.map((i) => i.title).join(', ')}
                  </p>
                </div>
              </div>
              <fieldset className="mt-4 space-y-2">
                <legend className="sr-only">Delivery from {p.makerName}</legend>
                {(['standard', 'express'] as const).map((s) => (
                  <label
                    key={s}
                    className={`flex cursor-pointer items-center gap-3 border px-3 py-2.5 text-[13px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 ${p.speed === s ? 'border-ink' : 'border-line'}`}
                  >
                    <input
                      type="radio"
                      name={`speed-${p.makerId}`}
                      checked={p.speed === s}
                      onChange={() => pickSpeed(p.makerId, s)}
                      className="accent-ink"
                      data-testid={`speed-${s}`}
                    />
                    <span className="flex-1">
                      {s === 'standard' ? 'Standard' : 'Express'} ·{' '}
                      {p.options[s].cents ? formatPrice(p.options[s].cents) : 'Free'}
                      <span className="block text-[12px] text-muted">
                        Arrives {p.options[s].arrival}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
              {p.mtoNote && <p className="mt-3 bg-stone p-3 text-[13px]">{p.mtoNote}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div>
        {giftOpen ? (
          <>
            <label htmlFor="co-gift" className="label">
              Gift note (the makers include it, with no prices)
            </label>
            <textarea
              id="co-gift"
              value={gift}
              onChange={(e) => setGift(e.target.value)}
              maxLength={300}
              rows={3}
              className="input min-h-[88px] py-3"
            />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setGiftOpen(true)}
            className="min-h-[44px] text-[12px] underline underline-offset-4"
          >
            Add a gift note
          </button>
        )}
      </div>

      {error && (
        <p className="text-[13px] text-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${stepButton} max-md:hidden`}>
        {pending ? 'Saving…' : 'Continue to payment'}
      </button>
    </form>
  );
}
