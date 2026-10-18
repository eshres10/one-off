import { Img as Image } from '@/components/ui/Img';
import Link from 'next/link';
import { Stars } from '@/components/ui/Stars';

export function responseTimeLabel(hours: number) {
  if (hours <= 1) return 'Usually replies within an hour';
  if (hours < 24) return `Usually replies within ${hours} hours`;
  const days = Math.round(hours / 24);
  return `Usually replies within ${days} day${days > 1 ? 's' : ''}`;
}

export function MakerByline({
  maker,
}: {
  maker: {
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    location: string | null;
    rating: number;
    reviewCount: number;
    responseTimeHours: number;
  };
}) {
  return (
    <Link href={`/makers/${maker.slug}`} className="group flex items-center gap-3">
      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full bg-stone-light">
        {maker.avatarUrl && (
          <Image src={maker.avatarUrl} alt="" fill sizes="44px" className="object-cover" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block font-medium group-hover:underline">{maker.displayName}</span>
        <span className="block text-xs text-ink-muted">
          {maker.location}
          {maker.reviewCount > 0 && (
            <>
              {' · '}
              <Stars rating={maker.rating} count={maker.reviewCount} size={11} />
            </>
          )}
        </span>
        <span className="block text-xs text-ink-muted">
          {responseTimeLabel(maker.responseTimeHours)}
        </span>
      </span>
    </Link>
  );
}
