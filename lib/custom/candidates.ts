import { sql } from '@/lib/db';
import type { MatchCandidate } from './match';

/**
 * Every maker who has custom work switched on, with what the matcher reads. Runs as the service
 * connection: the matcher needs other makers' settings, and only the chosen few reach the buyer.
 */
export async function loadCandidates(): Promise<MatchCandidate[]> {
  const rows = await sql()<
    {
      makerId: string;
      name: string;
      slug: string;
      location: string | null;
      city: string | null;
      postcodeSuburb: string | null;
      avatarUrl: string | null;
      rating: string;
      reviewCount: number;
      replyHours: number;
      active: boolean;
      holidayFrom: Date | null;
      holidayUntil: Date | null;
      open: boolean;
      spotsPerMonth: number;
      spotsUsed: number;
      categories: string[];
      fabrics: string[];
      minPrice: number;
      leadLower: number;
      leadUpper: number;
      fittingsInPerson: boolean;
      fittingRadiusKm: number | null;
      postsAustraliaWide: boolean;
      lat: number | null;
      lng: number | null;
    }[]
  >`
    select m.id as maker_id, m.display_name as name, m.slug, m.location, m.city,
      (select p.suburb from public.postcodes p where p.postcode = m.studio_postcode
        order by p.suburb limit 1) as postcode_suburb,
      m.avatar_url, m.rating, m.review_count, m.response_time_hours as reply_hours,
      (m.status = 'approved' and m.shop_status in ('live', 'holiday')) as active,
      m.holiday_from, m.holiday_until,
      s.open, s.spots_per_month,
      (select count(distinct oi.custom_quote_id)::int from public.order_items oi
        join public.orders o on o.id = oi.order_id
        where oi.maker_id = m.id and oi.custom_quote_id is not null
          and o.status not in ('failed', 'cancelled', 'refunded')
          and o.created_at >= date_trunc('month', now() at time zone 'Australia/Melbourne')
                                at time zone 'Australia/Melbourne') as spots_used,
      s.categories, s.fabrics, s.min_price,
      lower(s.lead_time_weeks) as lead_lower, upper(s.lead_time_weeks) as lead_upper,
      s.fittings_in_person, s.fitting_radius_km, s.posts_australia_wide,
      m.studio_lat as lat, m.studio_lng as lng
    from public.maker_custom_settings s
    join public.makers m on m.id = s.maker_id
    where s.open`;
  return rows.map((r) => ({
    makerId: r.makerId,
    name: r.name,
    slug: r.slug,
    suburb: r.postcodeSuburb ?? ((r.location ?? '').split(',')[0]?.trim() || r.city || null),
    avatarUrl: r.avatarUrl,
    rating: Number(r.rating),
    reviewCount: r.reviewCount,
    replyHours: r.replyHours,
    active: r.active,
    holidayFrom: r.holidayFrom,
    holidayUntil: r.holidayUntil,
    open: r.open,
    spotsLeft: Math.max(0, r.spotsPerMonth - r.spotsUsed),
    categories: r.categories,
    fabrics: r.fabrics,
    minPrice: r.minPrice,
    // int4range is [lower, upper): "2–4 weeks" is stored as [2,5).
    leadWeeks: [r.leadLower, Math.max(r.leadLower, r.leadUpper - 1)],
    fittingsInPerson: r.fittingsInPerson,
    fittingRadiusKm: r.fittingRadiusKm,
    postsAustraliaWide: r.postsAustraliaWide,
    lat: r.lat,
    lng: r.lng,
  }));
}
