import type { ReviewView } from '@/lib/queries/catalog';
import { Stars } from '@/components/ui/Stars';

export function Reviews({ reviews, emptyText }: { reviews: ReviewView[]; emptyText: string }) {
  if (!reviews.length) return <p className="text-sm text-ink-muted">{emptyText}</p>;
  return (
    <ul className="divide-y divide-stone/70" role="list">
      {reviews.map((r) => (
        <li key={r.id} className="py-5">
          <div className="flex items-center justify-between gap-3">
            <Stars rating={r.rating} />
            <time className="text-xs text-ink-muted" dateTime={new Date(r.createdAt).toISOString()}>
              {new Date(r.createdAt).toLocaleDateString('en-AU', {
                month: 'short',
                year: 'numeric',
              })}
            </time>
          </div>
          {r.title && <p className="mt-2 font-medium">{r.title}</p>}
          <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{r.body}</p>
          <p className="mt-2 text-xs text-ink-muted">
            {r.buyerName} · Verified purchase · {r.productTitle} ({r.variantLabel})
          </p>
        </li>
      ))}
    </ul>
  );
}
