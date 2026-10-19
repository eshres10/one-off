'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { adminReturnAction } from '@/lib/actions/returns';

/** Force a refund or close a return as not accepted (a note is required), or start the maker's clock. */
export function AdminReturnActions({
  returnId,
  canMarkDelivered,
}: {
  returnId: string;
  canMarkDelivered: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: 'refund' | 'reject' | 'delivered') =>
    start(async () => {
      setError(null);
      const res = await adminReturnAction({ returnId, action, note });
      if (!res.ok) return setError(res.message);
      setNote('');
      router.refresh();
    });
  const btn = 'min-h-[40px] px-3 text-[11px] uppercase tracking-label disabled:opacity-50';
  return (
    <div className="space-y-2" data-testid="admin-return-actions">
      <textarea
        className="input min-h-[60px] text-[13px]"
        placeholder="Note (required to refund or reject)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        data-testid="admin-return-note"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || note.trim().length < 10}
          onClick={() => run('refund')}
          className={`${btn} glass-dark text-ground`}
          data-testid="admin-return-refund"
        >
          Force refund
        </button>
        <button
          type="button"
          disabled={pending || note.trim().length < 10}
          onClick={() => run('reject')}
          className={`${btn} border border-ink`}
          data-testid="admin-return-reject"
        >
          Mark rejected
        </button>
        {canMarkDelivered && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run('delivered')}
            className={`${btn} underline`}
          >
            Delivered to maker
          </button>
        )}
      </div>
      {error && (
        <p className="text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
