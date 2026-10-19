import { sql } from '@/lib/db';
import type { Thumb } from '@/components/states/ThumbRow';
import { VISIBLE } from './catalog';

/** The newest pieces, for "Start with these" under empty states. */
export async function newArrivalThumbs(limit = 3, exceptMakerId?: string): Promise<Thumb[]> {
  return sql()<Thumb[]>`
    select p.slug, p.title,
      (select i.public_url from public.product_images i where i.product_id = p.id order by i.sort_order limit 1) as image_url
    from public.products p join public.makers m on m.id = p.maker_id
    where ${VISIBLE()} and m.shop_status in ('live', 'holiday')
      ${exceptMakerId ? sql()`and m.id <> ${exceptMakerId}` : sql()``}
    order by coalesce(p.published_at, p.approved_at, p.created_at) desc limit ${limit}`;
}

export interface SuggestedMaker {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  craft: string | null;
  place: string;
}

/**
 * Makers to follow: ones whose pieces match the buyer's taste picks from onboarding first, then
 * the newest shops. Never makers they already follow.
 */
export async function suggestedMakers(userId: string | null, limit = 4): Promise<SuggestedMaker[]> {
  return sql()<SuggestedMaker[]>`
    select m.id, m.slug, m.display_name, m.avatar_url,
      coalesce(initcap(m.tags[1]), m.tagline) as craft,
      concat_ws(' ', m.city, m.state) as place
    from public.makers m
    where m.status = 'approved' and m.shop_status in ('live', 'holiday')
      ${userId ? sql()`and not exists (select 1 from public.maker_follows f where f.maker_id = m.id and f.user_id = ${userId})` : sql()``}
    order by
      ${
        userId
          ? sql()`(select count(*) from public.customer_prefs cp, unnest(cp.taste_picks) pick
         join public.products pp on pp.id = pick where cp.user_id = ${userId} and pp.maker_id = m.id) desc,`
          : sql()``
      }
      coalesce(m.went_live_at, m.approved_at, m.created_at) desc
    limit ${limit}`;
}
