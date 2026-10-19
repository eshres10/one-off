'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import {
  makeDefaultAddressAction,
  removeAddressAction,
  saveAddressAction,
} from '@/lib/actions/account';
import type { FormState } from '@/lib/validation';
import type { SavedAddress } from '@/lib/services/buyer-profile';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';
import { SITE } from '@/lib/site/config';

const input = 'min-h-[48px] w-full border border-line-strong bg-surface px-3 text-[15px]';
const small = 'min-h-[44px] text-[12px] underline underline-offset-[3px]';

function AddressForm({ address, onDone }: { address?: SavedAddress; onDone: () => void }) {
  const [state, action] = useFormState<FormState, FormData>(saveAddressAction, undefined);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const field = (name: keyof SavedAddress, label: string, auto: string, extra = '') => (
    <label className={`block text-[11px] uppercase tracking-label ${extra}`}>
      {label}
      <input
        name={name}
        autoComplete={auto}
        defaultValue={(address?.[name] as string | undefined) ?? ''}
        className={`${input} mt-1.5 normal-case tracking-normal`}
        data-testid={`addr-${name}`}
      />
    </label>
  );
  return (
    <form action={action} className="space-y-4 bg-surface p-4" data-testid="address-form">
      {address && <input type="hidden" name="id" value={address.id} />}
      <div className="grid grid-cols-2 gap-3">
        {field('label', 'Label', 'off')}
        {field('name', 'Name', 'name')}
      </div>
      {field('line1', 'Street address', 'address-line1')}
      {field('line2', 'Apartment, unit (optional)', 'address-line2')}
      <div className="grid grid-cols-[1fr_88px_96px] gap-3">
        {field('suburb', 'Suburb', 'address-level2')}
        <label className="block text-[11px] uppercase tracking-label">
          State
          <select
            name="state"
            defaultValue={address?.state ?? ''}
            className={`${input} mt-1.5 px-2`}
            data-testid="addr-state"
          >
            <option value="" />
            {SITE.makerRegions.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {field('postcode', 'Postcode', 'postal-code')}
      </div>
      {!address?.isDefault && (
        <label className="flex min-h-[44px] items-center gap-2 text-[13px]">
          <input type="checkbox" name="makeDefault" className="h-4 w-4 accent-ink" />
          Make this my default
        </label>
      )}
      <FormAlert message={state?.ok ? undefined : state?.message} tone="error" />
      <div className="flex items-center gap-4">
        <SubmitButton>Save address</SubmitButton>
        <button type="button" onClick={onDone} className={small}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Saved addresses as cards: Default or the label, Edit, Make default, Remove, and Add. */
export function AddressCards({ addresses }: { addresses: SavedAddress[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {addresses.map((a) =>
        editing === a.id ? (
          <div key={a.id} className="sm:col-span-2">
            <AddressForm address={a} onDone={() => setEditing(null)} />
          </div>
        ) : (
          <article
            key={a.id}
            className={`flex flex-col border p-4 ${a.isDefault ? 'border-ink' : 'border-line'}`}
            data-testid="address-card"
          >
            <p className="text-[11px] uppercase tracking-label">
              {a.isDefault ? 'Default' : a.label}
            </p>
            <address className="mt-2 flex-1 text-[14px] not-italic leading-relaxed">
              {a.name}
              <br />
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ''}
              <br />
              {a.suburb} {a.state} {a.postcode}
            </address>
            <div className="mt-3 flex flex-wrap gap-x-4">
              <button type="button" onClick={() => setEditing(a.id)} className={small}>
                Edit
              </button>
              {!a.isDefault && (
                <form action={makeDefaultAddressAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className={small} data-testid="make-default">
                    Make default
                  </button>
                </form>
              )}
              <form action={removeAddressAction}>
                <input type="hidden" name="id" value={a.id} />
                <button className={`${small} text-muted`}>Remove</button>
              </form>
            </div>
          </article>
        ),
      )}
      {editing === 'new' ? (
        <div className="sm:col-span-2">
          <AddressForm onDone={() => setEditing(null)} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="flex min-h-[120px] items-center justify-center border border-dashed border-line-strong text-[13px] hover:border-ink"
          data-testid="add-address"
        >
          + Add an address
        </button>
      )}
    </div>
  );
}
