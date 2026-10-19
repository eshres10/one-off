'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { sendQuoteAction } from '@/lib/actions/messages';
import { DEFAULT_PLATFORM_FEE_BPS, sellerNetCents } from '@/lib/domain/commission';
import { formatPrice } from '@/lib/domain/money';
import type { FormState } from '@/lib/validation';
import { CloseIcon } from '@/components/ui/icons';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      data-testid="send-quote"
      className="glass-dark min-h-[48px] w-full text-[11px] uppercase tracking-label disabled:opacity-60"
    >
      {pending ? 'Sending…' : 'Send quote'}
    </button>
  );
}

/**
 * Inline quote form for custom requests (a bottom sheet on phones). Shows what the maker takes
 * home after the platform fee as they type.
 */
export function QuotePanel({
  threadId,
  onClose,
  onSent,
  feeBps = DEFAULT_PLATFORM_FEE_BPS,
}: {
  threadId: string;
  onClose: () => void;
  onSent: () => void;
  feeBps?: number;
}) {
  const [state, action] = useFormState<FormState, FormData>(sendQuoteAction, undefined);
  const [price, setPrice] = useState('');
  const [pct, setPct] = useState('30');
  const [weeks, setWeeks] = useState('3');
  useEffect(() => {
    if (state?.ok) onSent();
  }, [state, onSent]);

  const cents = Math.round((Number(price) || 0) * 100);
  const deposit = Math.round((cents * (Number(pct) || 0)) / 100);
  const net = cents > 0 ? sellerNetCents(cents, feeBps) : 0;
  const err = (k: string) =>
    state?.errors?.[k] ? <p className="mt-1 text-[12px] text-error">{state.errors[k]}</p> : null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-ground p-4 shadow-[0_-8px_24px_rgba(17,17,17,0.08)] md:static md:z-auto md:border md:p-5 md:shadow-none"
      role="dialog"
      aria-label="Send a quote"
      data-testid="quote-panel"
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-label">Send a quote</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close quote"
          className="-m-2 flex h-11 w-11 items-center justify-center"
        >
          <CloseIcon width={14} height={14} />
        </button>
      </div>
      <form action={action} className="mt-3">
        <input type="hidden" name="threadId" value={threadId} />
        <div className="grid grid-cols-3 gap-2">
          <label className="block">
            <span className="label">Price A$</span>
            <input
              name="price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))}
              className="input"
              required
              data-testid="quote-price"
            />
            {err('price')}
          </label>
          <label className="block">
            <span className="label">Deposit %</span>
            <input
              name="depositPct"
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/\D/g, '').slice(0, 3))}
              className="input"
              required
            />
            {err('depositPct')}
          </label>
          <label className="block">
            <span className="label">Weeks to make</span>
            <input
              name="weeks"
              inputMode="numeric"
              value={weeks}
              onChange={(e) => setWeeks(e.target.value.replace(/\D/g, '').slice(0, 2))}
              className="input"
              required
            />
            {err('weeks')}
          </label>
        </div>
        <label className="mt-3 block">
          <span className="label">Note (optional)</span>
          <textarea name="note" rows={2} maxLength={1000} className="input" />
        </label>
        <p className="mt-3 text-[12px] text-muted" aria-live="polite" data-testid="quote-net">
          You receive {formatPrice(net)} after the {feeBps / 100}% fee · deposit{' '}
          {formatPrice(deposit)} is paid upfront
        </p>
        {state?.ok === false && state.message && (
          <p className="mt-2 bg-error-bg px-3 py-2 text-[12px] text-error" role="alert">
            {state.message}
          </p>
        )}
        <div className="mt-3">
          <Submit />
        </div>
      </form>
    </div>
  );
}
