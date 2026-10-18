import { audit } from '@/lib/audit';
import { sql, withUser } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { reviewEligibility } from '@/lib/domain/reviews';
import type { FulfilmentStatus } from '@/lib/domain/types';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/auth/session';
import { UserError } from './errors';

type Actor = Pick<SessionUser, 'id' | 'role'>;

export async function submitReview(
  buyer: Actor,
  input: { orderItemId: string; rating: number; title?: string; body: string },
): Promise<string> {
  await rateLimit('review', buyer.id);
  const [item] = await sql()<
    { buyerUserId: string | null; fulfilmentStatus: FulfilmentStatus; reviewed: boolean }[]
  >`
    select o.buyer_user_id, oi.fulfilment_status, exists (select 1 from public.reviews r where r.order_item_id = oi.id) as reviewed
    from public.order_items oi join public.orders o on o.id = oi.order_id where oi.id = ${input.orderItemId}`;
  if (!item) throw new UserError('Order item not found.');
  const eligibility = reviewEligibility({
    userId: buyer.id,
    buyerUserId: item.buyerUserId,
    fulfilmentStatus: item.fulfilmentStatus,
    alreadyReviewed: item.reviewed,
  });
  if (!eligibility.ok) throw new UserError(eligibility.reason);

  // RLS (buyer_user_id = auth.uid()) and the eligibility trigger enforce the same rules in the DB.
  const id = await withUser(buyer, async (db) => {
    const [row] = await db<{ id: string }[]>`
      insert into public.reviews (order_item_id, buyer_user_id, maker_id, product_id, rating, title, body)
      select oi.id, ${buyer.id}, oi.maker_id, oi.product_id, ${input.rating}, ${input.title ? sanitizeText(input.title) : null},
             ${sanitizeText(input.body)}
      from public.order_items oi where oi.id = ${input.orderItemId}
      returning id`;
    return row!.id;
  });
  await audit('review.created', { type: 'review', id }, { rating: input.rating }, buyer.id);
  return id;
}
