'use client';

import { useRouter } from 'next/navigation';
import { useOptimistic, useTransition } from 'react';
import { toggleFollowAction } from '@/lib/actions/social';
import { boxButtonClass, buttonClass } from '@/components/ui/Button';

export function FollowButton({
  makerId,
  following,
  makerName,
  look = 'outline',
}: {
  makerId: string;
  following: boolean;
  makerName: string;
  look?: 'outline' | 'box';
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
      className={
        look === 'box'
          ? boxButtonClass('w-full')
          : buttonClass(optimistic ? 'secondary' : 'primary', 'sm')
      }
    >
      {optimistic ? 'Following' : 'Follow'}
    </button>
  );
}
