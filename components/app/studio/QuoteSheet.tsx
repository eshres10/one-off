'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { passRequestAction, sendQuoteAction } from '@/lib/actions/custom-studio';
import { FITTING_OPTIONS, PASS_REASONS, fmtDayLong } from '@/lib/custom/brief';
import { CUSTOM } from '@/lib/custom/config';
import { formatPrice } from '@/lib/domain/money';
import type { MakerRequestDetail } from '@/lib/services/custom-studio';
import { MinusIcon, PlusIcon } from '@/components/ui/icons';
import { Sheet } from '../Sheet';
import { AppButton, Chip } from '../ui';
import { toast } from '../Toast';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Mirrors youGetCents: price less commission and the card fee estimate. */
function youGet(priceCents: number, commissionPct: number) {
  const commission = Math.floor((priceCents * Math.round(commissionPct * 100) + 5_000) / 10_000);
  const card = Math.round((priceCents * 1.75) / 100) + 30;
  return priceCents - commission - card;
}

/**
 * The quote sheet: a ± A$10 price stepper with "You keep" and the fabric advance live, ready-by
 * chips checked against the buyer's date, what's included, a note, then "Send quote".
 */
export function QuoteSheet({
  open,
  onOpenChange,
  request,
  commissionPct,
  fittingsInPerson,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  request: MakerRequestDetail;
  commissionPct: number;
  fittingsInPerson: boolean;
}) {
  const router = useRouter();
  const q = request.quote;
  const [dollars, setDollars] = useState(q ? q.price / 100 : 350);
  const [readyBy, setReadyBy] = useState(q?.readyBy ?? '');
  const [fittings, setFittings] = useState(q?.fittings ?? 'none');
  const [fabric, setFabric] = useState(Boolean(q?.fabric));
  const [note, setNote] = useState(q?.note ?? '');
  const [canMake, setCanMake] = useState(Boolean(q));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const cents = Math.round(dollars * 100);
  const need = request.neededBy ? new Date(`${request.neededBy}T00:00:00Z`) : null;
  const chips = need
    ? [-7, -4, -2, 0].map((d) => iso(new Date(need.getTime() + d * DAY)))
    : [21, 28, 35, 42].map((d) => iso(new Date(Date.now() + d * DAY)));
  const late = need && readyBy ? readyBy > request.neededBy! : false;
  const advance = Math.round((cents * CUSTOM.advancePct) / 100);
  const fittingChoices = FITTING_OPTIONS.filter(
    (f) => fittingsInPerson || (f.value !== 'studio_one' && f.value !== 'studio_two'),
  );

  const send = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('requestId', request.id);
      fd.set('price', String(dollars));
      fd.set('readyBy', readyBy);
      fd.set('fittings', fittings);
      fd.set('fabric', fabric ? 'Fabric included' : '');
      fd.set('note', note);
      fd.set('sketchPath', '');
      if (canMake) fd.set('canMake', 'on');
      const res = await sendQuoteAction(undefined, fd);
      if (res?.ok === false) {
        setError(res.message ?? 'Couldn’t send the quote.');
        return;
      }
      toast(res?.message ?? 'Quote sent');
      onOpenChange(false);
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={q ? 'Edit quote' : 'Send a quote'}
      testId="quote-sheet"
      footer={
        <>
          <AppButton
            onClick={send}
            disabled={pending || !readyBy || !canMake}
            className="w-full"
            data-testid="send-quote"
          >
            {pending ? 'Sending…' : `Send quote · ${formatPrice(cents)}`}
          </AppButton>
          {error && (
            <p className="mt-2 text-[12px] text-error" role="alert">
              {error}
            </p>
          )}
        </>
      }
    >
      <div
        className="flex items-center justify-between rounded-app bg-surface px-4 py-3"
        data-testid="price-stepper"
      >
        <button
          type="button"
          onClick={() => setDollars((d) => Math.max(10, d - 10))}
          aria-label="A$10 less"
          className="flex h-11 w-11 items-center justify-center rounded-circle border border-line-strong"
          data-testid="price-minus"
        >
          <MinusIcon width={16} height={16} />
        </button>
        <span className="text-center">
          <span className="block font-display text-[34px] leading-none" data-testid="quote-price">
            {formatPrice(cents)}
          </span>
          <span className="block text-[11px] text-muted">fabric and making</span>
        </span>
        <button
          type="button"
          onClick={() => setDollars((d) => d + 10)}
          aria-label="A$10 more"
          className="flex h-11 w-11 items-center justify-center rounded-circle border border-line-strong"
          data-testid="price-plus"
        >
          <PlusIcon width={16} height={16} />
        </button>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-app bg-stone px-3 py-2">
          <dt className="text-muted-2">You keep</dt>
          <dd className="text-[15px]" data-testid="you-keep">
            {formatPrice(youGet(cents, commissionPct))}
          </dd>
        </div>
        <div className="rounded-app bg-stone px-3 py-2">
          <dt className="text-muted-2">{CUSTOM.advancePct}% at fabric bought</dt>
          <dd className="text-[15px]" data-testid="advance-line">
            {formatPrice(advance)}
          </dd>
        </div>
      </dl>

      <p className="mt-5 text-[11px] uppercase tracking-label text-muted-2">
        Ready by{request.neededBy ? ` · they need it by ${fmtDayLong(request.neededBy)}` : ''}
      </p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Ready by">
        {chips.map((d) => (
          <Chip key={d} pressed={readyBy === d} onClick={() => setReadyBy(d)} testId={`ready-${d}`}>
            {fmtDayLong(d)}
          </Chip>
        ))}
      </div>
      {late && (
        <p className="mt-1 text-[12px] text-[#8A2E1C]">After their date. Say why in the note.</p>
      )}

      <p className="mt-5 text-[11px] uppercase tracking-label text-muted-2">Included</p>
      <div className="mt-2 space-y-2">
        <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={fabric}
            onChange={(e) => setFabric(e.target.checked)}
            className="h-5 w-5 accent-ink"
            data-testid="include-fabric"
          />
          Fabric
        </label>
        {fittingChoices.map((f) => (
          <label key={f.value} className="flex min-h-[44px] items-center gap-3 text-[14px]">
            <input
              type="radio"
              name="fittings"
              checked={fittings === f.value}
              onChange={() => setFittings(f.value)}
              className="h-5 w-5 accent-ink"
            />
            {f.label}
          </label>
        ))}
        <label className="flex min-h-[44px] items-center gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={canMake}
            onChange={(e) => setCanMake(e.target.checked)}
            className="h-5 w-5 accent-ink"
            data-testid="can-make"
          />
          I can make this to their measurements
        </label>
      </div>

      <label
        htmlFor="quote-note"
        className="mt-5 block text-[11px] uppercase tracking-label text-muted-2"
      >
        A note to them
      </label>
      <textarea
        id="quote-note"
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="How you’d make it, the fabric you have in mind, anything to check."
        className="mt-1 w-full rounded-app border border-line bg-surface px-3 py-2 text-[16px] focus:border-ink focus:outline-none"
        data-testid="quote-note"
      />
    </Sheet>
  );
}

/** Pass on a request with one reason. */
export function PassSheet({
  open,
  onOpenChange,
  requestId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  requestId: string;
}) {
  const router = useRouter();
  const [reason, setReason] = useState<string>(PASS_REASONS[0]!.value);
  const [pending, start] = useTransition();
  const pass = () =>
    start(async () => {
      const fd = new FormData();
      fd.set('requestId', requestId);
      fd.set('reason', reason);
      const res = await passRequestAction(undefined, fd);
      if (res?.ok === false) toast(res.message ?? 'Couldn’t pass.');
      else {
        toast('Passed');
        onOpenChange(false);
        router.refresh();
      }
    });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Pass on this one"
      testId="pass-sheet"
      footer={
        <AppButton onClick={pass} disabled={pending} className="w-full" data-testid="pass-confirm">
          Pass
        </AppButton>
      }
    >
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Why">
        {PASS_REASONS.map((r) => (
          <Chip
            key={r.value}
            pressed={reason === r.value}
            onClick={() => setReason(r.value)}
            testId={`pass-${r.value}`}
          >
            {r.label}
          </Chip>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-muted">
        The buyer sees “Not available this time”, never the reason.
      </p>
    </Sheet>
  );
}
