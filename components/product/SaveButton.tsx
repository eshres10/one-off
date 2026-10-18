'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { toggleSaveAction } from '@/lib/actions/social';
import { HeartIcon } from '@/components/ui/icons';

export function SaveButton({
  productId,
  saved,
  title,
  className = '',
}: {
  productId: string;
  saved: boolean;
  title: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(saved);
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Remove ${title} from saved` : `Save ${title}`}
      disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        start(async () => {
          setOptimistic(!optimistic);
          const res = await toggleSaveAction(productId);
          if (res.needsLogin)
            router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          else router.refresh();
        });
      }}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-ink shadow-sm backdrop-blur transition hover:scale-105 ${className}`}
    >
      <HeartIcon
        filled={optimistic}
        width={18}
        height={18}
        className={optimistic ? 'text-alert' : ''}
      />
    </button>
  );
}
