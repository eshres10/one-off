'use client';

import { useState } from 'react';
import { RETURNS } from '@/lib/content/returns';
import { useFormState, useFormStatus } from 'react-dom';
import { createCommissionAction } from '@/lib/actions/account';
import { commissionRequestSchema, type FormState } from '@/lib/validation';
import { Pill } from '@/components/ui/Pill';
import { FormAlert } from '@/components/ui/Field';
import { CloseIcon, PlusIcon } from '@/components/ui/icons';

const GARMENTS = ['Dress', 'Skirt', 'Top', 'Two-piece', 'Other'];
const BUDGETS: Array<{ label: string; min: number; max: number }> = [
  { label: 'A$200–350', min: 200, max: 350 },
  { label: 'A$350–500', min: 350, max: 500 },
  { label: 'A$500–800', min: 500, max: 800 },
  { label: 'A$800+', min: 800, max: 2000 },
];

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="glass-dark min-h-[56px] w-full text-[12px] uppercase tracking-[0.2em] disabled:opacity-60"
    >
      {pending ? 'Sending request…' : 'Send request'}
    </button>
  );
}

export interface SavedMeasurements {
  heightCm?: string | null;
  bustCm?: string | null;
  waistCm?: string | null;
  hipsCm?: string | null;
  fitNotes?: string | null;
}

export function CommissionForm({
  makerId,
  sourceProductId,
  saved,
  prefill,
}: {
  makerId?: string;
  sourceProductId?: string;
  saved?: SavedMeasurements | null;
  /** Starting text for "Anything else" (a search that found nothing, or a sold piece). */
  prefill?: string;
}) {
  const [state, action] = useFormState<FormState, FormData>(createCommissionAction, undefined);
  const [garment, setGarment] = useState('Dress');
  const [otherGarment, setOtherGarment] = useState('');
  const [budget, setBudget] = useState<(typeof BUDGETS)[number] | null>(null);
  const num = (v?: string | null) => (v ? String(Number(v)) : '');
  const [m, setM] = useState({
    bust: num(saved?.bustCm),
    waist: num(saved?.waistCm),
    hips: num(saved?.hipsCm),
    height: num(saved?.heightCm),
    notes: saved?.fitNotes ?? '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const err = (k: string) => clientErrors[k] ?? state?.errors?.[k];

  const garmentType = garment === 'Other' ? otherGarment : garment;
  const measurements = [
    m.bust && `Bust ${m.bust}`,
    m.waist && `waist ${m.waist}`,
    m.hips && `hips ${m.hips}`,
    m.height && `height ${m.height} cm`,
    m.notes,
  ]
    .filter(Boolean)
    .join(', ');

  async function upload(files: FileList | null) {
    if (!files) return;
    setUploadError(null);
    const next = [...images];
    for (const f of Array.from(files).slice(0, 6 - images.length)) {
      const body = new FormData();
      body.set('file', f);
      body.set('kind', 'commissions');
      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && json.url) next.push(json.url);
      else setUploadError(json.error ?? 'Upload failed.');
    }
    setImages(next);
  }

  const line = 'input-line';
  return (
    <form
      action={action}
      noValidate
      className="space-y-7"
      onSubmit={(e) => {
        const data = Object.fromEntries(new FormData(e.currentTarget));
        const res = commissionRequestSchema.safeParse({ ...data, inspirationImageUrls: [] });
        if (!res.success) {
          e.preventDefault();
          setClientErrors(
            Object.fromEntries(res.error.issues.map((i) => [i.path.join('.'), i.message])),
          );
        } else setClientErrors({});
      }}
    >
      {makerId && <input type="hidden" name="makerId" value={makerId} />}
      {sourceProductId && <input type="hidden" name="sourceProductId" value={sourceProductId} />}
      <input type="hidden" name="garmentType" value={garmentType} />
      <input type="hidden" name="budgetMin" value={budget?.min ?? ''} />
      <input type="hidden" name="budgetMax" value={budget?.max ?? ''} />
      <input type="hidden" name="measurements" value={measurements} />
      {images.map((u) => (
        <input key={u} type="hidden" name="inspirationImageUrls" value={u} />
      ))}

      <fieldset>
        <legend className="label text-ink">Garment type</legend>
        <div className="flex flex-wrap gap-2">
          {GARMENTS.map((g) => (
            <Pill key={g} pressed={garment === g} onClick={() => setGarment(g)}>
              {g}
            </Pill>
          ))}
        </div>
        {garment === 'Other' && (
          <input
            aria-label="Describe the garment"
            value={otherGarment}
            onChange={(e) => setOtherGarment(e.target.value)}
            className={`${line} mt-3`}
            placeholder="e.g. Jumpsuit, coat…"
            maxLength={80}
          />
        )}
        {err('garmentType') && (
          <p className="mt-1.5 text-[12px] text-error">{err('garmentType')}</p>
        )}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="occasion" className="label text-ink">
            Occasion
          </label>
          <input
            id="occasion"
            name="occasion"
            className={line}
            placeholder="Wedding guest"
            maxLength={160}
          />
        </div>
        <div>
          <label htmlFor="deadline" className="label text-ink">
            Needed by
          </label>
          <input
            id="deadline"
            name="deadline"
            type="date"
            className={line}
            min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
          />
          {err('deadline') && <p className="mt-1.5 text-[12px] text-error">{err('deadline')}</p>}
        </div>
      </div>

      <fieldset>
        <legend className="label text-ink">Budget</legend>
        <div className="grid grid-cols-2 gap-2">
          {BUDGETS.map((b) => (
            <Pill key={b.label} pressed={budget?.label === b.label} onClick={() => setBudget(b)}>
              {b.label}
            </Pill>
          ))}
        </div>
        {(err('budgetMin') || err('budgetMax')) && (
          <p className="mt-1.5 text-[12px] text-error">
            {budget ? (err('budgetMin') ?? err('budgetMax')) : 'Choose a budget'}
          </p>
        )}
        <p className="mt-2 text-[12px] text-muted-2">
          Custom pieces take many hours to make; the maker will confirm a price in their quote.
        </p>
      </fieldset>

      <fieldset>
        <legend className="label text-ink">Your measurements, cm</legend>
        <div className="grid grid-cols-4 gap-3">
          {(['bust', 'waist', 'hips', 'height'] as const).map((k) => (
            <div key={k}>
              <label htmlFor={`m-${k}`} className="block text-[11px] capitalize text-muted-2">
                {k}
              </label>
              <input
                id={`m-${k}`}
                inputMode="decimal"
                value={m[k]}
                onChange={(e) => setM({ ...m, [k]: e.target.value.replace(/[^\d.]/g, '') })}
                className={line}
                placeholder={{ bust: '88', waist: '70', hips: '96', height: '168' }[k]}
              />
            </div>
          ))}
        </div>
        <label htmlFor="m-notes" className="mt-4 block text-[11px] text-muted-2">
          Fit notes
        </label>
        <input
          id="m-notes"
          value={m.notes}
          onChange={(e) => setM({ ...m, notes: e.target.value })}
          className={line}
          placeholder="Long torso; I like a loose fit through the hips"
          maxLength={300}
        />
        <a
          href="/size-guide#how-to-measure"
          className="mt-3 inline-block text-[11px] uppercase tracking-label underline underline-offset-[5px]"
        >
          How to measure
        </a>
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="fabricPreferences" className="label text-ink">
            Fabric
          </label>
          <input
            id="fabricPreferences"
            name="fabricPreferences"
            className={line}
            placeholder="Silk, satin…"
            maxLength={500}
          />
        </div>
        <div>
          <label htmlFor="colourPreferences" className="label text-ink">
            Colour
          </label>
          <input
            id="colourPreferences"
            name="colourPreferences"
            className={line}
            placeholder="Deep green"
            maxLength={500}
          />
        </div>
      </div>

      <div>
        <p className="label text-ink">
          Inspiration images{' '}
          <span className="normal-case tracking-normal text-muted-2">· up to 6</span>
        </p>
        <ul className="grid grid-cols-3 gap-2" role="list">
          {images.map((u) => (
            <li key={u} className="relative aspect-4/5 bg-stone-light">
              <img src={u} alt="Inspiration" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => setImages(images.filter((x) => x !== u))}
                className="absolute right-0 top-0 flex h-8 w-8 items-center justify-center bg-ground/90"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </li>
          ))}
          {images.length < 6 && (
            <li>
              <label className="flex aspect-4/5 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-line-strong text-[12px] hover:border-ink">
                <PlusIcon width={16} height={16} />
                Add
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(e) => upload(e.target.files)}
                />
              </label>
            </li>
          )}
        </ul>
        {uploadError && <p className="mt-1.5 text-[12px] text-error">{uploadError}</p>}
      </div>

      <div>
        <label htmlFor="notes" className="label text-ink">
          Anything else
        </label>
        <textarea
          id="notes"
          name="notes"
          className="input min-h-[96px]"
          placeholder="Like the slip, but with sleeves and a lower back"
          defaultValue={prefill}
          data-testid="commission-notes"
          maxLength={2000}
        />
      </div>

      <FormAlert message={state?.message} />
      <div>
        <p className="mb-3 text-[12px] text-muted-2" data-testid="commission-returns-note">
          {RETURNS.shortCustom}
        </p>
        <Submit />
        <p className="mt-2 text-center text-[12px] text-muted">
          Free to send. If you accept the quote, we’ll send a secure payment link for the deposit.
        </p>
      </div>
    </form>
  );
}
