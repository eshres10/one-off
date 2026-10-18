import type { ReviewView } from '@/lib/queries/catalog';
import { Stars } from '@/components/ui/Stars';

export function ReviewCard({ review }: { review: ReviewView }) {
  return (
    <article className="border-t border-ink pt-4">
      <Stars rating={review.rating} />
      {review.title && <h3 className="mt-2 text-[24px] leading-tight">{review.title}</h3>}
      <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-text2">
        {review.body}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-label text-muted-2">
        Verified buyer · {review.variantLabel.replace(/^AU /, 'Size ')} · {review.productTitle}
      </p>
    </article>
  );
}

export function Reviews({ reviews, emptyText }: { reviews: ReviewView[]; emptyText: string }) {
  if (!reviews.length) return <p className="text-[13px] text-muted-2">{emptyText}</p>;
  return (
    <ul className="grid gap-8 md:grid-cols-3" role="list">
      {reviews.map((r) => (
        <li key={r.id}>
          <ReviewCard review={r} />
        </li>
      ))}
    </ul>
  );
}
