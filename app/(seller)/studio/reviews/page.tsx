import { requireSeller } from '@/lib/auth/session';
import { getReviews } from '@/lib/queries/catalog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Stars } from '@/components/ui/Stars';

export const metadata = { title: 'Reviews' };

export default async function SellerReviewsPage() {
  const seller = await requireSeller();
  const reviews = await getReviews({ makerId: seller.makerId }, 100);
  return (
    <div className="max-w-3xl">
      <h1 className="mb-8 text-[40px] leading-none md:text-[48px]">Reviews</h1>
      {reviews.length ? (
        <ul className="divide-y divide-line border-y border-line" role="list">
          {reviews.map((r) => (
            <li key={r.id} className="py-5">
              <div className="flex items-center justify-between gap-3">
                <Stars rating={r.rating} />
                <time
                  className="text-[12px] text-muted-2"
                  dateTime={new Date(r.createdAt).toISOString()}
                >
                  {new Date(r.createdAt).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </time>
              </div>
              {r.title && <p className="mt-2 text-[14px] font-normal">{r.title}</p>}
              <p className="mt-1 text-[14px] text-text2">{r.body}</p>
              <p className="mt-2 text-[12px] text-muted-2">
                {r.buyerName} · {r.productTitle} · {r.variantLabel}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="No reviews yet">
          Buyers can review a piece once it’s delivered. Reviews show on your shop and listings.
        </EmptyState>
      )}
    </div>
  );
}
