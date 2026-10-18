import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { requireUser } from '@/lib/auth/session';
import { getFollowedMakers } from '@/lib/queries/account';
import { FollowButton } from '@/components/maker/FollowButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';

export const metadata = { title: 'Following' };

export default async function FollowingPage() {
  const user = await requireUser('/account/following');
  const makers = await getFollowedMakers(user);
  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex items-end justify-between">
        <h1 className="text-3xl">Makers you follow</h1>
        {makers.length > 0 && (
          <Link href="/?tab=following" className="text-sm underline underline-offset-4">
            See their newest pieces
          </Link>
        )}
      </div>
      {makers.length === 0 ? (
        <EmptyState
          title="You’re not following anyone yet"
          action={<ButtonLink href="/makers">Browse makers</ButtonLink>}
        >
          Follow makers to see their new pieces first.
        </EmptyState>
      ) : (
        <ul
          className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
          role="list"
        >
          {makers.map((m) => (
            <li key={m.id} className="flex items-center gap-4 p-4">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full bg-stone-light">
                {m.avatarUrl && (
                  <Image src={m.avatarUrl} alt="" fill sizes="48px" className="object-cover" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={`/makers/${m.slug}`} className="font-medium hover:underline">
                  {m.displayName}
                </Link>
                <p className="truncate text-sm text-ink-muted">
                  {m.city} · {m.tagline}
                </p>
              </div>
              <FollowButton makerId={m.id} following makerName={m.displayName} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
