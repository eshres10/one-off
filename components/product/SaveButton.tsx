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
      className={`relative z-10 flex h-11 w-11 items-center justify-center text-ink ${boxed ? 'bg-[rgba(246,244,240,0.92)]' : ''} ${className}`}
    >
      <HeartIcon filled={optimistic} width={16} height={16} />
    </button>
  );
}
