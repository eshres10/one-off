'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { addReturnTrackingAction, startReturnAction } from '@/lib/actions/returns';
import { RETURN_REASONS, RETURN_STATUS_LABEL, type ReturnStatus } from '@/lib/returns/status';

export interface ReturnFlowItem {
  id: string;
  productTitle: string;
  variantLabel: string;
  imageUrl: string | null;
  makerName: string;
  /** "3 Nov": the last day to start the return. */
  returnBy: string;
  reportHref: string;
}

export interface ExistingReturn {
  id: string;
  number: string;
  status: ReturnStatus;
  address: string | null;
  carrier: string | null;
  tracking: string | null;
  /** "10 Nov": post it by then. */
  sendBy: string;
}

export interface ReturnSettings {
  condition: string;
  sendWithinDays: number;
  makerConfirmDays: number;
}

const choice =
  'flex min-h-[56px] cursor-pointer items-center gap-3 border border-line bg-surface px-4 text-[14px] has-[:checked]:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2';
const primary =
  'glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.2em] text-ground disabled:opacity-50';

/** Words that sound like a fault, not a change of mind: those go to "Report a problem". */
const FAULTY =
  /fault|damag|broken|hole|tear|torn|rip|stain|defect|wrong (size|item|colou?r)|not as described|missing/i;

const CARRIERS = [
  { value: 'auspost', label: 'Australia Post' },
  { value: 'sendle', label: 'Sendle' },
  { value: 'other', label: 'Other' },
] as const;

/**
 * Return a ready-to-ship piece, in four steps: why (optional) · confirm it's unworn with tags ·
 * where to send it, with tracking now or later · started. The maker's address is only shown once
 * the return exists. A right-hand drawer over the order on desktop; full screen on phone.
 */
export function ReturnFlow({
  item,
  backHref,
  existing,
  settings,
  closed,
}: {
  item: ReturnFlowItem;
  backHref: string;
  existing: ExistingReturn | null;
  settings: ReturnSettings;
  /** Shown instead of the steps when this piece can't be returned. */
  closed?: React.ReactNode;
}) {
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState(existing ? 3 : 1);
  const [reason, setReason] = useState<string>('');
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [ret, setRet] = useState<ExistingReturn | null>(existing);
  const [carrier, setCarrier] = useState<string>(existing?.carrier ?? 'auspost');
  const [tracking, setTracking] = useState(existing?.tracking ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => router.push(backHref);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && router.push(backHref);
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [router, backHref]);
  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>('h2')?.focus();
  }, [step]);

  const soundsFaulty = FAULTY.test(note);

  const begin = () =>
    start(async () => {
      setError(null);
      const res = await startReturnAction({
        orderItemId: item.id,
        reason: (reason || null) as never,
        reasonNote: note.trim() || null,
        conditionConfirmed: confirmed,
      });
      if (!res.ok) return setError(res.message);
      setRet({
        id: res.id,
        number: res.number,
        status: 'requested',
        address: res.address,
        carrier: null,
        tracking: null,
        sendBy: '',
      });
      setStep(3);
      router.refresh();
    });

  const saveTracking = (andFinish: boolean) =>
    start(async () => {
      setError(null);
      if (tracking.trim()) {
        const res = await addReturnTrackingAction({
          returnId: ret!.id,
          carrier: carrier as 'auspost',
          tracking,
        });
        if (!res.ok) return setError(res.message);
        setRet((r) => r && { ...r, status: 'in_transit', tracking, carrier });
      }
      if (andFinish) setStep(4);
      router.refresh();
    });

  let body: React.ReactNode;
  if (closed) body = closed;
  else if (step === 1)
    body = (
      <fieldset>
        <legend>
          <h2 tabIndex={-1} className="font-display text-[34px] leading-none outline-none">
            Why are you sending it back?
          </h2>
        </legend>
        <p className="mt-2 text-[13px] text-muted">Optional. It helps {item.makerName}.</p>
        <div className="mt-6 space-y-2" role="radiogroup">
          {RETURN_REASONS.map((r) => (
            <label key={r.value} className={choice}>
              <input
                type="radio"
                name={`${id}-reason`}
                value={r.value}
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="accent-ink"
                data-testid={`return-reason-${r.value}`}
              />
              {r.label}
            </label>
          ))}
        </div>
        {reason === 'other' && (
          <label className="mt-4 block text-[13px]">
            <span className="block">Tell us more</span>
            <textarea
              className="input mt-1 min-h-[90px]"
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="return-note"
            />
          </label>
        )}
        {soundsFaulty ? (
          <p
            className="mt-4 bg-stone px-4 py-3 text-[13px] leading-relaxed"
            role="status"
            data-testid="fault-hint"
          >
            That sounds like a fault. Report a problem instead: it’s free, and {item.makerName} will
            repair, replace or refund it.{' '}
            <Link href={item.reportHref} className="underline underline-offset-[3px]">
              Report a problem
            </Link>
          </p>
        ) : (
          <p className="mt-4 text-[12px] text-muted">
            Faulty or not as described?{' '}
            <Link href={item.reportHref} className="underline underline-offset-[3px]">
              Report a problem
            </Link>{' '}
            instead.
          </p>
        )}
        <div className="mt-8">
          <button
            type="button"
            onClick={() => setStep(2)}
            className={primary}
            data-testid="return-next"
          >
            Continue
          </button>
        </div>
      </fieldset>
    );
  else if (step === 2)
    body = (
      <div>
        <h2 tabIndex={-1} className="font-display text-[34px] leading-none outline-none">
          Check its condition
        </h2>
        <p className="mt-3 text-[14px] leading-relaxed">
          Change-of-mind returns need to arrive back {settings.condition}, so {item.makerName} can
          sell it again.
        </p>
        <label className={`${choice} mt-6`}>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="accent-ink"
            data-testid="return-condition"
          />
          It’s unworn, with tags and original packaging.
        </label>
        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          Return postage is on you. Once {item.makerName} has it, you’re refunded the item price to
          how you paid. Original shipping isn’t refunded.
        </p>
        {error && (
          <p className="mt-4 bg-error-bg px-3 py-2.5 text-[13px] text-error" role="alert">
            {error}
          </p>
        )}
        <div className="mt-8">
          <button
            type="button"
            onClick={begin}
            disabled={!confirmed || pending}
            className={primary}
            data-testid="return-start"
          >
            {pending ? 'Starting…' : 'Start return'}
          </button>
        </div>
      </div>
    );
  else if (step === 3 && ret)
    body = (
      <div data-testid="return-instructions">
        <h2 tabIndex={-1} className="font-display text-[34px] leading-none outline-none">
          {ret.status === 'requested' || ret.status === 'in_transit'
            ? 'Where to send it'
            : RETURN_STATUS_LABEL[ret.status]}
        </h2>
        <p className="mt-1 text-[12px] uppercase tracking-label text-muted">
          Return {ret.number} · {RETURN_STATUS_LABEL[ret.status]}
        </p>
        <div
          className="mt-6 bg-stone px-4 py-4 text-[14px] leading-relaxed"
          data-testid="return-address"
        >
          {ret.address ? (
            <p className="whitespace-pre-line">{ret.address}</p>
          ) : (
            <p>
              {item.makerName} will message you their return address shortly. We’ve let them know.
            </p>
          )}
        </div>
        <p className="mt-4 text-[14px]">
          Send it with tracking within {settings.sendWithinDays} days
          {ret.sendBy ? ` (by ${ret.sendBy})` : ''}.
        </p>
        {(ret.status === 'requested' || ret.status === 'in_transit') && (
          <div className="mt-6 space-y-3">
            <label className="block text-[13px]">
              <span className="block">Carrier</span>
              <select
                className="input mt-1"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
              >
                {CARRIERS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[13px]">
              <span className="block">Tracking number</span>
              <input
                className="input mt-1"
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="You can add this later"
                data-testid="return-tracking"
              />
            </label>
          </div>
        )}
        {error && (
          <p className="mt-4 bg-error-bg px-3 py-2.5 text-[13px] text-error" role="alert">
            {error}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          {ret.status === 'requested' || ret.status === 'in_transit' ? (
            <button
              type="button"
              onClick={() => saveTracking(true)}
              disabled={pending}
              className={primary}
              data-testid="return-done"
            >
              {tracking.trim() ? (pending ? 'Saving…' : 'Save tracking') : 'Add tracking later'}
            </button>
          ) : (
            <Link href={backHref} className={primary}>
              Back to your order
            </Link>
          )}
        </div>
      </div>
    );
  else
    body = (
      <div data-testid="return-sent">
        <h2 tabIndex={-1} className="font-display text-[40px] leading-none outline-none">
          Return started.
        </h2>
        <ol className="mt-8 space-y-5">
          {[
            'Send it back.',
            `${item.makerName} confirms it’s arrived (within ${settings.makerConfirmDays} business days).`,
            'Refund to your original payment method. The item price is refunded; original shipping isn’t.',
          ].map((t, i) => (
            <li key={t} className="flex gap-4 text-[14px]">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-circle border border-ink text-[12px]">
                {i + 1}
              </span>
              <span className="pt-1">{t}</span>
            </li>
          ))}
        </ol>
        <div className="mt-10 flex flex-col gap-3">
          <Link href={backHref} className={primary}>
            Back to your order
          </Link>
        </div>
        {ret && (
          <p
            className="mt-8 border-t border-line pt-4 text-[12px] text-muted"
            data-testid="return-number"
          >
            Return {ret.number}
          </p>
        )}
      </div>
    );

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Return this piece"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 hidden cursor-default bg-[rgba(17,17,17,0.28)] md:block"
      />
      <div
        ref={panelRef}
        className="absolute inset-0 flex flex-col overflow-y-auto bg-ground md:left-auto md:w-[520px] md:bg-[rgba(246,244,240,0.86)] md:shadow-[-12px_0_40px_rgba(17,17,17,0.12)] md:backdrop-blur-xl"
        data-testid="return-drawer"
      >
        <header className="sticky top-0 z-[1] bg-ground/95 px-5 pb-4 pt-4 backdrop-blur md:bg-transparent md:px-8 md:pt-6">
          <div className="flex items-center justify-between">
            {step === 2 && !closed ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[44px] text-[12px] uppercase tracking-label"
              >
                ‹ Back
              </button>
            ) : (
              <span className="text-[11px] uppercase tracking-label">Return this piece</span>
            )}
            <button
              type="button"
              onClick={close}
              className="flex h-11 w-11 items-center justify-center text-[22px]"
              aria-label="Close"
              data-testid="return-close"
            >
              ×
            </button>
          </div>
          {!closed && step < 4 && (
            <div
              className="mt-2 grid grid-cols-3 gap-1"
              aria-label={`Step ${step} of 3`}
              role="img"
            >
              {[1, 2, 3].map((n) => (
                <span key={n} className={`h-[3px] ${n <= step ? 'bg-ink' : 'bg-line'}`} />
              ))}
            </div>
          )}
        </header>
        <div className="flex-1 px-5 pb-10 md:px-8">
          <div className="mb-6 flex items-center gap-3 border-b border-line pb-4">
            <span className="relative aspect-4/5 w-12 shrink-0 overflow-hidden bg-stone-light">
              {item.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </span>
            <span className="min-w-0 text-[13px]">
              <span className="block truncate">{item.productTitle}</span>
              <span className="block truncate text-muted">
                {item.variantLabel.replace(/^AU /, 'Size ')} · {item.makerName}
                {!existing && !closed ? ` · Return by ${item.returnBy}` : ''}
              </span>
            </span>
          </div>
          {body}
        </div>
      </div>
    </div>
  );
}
