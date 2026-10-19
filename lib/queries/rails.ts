import { unstable_cache } from 'next/cache';
import { sql } from '@/lib/db';
import { VISIBLE, cardColumns, cardJoins, toCard, type CardRow, type ProductCard } from './catalog';

export interface RailProduct extends ProductCard {
  saveCount: number;
  totalStock: number;
}

type RailRow = CardRow & { saveCount: number };

function toRail(r: RailRow): RailProduct {
  const totalStock = r.totalStock;
  const { saveCount, ...row } = r;
  return { ...toCard(row), saveCount, totalStock };
}

/** Top pieces by saves plus views over the last 7 days (public.popular_products). */
async function getMostPopularUncached(limit = 10): Promise<RailProduct[]> {
  const rows = await sql()<(RailRow & { rank: number })[]>`
    with top as (
      select product_id, row_number() over () as rank from public.popular_products(7, ${limit})
    )
    select ${cardColumns()}, p.save_count, top.rank
    from top join public.products p on p.id = top.product_id ${cardJoins()}
    where ${VISIBLE()}
    order by top.rank`;
  return rows.map(({ rank: _r, ...r }) => toRail(r));
}

/** Homepage "Picked for you": the shopper's Discover ranking (taste, size, recency, saves). */
export async function getPickedForYou(userId: string, limit = 10): Promise<RailProduct[]> {
  const [hasTaste] = await sql()`
    select 1 from public.customer_prefs where user_id = ${userId} and taste_tags <> '{}'::jsonb`;
  if (!hasTaste) return [];
  const rows = await sql()<(RailRow & { rank: number })[]>`
    with top as (
      select product_id, row_number() over (order by sort_key desc, product_id desc) as rank
      from public.discover_feed(null, null, null, null, null, null, null, 'relevant', ${userId}::uuid)
      order by sort_key desc, product_id desc limit ${limit * 2}
    )
    select ${cardColumns()}, p.save_count, top.rank
    from top join public.products p on p.id = top.product_id ${cardJoins()}
    where ${VISIBLE()}
    order by top.rank limit ${limit}`;
  return rows.map(({ rank: _r, ...r }) => toRail(r));
}

async function getUnderUncached(limitCents: number, limit = 12): Promise<RailProduct[]> {
  const rows = await sql()<RailRow[]>`
    select ${cardColumns()}, p.save_count from public.products p ${cardJoins()}
    where ${VISIBLE()} and p.price_cents < ${limitCents}
    order by (coalesce(st.total_stock, 0) > 0 or p.product_type = 'made_to_order') desc,
      p.save_count desc, p.approved_at desc nulls last
    limit ${limit}`;
  return rows.map(toRail);
}

export interface NewMaker {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  suburb: string | null;
  coverUrl: string | null;
  avatarUrl: string | null;
  approvedAt: Date;
  thumbs: Array<{ slug: string; title: string; imageUrl: string | null }>;
}

/** Makers approved in the last 60 days, newest first, with three of their pieces. */
async function getNewMakersUncached(limit = 10): Promise<NewMaker[]> {
  return sql()<NewMaker[]>`
    select m.id, m.slug, m.display_name, m.tagline, m.cover_url, m.avatar_url, m.approved_at,
      nullif(trim(split_part(coalesce(m.location, m.city, ''), ',', 1)), '') as suburb,
      coalesce((
        select json_agg(t) from (
          select p.slug, p.title,
            (select i.public_url from public.product_images i where i.product_id = p.id order by i.sort_order limit 1) as "imageUrl"
          from public.products p where p.maker_id = m.id and p.status = 'approved'
          order by p.is_featured desc, p.approved_at desc nulls last limit 3) t
      ), '[]'::json) as thumbs
    from public.makers m
    where m.status = 'approved' and m.approved_at > now() - interval '60 days'
    order by m.approved_at desc
    limit ${limit}`;
}

export interface MakerTile {
  id: string;
  slug: string;
  displayName: string;
  suburb: string | null;
  imageUrl: string | null;
  pieceCount: number;
}

/** Every active maker, most recent sales first (public.makers_by_recent_sales). */
async function getShopByMakerUncached(limit = 16): Promise<MakerTile[]> {
  return sql()<MakerTile[]>`
    select m.id, m.slug, m.display_name, coalesce(m.avatar_url, m.cover_url) as image_url, r.piece_count,
      nullif(trim(split_part(coalesce(m.location, m.city, ''), ',', 1)), '') as suburb
    from public.makers_by_recent_sales() with ordinality as r(maker_id, recent_sales, piece_count, ord)
    join public.makers m on m.id = r.maker_id
    order by r.ord
    limit ${limit}`;
}

export async function getFollowedMakerIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await sql()<
    { makerId: string }[]
  >`select maker_id from public.maker_follows where user_id = ${userId}`;
  return new Set(rows.map((r) => r.makerId));
}

/** Same for every visitor, so cached for a minute. */
export const getMostPopular = unstable_cache(getMostPopularUncached, ['rail-popular'], {
  revalidate: 60,
  tags: ['catalog'],
});

/** Same for every visitor, so cached for a minute. */
export const getUnder = unstable_cache(getUnderUncached, ['rail-under'], {
  revalidate: 60,
  tags: ['catalog'],
});

/** Same for every visitor, so cached for a minute. */
export const getNewMakers = unstable_cache(getNewMakersUncached, ['rail-new-makers'], {
  revalidate: 60,
  tags: ['catalog'],
});

/** Same for every visitor, so cached for a minute. */
export const getShopByMaker = unstable_cache(getShopByMakerUncached, ['rail-shop-by-maker'], {
  revalidate: 60,
  tags: ['catalog'],
});
