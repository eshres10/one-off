import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { FollowButton } from '@/components/maker/FollowButton';
import type { SuggestedMaker } from '@/lib/queries/states';

/** A short list of makers with a Follow button each (avatar, name, craft · city state). */
export function SuggestedMakers({ makers }: { makers: SuggestedMaker[] }) {
  if (!makers.length) return null;
  return (
    <ul
      className="divide-y divide-line border-y border-line text-left"
      data-testid="suggested-makers"
    >
      {makers.map((m) => (
        <li key={m.id} className="flex items-center gap-3 py-3">
          <Link href={`/makers/${m.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-circle bg-stone">
              {m.avatarUrl ? (
                <Image src={m.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center font-display text-[18px]">
                  {m.displayName.charAt(0)}
                </span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[14px]">{m.displayName}</span>
              <span className="block truncate text-[12px] text-muted">
                {[m.craft, m.place].filter(Boolean).join(' · ')}
              </span>
            </span>
          </Link>
          <FollowButton makerId={m.id} following={false} makerName={m.displayName} />
        </li>
      ))}
    </ul>
  );
}
