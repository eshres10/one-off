import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { ChevronIcon } from '@/components/ui/icons';

export function responseTimeLabel(hours: number) {
  if (hours <= 1) return 'Usually replies within an hour';
  if (hours < 24) return `Usually replies within ${hours} hours`;
  const days = Math.round(hours / 24);
  return `Usually replies within ${days} day${days > 1 ? 's' : ''}`;
}

export interface MakerStripData {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  location: string | null;
  rating: number;
  reviewCount: number;
  responseTimeHours: number;
}

/** Avatar, name, location, ★ rating (count) and response time — product page, threads, bag. */
export function MakerStrip({
  maker,
  linked = true,
  bordered = true,
}: {
  maker: MakerStripData;
  linked?: boolean;
  bordered?: boolean;
}) {
  const inner = (
    <>
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-circle bg-stone-light">
        {maker.avatarUrl && (
          <Image src={maker.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px]">
          <span className="font-normal">{maker.displayName}</span>
          {maker.location && <span className="text-muted-2"> · {maker.location}</span>}
        </span>
        <span className="block text-[12px] text-muted-2">
          {maker.reviewCount > 0 && (
            <>
              ★ {maker.rating.toFixed(1)} ({maker.reviewCount} review
              {maker.reviewCount === 1 ? '' : 's'}) ·{' '}
            </>
          )}
          {responseTimeLabel(maker.responseTimeHours)}
        </span>
      </span>
      {linked && <ChevronIcon width={16} height={16} />}
    </>
  );
  const cls = `flex items-center gap-3 py-3 ${bordered ? 'border-y border-line' : ''}`;
  return linked ? (
    <Link href={`/makers/${maker.slug}`} className={`${cls} hover:bg-stone-light/40`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** @deprecated kept for older call sites */
export const MakerByline = ({ maker }: { maker: MakerStripData }) => <MakerStrip maker={maker} />;
