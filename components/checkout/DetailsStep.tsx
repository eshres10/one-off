'use client';

import { useState, useTransition } from 'react';
import { magicLinkAction } from '@/lib/actions/auth';
import { saveDetailsAction } from '@/lib/actions/checkout';
import type { CheckoutView } from '@/lib/services/checkout';

export const stepButton =
  'glass-dark flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground disabled:opacity-60';

/** 01 Your details: email and mobile, or a sign-in link to fill everything in. */
export function DetailsStep({
  view,
  onSaved,
  setBusy,
}: {
  view: CheckoutView;
  onSaved: (v: CheckoutView) => void;
  setBusy: (b: boolean) => void;
}) {
  const [email, setEmail] = useState(view.email);
  const [phone, setPhone] = useState(view.phone);
  const [error, setError] = useState<string | null>(null);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    start(async () => {
      const res = await saveDetailsAction({ email, phone });
      setBusy(false);
      if (!res.ok) setError(res.message);
      else {
        setError(null);
        onSaved(res.view);
      }
    });
  };

  const sendLink = () =>
    start(async () => {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setLinkNote('Enter your email first, then we’ll send the link.');
        return;
      }
      const fd = new FormData();
      fd.set('email', email.trim());
      fd.set('next', '/checkout');
      const res = await magicLinkAction(undefined, fd);
      setLinkNote(res?.message ?? null);
    });

  return (
    <form id="checkout-form-1" onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="co-email" className="label">
            Email
          </label>
          <input
            id="co-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            data-testid="co-email"
          />
        </div>
        <div>
          <label htmlFor="co-phone" className="label">
            Mobile, for delivery updates
          </label>
          <input
            id="co-phone"
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input"
            data-testid="co-phone"
          />
        </div>
      </div>
      {!view.signedIn && (
        <p className="text-[13px] leading-relaxed text-muted" data-testid="guest-line">
          Checking out as a guest. Bought here before?{' '}
          <button
            type="button"
            onClick={sendLink}
            className="text-ink underline underline-offset-4"
            data-testid="send-sign-in-link"
          >
            Get a sign-in link
          </button>{' '}
          and we’ll fill this in. No password needed.
        </p>
      )}
      {linkNote && (
        <p className="bg-stone p-3 text-[13px]" role="status">
          {linkNote}
        </p>
      )}
      {error && (
        <p className="text-[13px] text-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${stepButton} max-md:hidden`}>
        {pending ? 'Saving…' : 'Continue to delivery'}
      </button>
    </form>
  );
}
