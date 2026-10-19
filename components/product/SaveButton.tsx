'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toggleSaveAction } from '@/lib/actions/social';
import { onLocalSavesChange, readLocalSaves, toggleLocalSave } from '@/lib/local-saves';
import { HeartIcon } from '@/components/ui/icons';
import { requestInstallSheet } from '@/lib/install/trigger';

/**
 * Heart toggle. Signed in, it saves to the account; signed out, it keeps the piece in this
 * browser (merged into the account at sign-in) instead of forcing a login.
 */
export function SaveButton({
  productId,
  saved,
  title,
  className = '',
  boxed = false,
}: {
  productId: string;
  saved: boolean;
  title: string;
  className?: string;
  boxed?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(saved);
  useEffect(() => setOn(saved), [saved]);
  useEffect(() => {
    if (saved) return;
    const sync = () => {
      if (readLocalSaves().includes(productId)) setOn(true);
    };
    sync();
    return onLocalSavesChange(sync);
  }, [productId, saved]);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${title} from saved` : `Save ${title}`}
      disabled={pending}
      data-testid="save-button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !on;
        setOn(next);
        // Saved (not unsaved): after the heart has had its moment, maybe offer the home screen.
        if (next) requestInstallSheet('saved_piece', 1500);
        start(async () => {
          const res = await toggleSaveAction(productId);
          if (res.needsLogin) setOn(toggleLocalSave(productId));
          else router.refresh();
        });
      }}
      className={`relative z-10 flex h-11 w-11 items-center justify-center text-ink ${boxed ? 'glass-chip' : ''} ${className}`}
    >
      <HeartIcon filled={on} width={16} height={16} />
    </button>
  );
}
