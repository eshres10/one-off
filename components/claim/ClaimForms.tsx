'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { agreeAction, claimAction, goLiveAction, shippingAction } from '@/lib/actions/claim';
import type { FormState } from '@/lib/validation';
import { Sheet } from '@/components/studio/Sheet';
import { Switch } from '@/components/studio/Switch';

function Primary({
  children,
  disabled = false,
  testId,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  testId?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-50"
      data-testid={testId}
    >
      {pending ? 'One moment…' : children}
    </button>
  );
}

function Error({ state }: { state: FormState }) {
  if (state?.ok !== false || !state.message) return null;
  return (
    <p role="alert" className="mb-3 bg-error-bg px-3 py-2 text-[13px] text-alert">
      {state.message}
    </p>
  );
}

export function TakeALook({ token }: { token: string }) {
  const [state, action] = useFormState<FormState, FormData>(claimAction, undefined);
  return (
    <form action={action}>
      <Error state={state} />
      <input type="hidden" name="token" value={token} />
      <Primary testId="take-a-look">Take a look</Primary>
    </form>
  );
}

/** Step 2: the agreement sheet, the tick box, and "Agree and continue". */
export function AgreeForm({ agreementHtml }: { agreementHtml: string }) {
  const [state, action] = useFormState<FormState, FormData>(agreeAction, undefined);
  const [ticked, setTicked] = useState(false);
  const [open, setOpen] = useState(false);
  return (
    <form action={action} className="space-y-5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] text-[13px] underline underline-offset-4"
        data-testid="read-agreement"
      >
        Read the full Seller Agreement
      </button>
      <label className="flex items-start gap-3 text-[13px] leading-snug">
        <input
          type="checkbox"
          name="agree"
          checked={ticked}
          onChange={(e) => setTicked(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#111111]"
          data-testid="agree-box"
        />
        I’ve read and agree to the One Off Seller Agreement, and I own or have permission to use
        these photos.
      </label>
      <Error state={state} />
      <Primary disabled={!ticked} testId="agree-continue">
        Agree and continue
      </Primary>
      {open && (
        <Sheet
          testId="agreement-sheet"
          onClose={() => setOpen(false)}
          width={640}
          title={<h2 className="font-display text-[28px] leading-tight">Seller Agreement</h2>}
        >
          <div
            className="prose-agreement space-y-3 text-[14px] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: agreementHtml }}
          />
        </Sheet>
      )}
    </form>
  );
}

function Chips({
  name,
  options,
  initial,
}: {
  name: string;
  options: readonly string[];
  initial: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup">
      <input type="hidden" name={name} value={value} />
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => setValue(o)}
          className={`min-h-[44px] rounded-circle border px-4 text-[13px] ${value === o ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

/** Step 4: shipping prices and times. */
export function ShippingForm({
  standard,
  express,
  freeOver,
  dispatch,
  mtoLead,
  dispatchOptions,
  leadOptions,
}: {
  standard: number;
  express: number | null;
  freeOver: boolean;
  dispatch: string;
  mtoLead: string;
  dispatchOptions: readonly string[];
  leadOptions: readonly string[];
}) {
  const [state, action] = useFormState<FormState, FormData>(shippingAction, undefined);
  const [free, setFree] = useState(freeOver);
  return (
    <form action={action} className="space-y-6" data-testid="shipping-form">
      <fieldset>
        <legend className="label">Australia-wide shipping</legend>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-[12px] text-muted">
            Standard (A$)
            <input
              name="standard"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              defaultValue={standard / 100}
              className="input mt-1"
              required
              data-testid="rate-standard"
            />
          </label>
          <label className="text-[12px] text-muted">
            Express (A$, optional)
            <input
              name="express"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.5"
              defaultValue={express !== null ? express / 100 : ''}
              className="input mt-1"
            />
          </label>
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-4 border-y border-line py-3">
        <span id="free-label" className="text-[14px]">
          Free shipping over A$300
        </span>
        <input type="hidden" name="freeOver" value={free ? 'on' : ''} />
        <Switch checked={free} onChange={setFree} labelledBy="free-label" />
      </div>
      <fieldset>
        <legend className="label">Ready to ship: you send it within</legend>
        <Chips name="dispatch" options={dispatchOptions} initial={dispatch} />
      </fieldset>
      <fieldset>
        <legend className="label">Made to order: making time</legend>
        <Chips name="mtoLead" options={leadOptions} initial={mtoLead} />
      </fieldset>
      <Error state={state} />
      <Primary testId="save-shipping">Save and continue</Primary>
    </form>
  );
}

export function GoLiveForm() {
  const [state, action] = useFormState<FormState>(goLiveAction, undefined);
  return (
    <form action={action}>
      <Error state={state} />
      <Primary testId="go-live">Go live</Primary>
    </form>
  );
}
