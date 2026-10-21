'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toggleSaveAction } from '@/lib/actions/social';
import { onLocalSavesChange, readLocalSaves, toggleLocalSave } from '@/lib/local-saves';
import { requestInstallSheet } from '@/lib/install/trigger';
import { HeartIcon } from '@/components/ui/icons';
import { toast } from './Toast';

/** A short buzz on Android (iOS ignores it). */
export const buzz = () => {
  try {
    navigator.vibrate?.(10);
  } catch {
    // Not allowed here: fine.
  }
};

/**
 * The app's heart: pops (1 → 1.4 → 1) and updates straight away; the save is sent after, and
 * rolled back with a toast if it fails. Signed out, the piece is kept on this device.
 */
export function Heart({
  productId,
  saved,
  title,
  size = 20,
  className = '',
  glass = false,
}: {
  productId: string;
  saved: boolean;
  title: string;
  size?: number;
  className?: string;
  glass?: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [on, setOn] = useState(saved);
  const [pop, setPop] = useState(0);
  useEffect(() => setOn(saved), [saved]);
  useEffect(() => {
    if (saved) return;
    const sync = () => {
      if (readLocalSaves().includes(productId)) setOn(true);
    };
    sync();
    return onLocalSavesChange(sync);
  }, [productId, saved]);

  useEffect(() => {
    const onLike = (e: Event) => {
      if ((e as CustomEvent<string>).detail === productId && !onRef.current) toggleRef.current();
    };
    window.addEventListener('oo:like', onLike);
    return () => window.removeEventListener('oo:like', onLike);
  }, [productId]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    setPop((n) => n + 1);
    if (next) {
      buzz();
      requestInstallSheet('saved_piece', 1500);
    }
    start(async () => {
      try {
        const res = await toggleSaveAction(productId);
        if (res.needsLogin) setOn(toggleLocalSave(productId));
        else router.refresh();
      } catch {
        setOn(!next);
        toast('Couldn’t save that. Try again.');
      }
    });
  };

  const onRef = useRef(on);
  onRef.current = on;
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${title} from likes` : `Like ${title}`}
      data-testid="heart"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }}
      className={`flex h-11 w-11 items-center justify-center ${glass ? 'glass-chip rounded-circle' : ''} ${on ? 'text-[#8A2E1C]' : 'text-ink'} ${className}`}
    >
      <span key={pop} className={pop ? 'heart-pop inline-flex' : 'inline-flex'}>
        <HeartIcon filled={on} width={size} height={size} strokeWidth={1.5} />
      </span>
    </button>
  );
}
