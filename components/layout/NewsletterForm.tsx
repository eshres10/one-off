'use client';

import { useState } from 'react';

/**
 * [placeholder] No email list provider is connected yet, so sign-ups are not stored.
 * Wire this to Resend Audiences (or similar) at launch.
 */
export function NewsletterForm() {
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p className="mt-4 text-[13px]" role="status">
        Thank you — we’ll be in touch before the next drop.
      </p>
    );
  return (
    <form
      className="mt-4 flex"
      onSubmit={(e) => {
        e.preventDefault();
        setDone(true);
      }}
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        placeholder="Email address"
        className="input flex-1"
      />
      <button
        type="submit"
        className="glass-dark min-h-[44px] px-5 text-[11px] uppercase tracking-label"
      >
        Join
      </button>
    </form>
  );
}
