'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { reportProblemAction } from '@/lib/actions/claims';
import {
  CLAIM_REASONS,
  PHOTO_REQUIRED_REASONS,
  REPORT_REASONS,
  REQUESTED_OUTCOMES,
} from '@/lib/content/returns';
import { SITE } from '@/lib/site/config';
import { MAX_PHOTOS, typeOf, upload, type Photo } from './upload';

export interface ReportItem {
  id: string;
  productTitle: string;
  variantLabel: string;
  imageUrl: string | null;
  makerName: string;
  isMto: boolean;
  /** The piece’s change-of-mind line from lib/returns/policy (summary). */
  returnSummary: string;
  /** Set when the piece can be returned for a change of mind instead. */
  returnHref?: string | null;
}

const label = (v: string) => CLAIM_REASONS.find((r) => r.value === v)?.label ?? v;
const choice =
  'flex min-h-[56px] cursor-pointer items-center gap-3 border border-line bg-surface px-4 text-[14px] has-[:checked]:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2';

/**
 * Report a problem, in four steps: what's wrong · photos and words · what would make it right ·
 * sent. A right-hand drawer over the order on desktop; full screen with a 3-part bar on phone.
 */
export function ReportFlow({
  item,
  backHref,
  closed,
}: {
  item: ReportItem;
  backHref: string;
  /** Shown instead of the steps when reporting here isn't possible (not delivered, too late). */
  closed?: React.ReactNode;
}) {
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState(1);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [outcome, setOutcome] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ caseNumber: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
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
    panelRef.current?.querySelector<HTMLElement>('h2, [data-autofocus]')?.focus();
  }, [step, sent]);

  const reasons = REPORT_REASONS.filter((r) => item.isMto || r !== 'custom_fit');
  const uploading = photos.some((p) => p.status === 'uploading');
  const done = photos.filter((p) => p.status === 'done' && p.path);
  const needPhoto = PHOTO_REQUIRED_REASONS.includes(reason);
  const len = details.trim().length;
  const step2Ok = len >= 20 && len <= 1000 && !uploading && (!needPhoto || done.length > 0);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.filter((p) => p.status !== 'error').length;
    for (const file of Array.from(files).slice(0, Math.max(0, room))) {
      const key = `${file.name}-${file.size}-${Math.random()}`;
      const preview = /^image\/(jpeg|png)$/.test(typeOf(file)) ? URL.createObjectURL(file) : null;
      setPhotos((prev) => [...prev, { key, name: file.name, preview, status: 'uploading' }]);
      upload(file)
        .then((path) =>
          setPhotos((prev) =>
            prev.map((p) => (p.key === key ? { ...p, status: 'done', path } : p)),
          ),
        )
        .catch((err: Error) =>
          setPhotos((prev) =>
            prev.map((p) => (p.key === key ? { ...p, status: 'error', error: err.message } : p)),
          ),
        );
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const send = () =>
    start(async () => {
      setError(null);
      const res = await reportProblemAction({
        orderItemId: item.id,
        reason,
        details,
        photos: done.map((p) => p.path!),
        outcome,
      });
      if (res.ok) {
        setSent({ caseNumber: res.caseNumber });
        router.refresh();
      } else {
        setError(res.errors ? Object.values(res.errors)[0]! : (res.message ?? 'Please try again.'));
        if (res.errors?.reason) setStep(1);
        else if (res.errors?.details || res.errors?.photos) setStep(2);
      }
    });

  const next = (
    <button
      type="button"
      onClick={() => setStep((s) => s + 1)}
      disabled={step === 1 ? !reason : !step2Ok}
      className="glass-dark min-h-[52px] w-full text-[11px] uppercase tracking-[0.2em] text-ground disabled:opacity-50"
      data-testid="report-next"
    >
      Continue
    </button>
  );

  let body: React.ReactNode;
  if (closed) body = closed;
  else if (sent)
    body = (
      <div data-testid="report-sent">
        <h2 tabIndex={-1} className="font-display text-[40px] leading-none outline-none">
          We’re on it.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed">
          {item.makerName} has your report and photos and will reply in your messages within{' '}
          {SITE.cases.makerReplyBusinessDays} business days.
        </p>
        <ol className="mt-8 space-y-5">
          {[
            'They reply with a fix.',
            'If they need it back, we email you a prepaid label.',
            `No reply, or no agreement? One Off decides within ${SITE.cases.platformDecisionBusinessDays} business days.`,
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
          <Link
            href="/messages"
            className="glass-dark flex min-h-[52px] items-center justify-center text-[11px] uppercase tracking-[0.2em] text-ground"
          >
            Go to messages
          </Link>
          <Link
            href={backHref}
            className="flex min-h-[44px] items-center justify-center text-[12px] underline underline-offset-[3px]"
          >
            Back to your order
          </Link>
        </div>
        <p
          className="mt-8 border-t border-line pt-4 text-[12px] text-muted"
          data-testid="case-number"
        >
          Case {sent.caseNumber}
        </p>
      </div>
    );
  else if (step === 1)
    body = (
      <fieldset>
        <legend>
          <h2 tabIndex={-1} className="font-display text-[32px] leading-none outline-none">
            What’s wrong?
          </h2>
        </legend>
        <div className="mt-6 space-y-2">
          {reasons.map((r) => (
            <label key={r} className={choice}>
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-ink"
                data-testid={`reason-${r}`}
              />
              {label(r)}
            </label>
          ))}
        </div>
        <p className="mt-6 bg-stone px-4 py-3 text-[13px] leading-relaxed">
          {item.returnHref ? (
            <>
              Changed your mind? This piece is ready to ship, so you can{' '}
              <a href={item.returnHref} className="underline underline-offset-[3px]">
                return it instead
              </a>
              .
            </>
          ) : (
            <>
              Changed your mind? {item.returnSummary.replace(/\.$/, '')}, but you can message the
              maker. Many are happy to help.
            </>
          )}
        </p>
        <div className="mt-8">{next}</div>
      </fieldset>
    );
  else if (step === 2)
    body = (
      <div>
        <h2 tabIndex={-1} className="font-display text-[32px] leading-none outline-none">
          Show us what happened
        </h2>
        <div className="mt-6">
          <p id={`${id}-ph`} className="text-[11px] uppercase tracking-label">
            Photos {needPhoto ? '(1–6)' : '(up to 6)'}
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-2" aria-label="Photos added">
            {photos.map((p) => (
              <li key={p.key} className="relative">
                <div className="flex aspect-square items-center justify-center overflow-hidden bg-stone-light">
                  {p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt={p.name} className="h-full w-full object-cover" />
                  ) : (
                    <span className="px-1 text-center text-[10px] text-muted">{p.name}</span>
                  )}
                </div>
                <p
                  className={`mt-1 text-[11px] ${p.status === 'error' ? 'text-error' : 'text-muted-2'}`}
                  aria-live="polite"
                >
                  {p.status === 'uploading'
                    ? 'Uploading…'
                    : p.status === 'done'
                      ? 'Added'
                      : p.error}
                </p>
                <button
                  type="button"
                  onClick={() => setPhotos((prev) => prev.filter((x) => x.key !== p.key))}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center bg-[rgba(246,244,240,0.92)] text-[14px]"
                  aria-label={`Remove ${p.name}`}
                >
                  ×
                </button>
              </li>
            ))}
            {photos.filter((p) => p.status !== 'error').length < MAX_PHOTOS && (
              <li>
                <label className="flex aspect-square cursor-pointer items-center justify-center border border-dashed border-line-strong text-[24px] text-muted hover:border-ink has-[:focus-visible]:outline has-[:focus-visible]:outline-2">
                  <span aria-hidden>+</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif"
                    multiple
                    className="sr-only"
                    aria-labelledby={`${id}-ph`}
                    onChange={(ev) => addFiles(ev.target.files)}
                    data-testid="report-photos"
                  />
                </label>
              </li>
            )}
          </ul>
          <p className="mt-2 text-[12px] text-muted-2">JPG, PNG or HEIC, up to 10 MB each.</p>
        </div>
        <div className="mt-6">
          <label htmlFor={`${id}-d`} className="text-[11px] uppercase tracking-label">
            Tell us more
          </label>
          <textarea
            id={`${id}-d`}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={1000}
            rows={6}
            className="mt-2 min-h-[140px] w-full border border-line-strong bg-surface p-3 text-[15px]"
            placeholder="Where is the problem, and when did you notice it?"
            data-testid="report-details"
          />
          <p className="mt-1 text-[12px] text-muted-2" aria-live="polite">
            {len < 20 ? `At least 20 characters (${len}/20)` : `${len}/1000`}
          </p>
        </div>
        <div className="mt-8">{next}</div>
      </div>
    );
  else
    body = (
      <fieldset>
        <legend>
          <h2 tabIndex={-1} className="font-display text-[32px] leading-none outline-none">
            What would make it right?
          </h2>
        </legend>
        <div className="mt-6 space-y-2">
          {REQUESTED_OUTCOMES.map((o) => (
            <label key={o.value} className={`${choice} py-3`}>
              <input
                type="radio"
                name="outcome"
                value={o.value}
                checked={outcome === o.value}
                onChange={() => setOutcome(o.value)}
                className="accent-ink"
                data-testid={`outcome-${o.value}`}
              />
              <span>
                <span className="block">{o.label}</span>
                <span className="block text-[12px] text-muted">{o.detail}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-6 text-[13px] leading-relaxed text-muted">
          The maker usually offers what you ask for. Your rights under Australian Consumer Law
          always apply.
        </p>
        {error && (
          <p className="mt-4 text-[13px] text-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={send}
          disabled={!outcome || pending}
          className="glass-dark mt-8 min-h-[52px] w-full text-[11px] uppercase tracking-[0.2em] text-ground disabled:opacity-50"
          data-testid="send-to-maker"
        >
          {pending ? 'Sending…' : 'Send to maker'}
        </button>
      </fieldset>
    );

  return (
    <div
      className="fixed inset-0 z-[70]"
      role="dialog"
      aria-modal="true"
      aria-label="Report a problem"
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
        data-testid="report-drawer"
      >
        <header className="sticky top-0 z-[1] bg-ground/95 px-5 pb-4 pt-4 backdrop-blur md:bg-transparent md:px-8 md:pt-6">
          <div className="flex items-center justify-between">
            {step > 1 && !sent && !closed ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="min-h-[44px] text-[12px] uppercase tracking-label"
              >
                ‹ Back
              </button>
            ) : (
              <span className="text-[11px] uppercase tracking-label">Report a problem</span>
            )}
            <button
              type="button"
              onClick={close}
              className="flex h-11 w-11 items-center justify-center text-[22px]"
              aria-label="Close"
              data-testid="report-close"
            >
              ×
            </button>
          </div>
          {!sent && !closed && (
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
              </span>
            </span>
          </div>
          {body}
        </div>
      </div>
    </div>
  );
}
