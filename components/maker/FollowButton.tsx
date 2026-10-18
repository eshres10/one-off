'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { toggleFollowAction } from '@/lib/actions/social';

export function FollowButton({
  makerId,
  following,
  makerName,
}: {
  makerId: string;
  following: boolean;
  makerName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(following);
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Unfollow ${makerName}` : `Follow ${makerName}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          setOptimistic(!optimistic);
          const res = await toggleFollowAction(makerId);
          if (res.needsLogin)
            router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          else router.refresh();
        })
      }
      className={`h-11 rounded-full px-6 text-[15px] font-medium transition ${
        optimistic
          ? 'border border-ink bg-transparent text-ink hover:bg-stone-light'
          : 'bg-ink text-paper hover:bg-ink-soft'
      }`}
    >
      {optimistic ? 'Following' : 'Follow'}
    </button>
  );
}
