'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { restockAlertAction } from '@/lib/actions/social';

/**
 * A ready-to-ship size that's sold out: say so, offer to have one made when the maker does made
 * to order, and always offer "Notify me if {size} comes back".
 */
export function SoldOutSize({
  variantId,
  size,
  signedIn,
  makeToOrder,
}: {
  variantId: string;
  size: string;
  signedIn: boolean;
  makeToOrder: { makerName: string; leadDays: number; price: string; href: string } | null;
}) {
  const [email, setEmail] = useState('');
  const [askEmail, setAskEmail] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const notify = () => {
    if (!signedIn && !askEmail) return setAskEmail(true);
    start(async () => {
      const res = await restockAlertAction(variantId, signedIn ? undefined : email);
      setMsg({ ok: res.ok, text: res.message });
    });
  };
  return (
    <div className="mt-4 space-y-3" data-testid="size-sold-out">
      <div className="bg-stone px-4 py-3 text-[13px] leading-relaxed">
        <p>Size {size} is sold out, ready to ship.</p>
        {makeToOrder && (
          <p className="mt-1 text-muted">
            {makeToOrder.makerName} can make one in your size in about {makeToOrder.leadDays} days.
          </p>
        )}
      </div>
      {makeToOrder && (
        <Link
          href={makeToOrder.href}
          className="glass-dark flex min-h-[52px] w-full items-center justify-center px-6 text-[11px] uppercase tracking-[0.2em] text-ground"
          data-testid="have-it-made"
        >
          Have it made in size {size} · {makeToOrder.price}
        </Link>
      )}
      {msg?.ok ? (
        <p className="text-[13px]" role="status" data-testid="restock-confirmed">
          {msg.text}
        </p>
      ) : (
        <>
          {askEmail && !signedIn && (
            <label className="block text-[11px] uppercase tracking-label">
              Your email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 min-h-[48px] w-full border border-line-strong bg-surface px-3 text-[15px] normal-case tracking-normal"
                data-testid="restock-email"
              />
            </label>
          )}
          <button
            type="button"
            onClick={notify}
            disabled={pending}
            className="flex min-h-[52px] w-full items-center justify-center border border-ink px-6 text-[11px] uppercase tracking-[0.2em] hover:bg-ink hover:text-ground disabled:opacity-60"
            data-testid="notify-restock"
          >
            {pending ? 'Saving…' : `Notify me if ${size} comes back`}
          </button>
          {msg && !msg.ok && (
            <p className="text-[12px] text-error" role="alert">
              {msg.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}
