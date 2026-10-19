'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import {
  applicationMessageAction,
  saveLabelAction,
  saveWorkAction,
  submitApplicationAction,
} from '@/lib/actions/sell';
import type { FormState } from '@/lib/validation';
import { ImageUploader } from '@/components/forms/ImageUploader';
import { CheckIcon } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/SubmitButton';

const chip =
  'flex min-h-[44px] cursor-pointer items-center rounded-circle border px-4 text-[13px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink';
const box =
  'flex cursor-pointer items-center gap-3 border p-4 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink';

function Tick({ on, round = false }: { on: boolean; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center border ${round ? 'rounded-circle' : ''} ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
    >
      {on && <CheckIcon width={12} height={12} />}
    </span>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {hint && <span className="ml-1 normal-case tracking-normal text-muted-2">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function FormError({ state }: { state: FormState }) {
  return state?.message && !state.ok ? (
    <p className="text-[13px] text-error" role="alert">
      {state.message}
    </p>
  ) : null;
}

export interface LabelInitial {
  name: string;
  ownerName: string;
  email: string;
  mobile: string;
  suburb: string;
  state: string;
  instagram: string;
  website: string;
  makes: string[];
  modes: string[];
}

/** Step 1, "Your label". */
export function LabelForm({
  initial,
  makes,
  modes,
  states,
}: {
  initial: LabelInitial;
  makes: readonly string[];
  modes: ReadonlyArray<{ value: string; label: string; body: string }>;
  states: readonly string[];
}) {
  const [state, action] = useFormState<FormState, FormData>(saveLabelAction, undefined);
  const [picked, setPicked] = useState<string[]>(initial.makes);
  const [how, setHow] = useState<string[]>(initial.modes);
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <form action={action} className="space-y-6" data-testid="label-form">
      <Field id="label-name" label="Label name">
        <input
          id="label-name"
          name="name"
          required
          maxLength={60}
          defaultValue={initial.name}
          className="input"
          autoComplete="organization"
        />
      </Field>
      <Field id="label-owner" label="Your name">
        <input
          id="label-owner"
          name="ownerName"
          required
          maxLength={80}
          defaultValue={initial.ownerName}
          className="input"
          autoComplete="name"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="label-email" label="Email">
          <input
            id="label-email"
            name="email"
            type="email"
            required
            defaultValue={initial.email}
            className="input"
            autoComplete="email"
          />
        </Field>
        <Field id="label-mobile" label="Mobile">
          <input
            id="label-mobile"
            name="mobile"
            type="tel"
            required
            maxLength={20}
            defaultValue={initial.mobile}
            className="input"
            autoComplete="tel"
            inputMode="tel"
          />
        </Field>
      </div>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field id="label-suburb" label="Suburb">
          <input
            id="label-suburb"
            name="suburb"
            required
            maxLength={60}
            defaultValue={initial.suburb}
            className="input"
            autoComplete="address-level2"
          />
        </Field>
        <Field id="label-state" label="State">
          <select
            id="label-state"
            name="state"
            required
            defaultValue={initial.state}
            className="input"
          >
            <option value="" disabled>
              Pick
            </option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="label-instagram" label="Instagram">
          <input
            id="label-instagram"
            name="instagram"
            required
            maxLength={60}
            defaultValue={initial.instagram}
            placeholder="@yourlabel"
            className="input"
          />
        </Field>
        <Field id="label-website" label="Website" hint="(optional)">
          <input
            id="label-website"
            name="website"
            maxLength={200}
            defaultValue={initial.website}
            placeholder="yourlabel.com.au"
            className="input"
            inputMode="url"
          />
        </Field>
      </div>
      <fieldset>
        <legend className="label">What do you make?</legend>
        <div className="flex flex-wrap gap-2">
          {makes.map((m) => {
            const on = picked.includes(m);
            return (
              <label
                key={m}
                className={`${chip} ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
              >
                <input
                  type="checkbox"
                  name="makes"
                  value={m}
                  checked={on}
                  onChange={() => setPicked((p) => toggle(p, m))}
                  className="sr-only"
                />
                {m}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">How do you sell?</legend>
        <div className="space-y-2">
          {modes.map((m) => {
            const on = how.includes(m.value);
            return (
              <label
                key={m.value}
                className={`${box} min-h-[64px] ${on ? 'border-ink' : 'border-line-strong'}`}
                data-testid={`mode-${m.value}`}
              >
                <input
                  type="checkbox"
                  name="modes"
                  value={m.value}
                  checked={on}
                  onChange={() => setHow((h) => toggle(h, m.value))}
                  className="sr-only"
                />
                <Tick on={on} />
                <span>
                  <span className="block text-[14px]">{m.label}</span>
                  <span className="block text-[12px] text-muted">{m.body}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <FormError state={state} />
      <SubmitButton
        className="w-full"
        pendingLabel="Saving…"
        disabled={!picked.length || !how.length}
        data-testid="label-continue"
      >
        Continue
      </SubmitButton>
    </form>
  );
}

export interface WorkInitial {
  photos: string[];
  madeBy: string;
  madeByDetail: string;
  process: string;
  fabrics: string;
  declaration: boolean;
}

/** Step 2, "Show us your work". */
export function WorkForm({
  initial,
  madeBy,
  declaration,
  photos: limits,
}: {
  initial: WorkInitial;
  madeBy: ReadonlyArray<{ value: string; label: string }>;
  declaration: string;
  photos: { min: number; max: number };
}) {
  const [state, action] = useFormState<FormState, FormData>(saveWorkAction, undefined);
  const [photos, setPhotos] = useState<string[]>(initial.photos);
  const [who, setWho] = useState(initial.madeBy);
  const [process, setProcess] = useState(initial.process);
  const [agreed, setAgreed] = useState(initial.declaration);
  const detail = who === 'workroom' || who === 'other';
  return (
    <form action={action} className="space-y-7" data-testid="work-form">
      <div>
        <p className="label">
          Photos of your work{' '}
          <span className="normal-case tracking-normal text-muted-2">
            ({limits.min}–{limits.max})
          </span>
        </p>
        <p className="mb-3 text-[13px] text-muted">
          Upload {limits.min}–{limits.max} photos of pieces you’ve made. Real photos are fine. We’re
          looking at the work, not the photography.
        </p>
        <ImageUploader
          name="photos"
          kind="makers"
          max={limits.max}
          initial={initial.photos}
          label="Add photos"
          onChange={setPhotos}
        />
      </div>
      <fieldset>
        <legend className="label">Who makes your pieces?</legend>
        <div className="space-y-2">
          {madeBy.map((m) => {
            const on = who === m.value;
            return (
              <label
                key={m.value}
                className={`${box} min-h-[56px] ${on ? 'border-ink' : 'border-line-strong'}`}
                data-testid={`made-by-${m.value}`}
              >
                <input
                  type="radio"
                  name="madeBy"
                  value={m.value}
                  checked={on}
                  required
                  onChange={() => setWho(m.value)}
                  className="sr-only"
                />
                <Tick on={on} round />
                <span className="text-[14px]">{m.label}</span>
              </label>
            );
          })}
        </div>
        {detail && (
          <div className="mt-3">
            <label htmlFor="made-by-detail" className="sr-only">
              {who === 'workroom' ? 'Which maker or workroom?' : 'Who makes your pieces?'}
            </label>
            <input
              id="made-by-detail"
              name="madeByDetail"
              required
              maxLength={200}
              defaultValue={initial.madeByDetail}
              placeholder={
                who === 'workroom' ? 'Which maker or workroom?' : 'Tell us who makes them'
              }
              className="input"
            />
          </div>
        )}
      </fieldset>
      <Field id="work-process" label="Tell us about your process">
        <textarea
          id="work-process"
          name="process"
          required
          maxLength={300}
          rows={4}
          value={process}
          onChange={(e) => setProcess(e.target.value)}
          className="input min-h-[112px] py-3"
        />
        <p className="mt-1 text-right text-[11px] text-muted-2">{process.length}/300</p>
      </Field>
      <Field id="work-fabrics" label="Where do your fabrics come from?" hint="(optional)">
        <input
          id="work-fabrics"
          name="fabrics"
          maxLength={300}
          defaultValue={initial.fabrics}
          className="input"
        />
      </Field>
      <label className={`${box} items-start ${agreed ? 'border-ink' : 'border-line-strong'}`}>
        <input
          type="checkbox"
          name="declaration"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="sr-only"
          data-testid="declaration"
        />
        <Tick on={agreed} />
        <span className="text-[13px] leading-relaxed">{declaration}</span>
      </label>
      <FormError state={state} />
      <SubmitButton
        className="w-full"
        pendingLabel="Saving…"
        disabled={photos.length < limits.min || !who || !agreed || process.trim().length < 10}
        data-testid="work-continue"
      >
        Continue
      </SubmitButton>
    </form>
  );
}

/** The last card's button: send the application (or resend it). */
export function SubmitApplication({ resubmit }: { resubmit: boolean }) {
  const [state, action] = useFormState<FormState>(submitApplicationAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <FormError state={state} />
      <SubmitButton className="w-full" pendingLabel="Sending…" data-testid="submit-application">
        {resubmit ? 'Resubmit' : 'Submit application'}
      </SubmitButton>
    </form>
  );
}

/** "Need to change something? Message us." */
export function MessageUs() {
  const [state, action] = useFormState<FormState, FormData>(applicationMessageAction, undefined);
  const [open, setOpen] = useState(false);
  if (state?.ok)
    return (
      <p className="bg-stone p-4 text-[13px]" role="status" data-testid="message-sent">
        {state.message}
      </p>
    );
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="min-h-[44px] text-[13px] underline underline-offset-4"
        data-testid="message-us"
      >
        Need to change something? Message us.
      </button>
      {open && (
        <form action={action} className="mt-2 space-y-3">
          <label htmlFor="apply-message" className="sr-only">
            Your message
          </label>
          <textarea
            id="apply-message"
            name="body"
            required
            rows={4}
            maxLength={2000}
            className="input min-h-[112px] py-3"
            placeholder="What would you like to change?"
          />
          <FormError state={state} />
          <SubmitButton className="w-full" pendingLabel="Sending…">
            Send
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
