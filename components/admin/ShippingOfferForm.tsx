'use client';

import { useFormState } from 'react-dom';
import { setShippingOfferAction } from '@/lib/actions/shipping';
import type { ShippingOffer } from '@/lib/shipping/offer';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';

const dollars = (cents: number | null) => (cents === null ? '' : String(cents / 100));

function Money({
  id,
  label,
  hint,
  value,
}: {
  id: string;
  label: string;
  hint: string;
  value: number | null;
}) {
  return (
    <div>
      <label htmlFor={`ship-${id}`} className="label">
        {label}
      </label>
      <div className="flex max-w-[220px] items-center gap-2">
        <span className="text-[14px] text-muted">A$</span>
        <input
          id={`ship-${id}`}
          name={id}
          type="number"
          min={0}
          step="0.5"
          defaultValue={dollars(value)}
          className="input"
          data-testid={`ship-${id}`}
        />
      </div>
      <p className="mt-1 text-[12px] text-muted">{hint}</p>
    </div>
  );
}

export function ShippingOfferForm({ offer }: { offer: ShippingOffer }) {
  const [state, action] = useFormState<FormState, FormData>(setShippingOfferAction, undefined);
  return (
    <form action={action} className="max-w-xl space-y-6" data-testid="shipping-offer-form">
      <label className="flex items-start gap-3 border border-line p-4">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={offer.enabled}
          className="mt-1"
          data-testid="ship-enabled"
        />
        <span>
          <span className="block text-[15px]">Shipping offer on</span>
          <span className="block text-[13px] text-muted">
            Buyers pay less for standard shipping across makers. Makers are still paid their full
            rate; One Off covers the difference.
          </span>
        </span>
      </label>
      <Money
        id="extraMaker"
        label="Each extra maker adds"
        hint="The dearest parcel is charged in full; every other maker adds at most this."
        value={offer.extraMakerCents}
      />
      <Money
        id="cap"
        label="Never more than"
        hint="The most a buyer pays for standard shipping, however many makers. Empty: no cap."
        value={offer.capCents}
      />
      <Money
        id="freeOver"
        label="Free shipping over"
        hint="Standard shipping is free when the bag's pieces reach this. Empty: off."
        value={offer.freeOverCents}
      />
      <Money
        id="monthlyBudget"
        label="Monthly budget"
        hint="Once One Off has covered this much shipping in a month, buyers pay makers' own rates until the 1st. Empty: no limit."
        value={offer.monthlyBudgetCents}
      />
      {state?.message && (
        <p className={`text-[13px] ${state.ok ? 'text-muted' : 'text-error'}`} role="status">
          {state.message}
        </p>
      )}
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
