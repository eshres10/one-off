'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { passRequestAction, sendQuoteAction } from '@/lib/actions/custom-studio';
import { FITTING_OPTIONS, PASS_REASONS, fmtDayLong } from '@/lib/custom/brief';
import { formatPrice } from '@/lib/domain/money';
import type { MakerRequestDetail } from '@/lib/services/custom-studio';
import type { FormState } from '@/lib/validation';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** The price less the shop's commission and the card fee estimate (mirrors youGetCents). */
function youGet(priceCents: number, commissionPct: number) {
  const commission = Math.floor((priceCents * Math.round(commissionPct * 100) + 5_000) / 10_000);
  const card = Math.round((priceCents * 1.75) / 100) + 30;
  return priceCents - commission - card;
}

function budgetWord(priceCents: number, min: number | null, max: number | null) {
  const dollars = priceCents / 100;
  if (max != null && dollars > max) return { text: 'Above their budget', tone: 'text-[#8A2E1C]' };
  if (min != null && dollars < min) return { text: 'Below their budget', tone: 'text-muted' };
  return { text: 'Within their budget', tone: 'text-ink' };
}

/**
 * The sticky quote panel: price (with "you get about"), ready-by chips around their date, the
 * fittings the shop offers, fabric, a note shown big, an optional sketch, and the measurements
 * check. Sent quotes can be edited until accepted. Pass sits underneath.
 */
export function QuotePanel({
  request,
  commissionPct,
  fittingsInPerson,
  budget,
}: {
  request: MakerRequestDetail;
  commissionPct: number;
  fittingsInPerson: boolean;
  budget: { min: number | null; max: number | null };
}) {
  const q = request.quote;
  const [state, action] = useFormState<FormState, FormData>(sendQuoteAction, undefined);
  const [passState, passAction] = useFormState<FormState, FormData>(passRequestAction, undefined);
  const [price, setPrice] = useState(q ? String(q.price / 100) : '');
  const [readyBy, setReadyBy] = useState(q?.readyBy ?? '');
  const [fittings, setFittings] = useState(q?.fittings ?? 'none');
  const [note, setNote] = useState(q?.note ?? '');
  const [sketch, setSketch] = useState<string | null>(q?.sketchPath ?? null);
  const [canMake, setCanMake] = useState(Boolean(q));
  const [editing, setEditing] = useState(!q);
  const [passing, setPassing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  // Once sent (or saved), show the quote rather than the form.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  const cents = Math.round((Number(price) || 0) * 100);
  const need = request.neededBy ? new Date(`${request.neededBy}T00:00:00Z`) : null;
  const chips = need
    ? [-4, -2, -1].map((d) => iso(new Date(need.getTime() + d * DAY)))
    : [21, 28, 35].map((d) => iso(new Date(Date.now() + d * DAY)));
  const fittingChoices = FITTING_OPTIONS.filter(
    (f) => fittingsInPerson || (f.value !== 'studio_one' && f.value !== 'studio_two'),
  );
  const closed = ['passed', 'expired', 'not_chosen', 'chosen'].includes(request.recipientStatus);
  const accepted = request.recipientStatus === 'chosen' || q?.status === 'accepted';
  const word = cents ? budgetWord(cents, budget.min, budget.max) : null;
  const error = state?.ok === false ? state.message : null;

  async function upload(files: FileList | null) {
    if (!files?.[0]) return;
    setUploading(true);
    const fd = new FormData();
    fd.set('file', files[0]);
    fd.set('kind', 'commissions');
    const res = await fetch('/api/uploads', { method: 'POST', body: fd }).catch(() => null);
    const json = res ? ((await res.json().catch(() => ({}))) as { url?: string }) : {};
    if (res?.ok && json.url) setSketch(json.url);
    setUploading(false);
    if (file.current) file.current.value = '';
  }

  if (accepted)
    return (
      <aside className="border border-ink bg-surface p-6" data-testid="quote-panel">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">Accepted</p>
        <p className="mt-2 font-display text-[32px] leading-none">{formatPrice(q!.price)}</p>
        <p className="mt-2 text-[13px] text-muted">
          They accepted your quote and paid in full. Find it in Orders to share a sketch and mark
          each step.
        </p>
      </aside>
    );

  if (closed || passState?.ok)
    return (
      <aside className="border border-line bg-surface p-6" data-testid="quote-panel">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
          {request.recipientStatus === 'not_chosen'
            ? 'They chose another maker this time'
            : request.recipientStatus === 'expired'
              ? 'The 48 hours have passed'
              : 'You passed on this one'}
        </p>
        <p className="mt-2 text-[13px] text-muted">
          {request.recipientStatus === 'not_chosen'
            ? 'Thank you for quoting. Quick replies keep your response badge, which helps you match.'
            : 'The buyer sees “Not available this time”.'}
        </p>
      </aside>
    );

  if (q && !editing)
    return (
      <aside className="border border-ink bg-surface p-6" data-testid="quote-panel">
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">Quote sent</p>
        <p className="mt-2 font-display text-[32px] leading-none" data-testid="quote-sent-price">
          {formatPrice(q.price)}
        </p>
        <p className="mt-2 text-[13px] text-muted">
          Ready by {fmtDayLong(q.readyBy)} ·{' '}
          {FITTING_OPTIONS.find((f) => f.value === q.fittings)?.short ?? 'No fitting'}
          {q.editedAt ? ' · edited' : ''}
        </p>
        <p className="mt-3 font-display text-[18px] leading-[1.2]">“{q.note}”</p>
        {state?.ok && (
          <p className="mt-3 text-[12px]" role="status">
            {state.message}
          </p>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 min-h-[44px] text-[11px] uppercase tracking-[0.16em] underline underline-offset-[6px]"
          data-testid="edit-quote"
        >
          Edit quote
        </button>
      </aside>
    );

  return (
    <aside className="border border-line bg-surface p-6" data-testid="quote-panel">
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="requestId" value={request.id} />
        <input type="hidden" name="readyBy" value={readyBy} />
        <input type="hidden" name="fittings" value={fittings} />
        <input type="hidden" name="sketchPath" value={sketch ?? ''} />
        <h2 className="font-display text-[32px] leading-none">
          {q ? 'Edit your quote' : 'Your quote'}
        </h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Price, including fabric
          </span>
          <span className="flex min-h-[56px] items-center border border-line-strong bg-[#FBFAF8] px-3 text-[20px]">
            <span className="mr-2 text-muted-2">A$</span>
            <input
              name="price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
              className="w-full bg-transparent text-[20px] outline-none"
              aria-label="Price in Australian dollars"
              data-testid="quote-price-input"
            />
          </span>
          <span className="text-[13px]" data-testid="quote-you-get">
            {word ? (
              <>
                <span className={word.tone}>{word.text}</span> · you get about{' '}
                <b className="font-medium">{formatPrice(youGet(cents, commissionPct))}</b>
              </>
            ) : (
              `Their budget: ${budget.min != null ? `A$${budget.min}–${budget.max ?? '+'}` : '—'}`
            )}
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">Ready by</span>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Ready by">
            {chips.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={readyBy === d}
                onClick={() => setReadyBy(d)}
                className={`min-h-[52px] border text-[13px] ${readyBy === d ? 'border-ink bg-[rgba(17,17,17,0.86)] text-ground' : 'border-line-strong hover:border-ink'}`}
                data-testid={`ready-${d}`}
              >
                {fmtDayLong(d)}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={readyBy}
            onChange={(e) => setReadyBy(e.target.value)}
            aria-label="Pick another ready-by date"
            className="min-h-[44px] border border-line-strong bg-[#FBFAF8] px-3 text-[14px]"
          />
          <span className="text-[12px] text-muted">
            {request.neededBy
              ? `They need it by ${fmtDayLong(request.neededBy)}`
              : 'They’re flexible on the date'}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">Fittings</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fittings">
            {fittingChoices.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={fittings === f.value}
                onClick={() => setFittings(f.value)}
                className={`min-h-[48px] border px-3 text-[13px] ${fittings === f.value ? 'border-ink bg-[rgba(17,17,17,0.86)] text-ground' : 'border-line-strong hover:border-ink'}`}
                data-testid={`fittings-${f.value}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Fabric you’d use
          </span>
          <input
            name="fabric"
            defaultValue={q?.fabric ?? ''}
            maxLength={200}
            className="min-h-[48px] border border-line-strong bg-[#FBFAF8] px-3 text-[14px] outline-none focus-visible:border-ink"
            data-testid="quote-fabric"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            A note to them · shown big
          </span>
          <textarea
            name="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            maxLength={2000}
            className="border border-line-strong bg-[#FBFAF8] px-3 py-3 text-[15px] leading-[1.45] outline-none focus-visible:border-ink"
            data-testid="quote-note"
          />
          {note.trim().length < 20 && (
            <span className="text-[11px] text-muted-2">
              {20 - note.trim().length} more characters
            </span>
          )}
        </label>

        <label className="flex cursor-pointer items-center gap-3 text-[13px]">
          <span className="relative flex h-16 w-14 shrink-0 items-center justify-center overflow-hidden border border-dashed border-line-strong">
            {sketch ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={sketch} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <span className="text-[18px]">+</span>
            )}
          </span>
          <span>
            {uploading
              ? 'Uploading…'
              : sketch
                ? 'Change sketch'
                : 'Add a sketch (optional, buyers love these)'}
          </span>
          <input
            ref={file}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(e) => upload(e.target.files)}
            data-testid="quote-sketch"
          />
        </label>

        <label className="flex items-start gap-3 bg-stone-light px-3.5 py-3 text-[13px]">
          <input
            type="checkbox"
            name="canMake"
            checked={canMake}
            onChange={(e) => setCanMake(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-ink"
            data-testid="quote-can-make"
          />
          <span>I’ve checked their measurements and can make it to fit.</span>
        </label>

        {error && (
          <p
            className="bg-error-bg px-3 py-2.5 text-[13px] text-error"
            role="alert"
            data-testid="quote-error"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={!cents || !readyBy || note.trim().length < 20 || !canMake || uploading}
          className="glass-dark min-h-[54px] text-[11px] uppercase tracking-[0.18em] text-ground disabled:cursor-not-allowed disabled:opacity-40"
          data-testid="send-quote"
        >
          {q ? 'Save changes' : 'Send quote'}
          {cents ? ` · ${formatPrice(cents)}` : ''}
        </button>
        {q && (
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[12px] text-muted underline underline-offset-[3px]"
          >
            Keep the quote as it is
          </button>
        )}
      </form>

      {!q && (
        <div className="mt-5 border-t border-line pt-4">
          {!passing ? (
            <button
              type="button"
              onClick={() => setPassing(true)}
              className="min-h-[44px] text-[12px] text-muted underline underline-offset-[3px]"
              data-testid="pass-toggle"
            >
              Not this one? Pass
            </button>
          ) : (
            <form action={passAction} className="flex flex-col gap-2" data-testid="pass-form">
              <input type="hidden" name="requestId" value={request.id} />
              <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
                Why are you passing?
              </span>
              {PASS_REASONS.map((r) => (
                <label key={r.value} className="flex min-h-[40px] items-center gap-2.5 text-[13px]">
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    className="accent-ink"
                    required
                  />
                  {r.label}
                </label>
              ))}
              <span className="text-[11px] text-muted-2">
                The buyer sees “Not available this time”, never the reason.
              </span>
              {passState?.ok === false && (
                <p className="text-[12px] text-error" role="alert">
                  {passState.message}
                </p>
              )}
              <button
                className="min-h-[44px] border border-ink text-[11px] uppercase tracking-[0.16em]"
                data-testid="pass-send"
              >
                Pass on this request
              </button>
            </form>
          )}
        </div>
      )}
    </aside>
  );
}
