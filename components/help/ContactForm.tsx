'use client';

import { useState, useTransition } from 'react';
import { supportRequestAction } from '@/lib/actions/support';

const TOPICS = [
  { value: 'order', label: 'An order' },
  { value: 'returns', label: 'Returns or a problem' },
  { value: 'payments', label: 'Payments' },
  { value: 'selling', label: 'Selling on Off One' },
  { value: 'other', label: 'Something else' },
];

/** "Message us": goes to the support inbox (and is kept, so nothing gets lost). */
export function ContactForm({ onCancel }: { onCancel: () => void }) {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sent)
    return (
      <p className="mt-4 text-[14px] leading-relaxed" role="status" data-testid="contact-sent">
        Thanks, it’s with us. We’ll reply by email within one business day.
      </p>
    );
  return (
    <form
      className="mt-4 space-y-3 text-[13px]"
      data-testid="contact-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          setError(null);
          const res = await supportRequestAction({
            name: String(f.get('name') ?? ''),
            email: String(f.get('email') ?? ''),
            topic: String(f.get('topic') ?? 'other'),
            orderNumber: String(f.get('orderNumber') ?? ''),
            message: String(f.get('message') ?? ''),
          });
          if (res.ok) setSent(true);
          else setError(res.message);
        });
      }}
    >
      <label className="block">
        <span className="label">Your name</span>
        <input name="name" required maxLength={120} className="input" autoComplete="name" />
      </label>
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required className="input" autoComplete="email" />
      </label>
      <label className="block">
        <span className="label">About</span>
        <select name="topic" className="input" defaultValue="order">
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Order number (if it’s about one)</span>
        <input name="orderNumber" maxLength={40} className="input" placeholder="OO-1042" />
      </label>
      <label className="block">
        <span className="label">Message</span>
        <textarea
          name="message"
          required
          minLength={10}
          maxLength={4000}
          className="input min-h-[110px]"
        />
      </label>
      {error && (
        <p className="bg-error-bg px-3 py-2 text-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={pending}
          className="glass-dark min-h-[48px] flex-1 text-[11px] uppercase tracking-[0.2em] text-ground disabled:opacity-60"
          data-testid="contact-send"
        >
          {pending ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] border border-ink px-4 text-[11px] uppercase tracking-[0.18em]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
