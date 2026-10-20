'use client';

import { useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { cancelCustomOrderAction, milestoneAction } from '@/lib/actions/custom-studio';
import { CUSTOM } from '@/lib/custom/config';
import type { FormState } from '@/lib/validation';

export const STEPS = [
  { key: 'sketch_shared', label: 'Share a sketch', done: 'Sketch shared', optional: true },
  { key: 'fabric_bought', label: 'Mark fabric bought', done: 'Fabric bought', optional: false },
  { key: 'fitting', label: 'Fitting done', done: 'Fitting done', optional: true },
  { key: 'made', label: 'Made', done: 'Made', optional: false },
] as const;

type Entry = { at: string; photo?: string | null; note?: string | null };

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Melbourne',
  });

function StepForm({
  orderId,
  step,
  entry,
}: {
  orderId: string;
  step: (typeof STEPS)[number];
  entry: Entry | undefined;
}) {
  const [state, action] = useFormState<FormState, FormData>(milestoneAction, undefined);
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  async function upload(files: FileList | null) {
    if (!files?.[0]) return;
    setUploading(true);
    const fd = new FormData();
    fd.set('file', files[0]);
    fd.set('kind', 'commissions');
    const res = await fetch('/api/uploads', { method: 'POST', body: fd }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { url?: string }) : {};
    if (res?.ok && json.url) setPhoto(json.url);
    setUploading(false);
  }
  if (entry)
    return (
      <li className="flex gap-3 py-3" data-testid={`milestone-${step.key}`} data-done>
        <span
          aria-hidden
          className="mt-1 h-[11px] w-[11px] shrink-0 rounded-circle border border-ink bg-ink"
        />
        <span className="min-w-0 flex-1 text-[13px]">
          <span className="block">{step.done}</span>
          <span className="block text-[12px] text-muted">
            {when(entry.at)}
            {entry.note ? ` · “${entry.note}”` : ''}
          </span>
          {entry.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={entry.photo} alt="" className="mt-2 h-20 w-16 object-cover" />
          )}
        </span>
      </li>
    );
  return (
    <li className="py-3" data-testid={`milestone-${step.key}`}>
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="h-[11px] w-[11px] shrink-0 rounded-circle border border-line-strong bg-ground"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="min-h-[40px] flex-1 text-left text-[13px] underline-offset-[3px] hover:underline"
          data-testid={`milestone-${step.key}-open`}
        >
          {step.label}
          {step.optional ? <span className="text-muted"> · optional</span> : ''}
          {step.key === 'fabric_bought' ? (
            <span className="block text-[12px] text-muted">
              Pays you {CUSTOM.advancePct}% of the piece price now.
            </span>
          ) : null}
        </button>
      </div>
      {open && (
        <form
          action={action}
          className="ml-6 mt-2 flex flex-col gap-2"
          data-testid={`milestone-${step.key}-form`}
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="key" value={step.key} />
          <input type="hidden" name="photo" value={photo ?? ''} />
          <input
            name="note"
            placeholder="A line for the buyer (optional)"
            maxLength={500}
            className="input min-h-[44px]"
            data-testid={`milestone-${step.key}-note`}
          />
          <label className="flex cursor-pointer items-center gap-2 text-[12px]">
            <span className="flex h-11 w-11 items-center justify-center border border-dashed border-line-strong">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" className="h-full w-full object-cover" />
              ) : (
                '+'
              )}
            </span>
            {uploading ? 'Uploading…' : photo ? 'Change photo' : 'Add a photo (optional)'}
            <input
              ref={file}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => upload(e.target.files)}
            />
          </label>
          {state?.ok === false && (
            <p className="text-[12px] text-error" role="alert">
              {state.message}
            </p>
          )}
          <button
            disabled={uploading}
            className="min-h-[44px] self-start border border-ink px-4 text-[11px] uppercase tracking-[0.16em] hover:bg-ink hover:text-ground disabled:opacity-50"
            data-testid={`milestone-${step.key}-save`}
          >
            {step.done} · tell the buyer
          </button>
        </form>
      )}
    </li>
  );
}

/** The custom order's making steps, each with an optional note and photo; Sent is the ship form. */
export function CustomMilestones({
  orderId,
  milestones,
  shipped,
}: {
  orderId: string;
  milestones: Record<string, Entry>;
  shipped: boolean;
}) {
  const [cancelState, cancelAction] = useFormState<FormState, FormData>(
    cancelCustomOrderAction,
    undefined,
  );
  const [cancelling, setCancelling] = useState(false);
  return (
    <div data-testid="custom-milestones">
      <ol className="divide-y divide-line border-y border-line" aria-label="Making progress">
        {STEPS.map((s) => (
          <StepForm key={s.key} orderId={orderId} step={s} entry={milestones[s.key]} />
        ))}
        <li
          className="flex gap-3 py-3"
          data-testid="milestone-sent"
          data-done={shipped || undefined}
        >
          <span
            aria-hidden
            className={`mt-1 h-[11px] w-[11px] shrink-0 rounded-circle border ${shipped ? 'border-ink bg-ink' : 'border-line-strong bg-ground'}`}
          />
          <span className="text-[13px]">
            Sent
            <span className="block text-[12px] text-muted">
              {shipped ? 'On its way.' : 'Dispatch below with the carrier and tracking number.'}
            </span>
          </span>
        </li>
      </ol>
      {!shipped && !cancelState?.ok && (
        <div className="mt-3 text-[12px]">
          {!cancelling ? (
            <button
              type="button"
              onClick={() => setCancelling(true)}
              className="text-muted underline underline-offset-[3px]"
              data-testid="cancel-custom-open"
            >
              Can’t make it after all? Cancel this order
            </button>
          ) : (
            <form
              action={cancelAction}
              className="flex flex-col gap-2 bg-stone-light p-3"
              data-testid="cancel-custom-form"
            >
              <input type="hidden" name="orderId" value={orderId} />
              <p>
                The buyer is refunded in full.{' '}
                {milestones.fabric_bought
                  ? 'Your fabric advance comes off your next payouts, unless Off One agrees the fabric goes to the buyer.'
                  : ''}
              </p>
              <input
                name="reason"
                placeholder="Why? (the buyer sees this)"
                maxLength={500}
                className="input min-h-[44px]"
                required
              />
              <button
                className="min-h-[44px] self-start border border-error px-4 text-[11px] uppercase tracking-[0.16em] text-error"
                data-testid="cancel-custom-send"
              >
                Cancel and refund
              </button>
            </form>
          )}
        </div>
      )}
      {cancelState && (
        <p className={`mt-2 text-[12px] ${cancelState.ok ? '' : 'text-error'}`} role="status">
          {cancelState.message}
        </p>
      )}
    </div>
  );
}
