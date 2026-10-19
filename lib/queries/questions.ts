import { sql } from '@/lib/db';

export interface QaReply {
  id: string;
  name: string;
  body: string;
  createdAt: Date;
}

export type QaEntry =
  | {
      kind: 'question';
      id: string;
      name: string;
      body: string;
      createdAt: Date;
      replies: QaReply[];
    }
  | {
      kind: 'review';
      id: string;
      name: string;
      body: string;
      createdAt: Date;
      rating: number;
      size: string | null;
    };

/** Public questions (with the maker's replies) and reviews for a piece, newest first. */
export async function getQuestionsAndReviews(productId: string, limit = 30): Promise<QaEntry[]> {
  const db = sql();
  const [questions, replies, reviews] = await Promise.all([
    db<{ id: string; name: string; body: string; createdAt: Date }[]>`
      select q.id, lower(public.user_first_name(q.user_id)) as name, q.body, q.created_at
      from public.product_questions q
      where q.product_id = ${productId} and q.parent_id is null and not q.is_hidden
      order by q.created_at desc limit ${limit}`,
    db<(QaReply & { parentId: string })[]>`
      select q.id, q.parent_id, m.display_name as name, q.body, q.created_at
      from public.product_questions q
      join public.products p on p.id = q.product_id join public.makers m on m.id = p.maker_id
      where q.product_id = ${productId} and q.parent_id is not null and not q.is_hidden
      order by q.created_at`,
    db<
      {
        id: string;
        name: string;
        body: string;
        createdAt: Date;
        rating: number;
        size: string | null;
      }[]
    >`
      select r.id, lower(split_part(coalesce(u.display_name, 'buyer'), ' ', 1)) as name, r.body, r.created_at, r.rating,
        nullif(regexp_replace(oi.variant_label, '^AU ', ''), '') as size
      from public.reviews r join public.users u on u.id = r.buyer_user_id
      join public.order_items oi on oi.id = r.order_item_id
      where r.product_id = ${productId} order by r.created_at desc limit ${limit}`,
  ]);
  const byParent = new Map<string, QaReply[]>();
  for (const { parentId, ...r } of replies)
    byParent.set(parentId, [...(byParent.get(parentId) ?? []), r]);
  const entries: QaEntry[] = [
    ...questions.map((q) => ({
      kind: 'question' as const,
      ...q,
      replies: byParent.get(q.id) ?? [],
    })),
    ...reviews.map((r) => ({ kind: 'review' as const, ...r })),
  ];
  return entries.sort((a, b) => +b.createdAt - +a.createdAt);
}

export async function getSaveCount(productId: string): Promise<number> {
  const [row] = await sql()<{ n: number }[]>`
    select count(*)::int as n from public.saved_items where product_id = ${productId}`;
  return row?.n ?? 0;
}
