'use client';

import { useFormState } from 'react-dom';
import { saveMeasurementsAction } from '@/lib/actions/account';
import type { FormState } from '@/lib/validation';
import type { SavedSizes } from '@/lib/queries/account';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { FormAlert } from '@/components/ui/Field';

const SIZES = ['6', '8', '10', '12', '14', '16', '18', '20'];
const FITS = [
  { value: 'close', label: 'Close to the body' },
  { value: 'true', label: 'True to size' },
  { value: 'relaxed', label: 'Relaxed' },
] as const;

type Num = 'heightCm' | 'bustCm' | 'waistCm' | 'hipsCm' | 'insideLegCm';
const FIELDS: Array<{ name: Num; label: string; min: number; max: number }> = [
  { name: 'heightCm', label: 'Height', min: 100, max: 230 },
  { name: 'bustCm', label: 'Bust', min: 50, max: 200 },
  { name: 'waistCm', label: 'Waist', min: 40, max: 200 },
  { name: 'hipsCm', label: 'Hips', min: 50, max: 220 },
  { name: 'insideLegCm', label: 'Inside leg', min: 40, max: 120 },
];

const trim = (v: string | null | undefined) => (v ? String(Number(v)) : '');

/** Sizes & fit: usual AU size, measurements with the unit inside the field, and fit preference. */
export function MeasurementsForm({ initial }: { initial: SavedSizes | null }) {
  const [state, action] = useFormState<FormState, FormData>(saveMeasurementsAction, undefined);
  return (
    <form action={action} className="space-y-8" data-testid="sizes-form">
      <div>
        <label htmlFor="usualSize" className="text-[11px] uppercase tracking-label">
          Usual AU size
        </label>
        <div className="relative mt-2 max-w-[200px]">
          <select
            id="usualSize"
            name="usualSize"
            defaultValue={initial?.usualSize ?? ''}
            className="min-h-[48px] w-full appearance-none border border-line-strong bg-surface px-3 pr-10 text-[15px]"
          >
            <option value="">Choose</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                AU {s}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
          >
            ⌄
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label htmlFor={f.name} className="text-[11px] uppercase tracking-label">
              {f.label}
            </label>
            <div className="relative mt-2">
              <input
                id={f.name}
                name={f.name}
                type="number"
                inputMode="decimal"
                step="0.5"
                min={f.min}
                max={f.max}
                defaultValue={trim(initial?.[f.name])}
                aria-describedby={state?.errors?.[f.name] ? `${f.name}-error` : undefined}
                className="min-h-[48px] w-full border border-line-strong bg-surface px-3 pr-11 text-[15px]"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted"
              >
                cm
              </span>
            </div>
            {state?.errors?.[f.name] && (
              <p id={`${f.name}-error`} className="mt-1 text-[12px] text-alert">
                {f.label} should be between {f.min} and {f.max} cm
              </p>
            )}
          </div>
        ))}
      </div>

      <fieldset>
        <legend className="text-[11px] uppercase tracking-label">Fit preference</legend>
        <div className="mt-2 grid grid-cols-3 border border-line-strong">
          {FITS.map((f) => (
            <label
              key={f.value}
              className="flex min-h-[48px] cursor-pointer items-center justify-center border-r border-line-strong px-2 text-center text-[13px] last:border-r-0 has-[:checked]:bg-ink has-[:checked]:text-ground has-[:focus-visible]:outline has-[:focus-visible]:outline-2"
            >
              <input
                type="radio"
                name="fitPref"
                value={f.value}
                defaultChecked={initial?.fitPref === f.value}
                className="sr-only"
                data-testid={`fit-${f.value}`}
              />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>

      <p className="max-w-lg text-[14px] leading-relaxed text-muted">
        Saved once, used everywhere. We filter the feed to your size, and share your measurements
        with a maker only when you order something made to order.
      </p>

      <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
      <SubmitButton>Save</SubmitButton>
    </form>
  );
}
