import { unstable_cache } from 'next/cache';
import { sql } from '@/lib/db';
import { SLIDE_FOCUS } from '@/lib/home/focus';

export interface FeatureSlide {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  src: string;
  width: number;
  height: number;
  /** object-position override, or null for the hero default. */
  focus: string | null;
}

export interface HomeFeature {
  id: string;
  maker: {
    id: string;
    slug: string;
    name: string;
    city: string | null;
    state: string | null;
    foundingNumber: number | null;
  };
  headline: string;
  blurb: string | null;
  slides: FeatureSlide[];
}

/** A hero needs at least this many pieces to rotate. */
export const MIN_SLIDES = 2;

type FeatureRow = {
  id: string;
  headline: string | null;
  blurb: string | null;
  productIds: string[];
  makerId: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  city: string | null;
  state: string | null;
  foundingNumber: number | null;
};

type PieceRow = {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  url: string;
  width: number | null;
  height: number | null;
};

export async function loadHomeFeature(): Promise<HomeFeature | null> {
  const [f] = await sql()<FeatureRow[]>`
    select hf.id, hf.headline, hf.blurb, hf.product_ids,
           m.id as maker_id, m.slug, m.display_name, m.tagline, m.city, m.state, m.founding_number
    from public.home_features hf
    join public.makers m on m.id = hf.maker_id
    where hf.is_active and hf.starts_at <= now() and (hf.ends_at is null or hf.ends_at > now())
      and m.shop_status = 'live'
    order by hf.starts_at desc
    limit 1`;
  if (!f || f.productIds.length === 0) return null;
  const rows = await sql()<PieceRow[]>`
    select p.id, p.slug, p.title, p.price_cents,
           img.public_url as url, img.width, img.height
    from public.products p
    join lateral (
      select public_url, width, height from public.product_images i
      where i.product_id = p.id and not i.is_placeholder
      order by i.sort_order, i.created_at limit 1
    ) img on true
    where p.id = any(${f.productIds}::uuid[]) and p.maker_id = ${f.makerId} and p.status = 'approved'`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const slides: FeatureSlide[] = [];
  for (const id of f.productIds) {
    const r = byId.get(id);
    if (!r) continue;
    slides.push({
      id: r.id,
      slug: r.slug,
      title: r.title,
      priceCents: r.priceCents,
      src: r.url,
      width: r.width ?? 1200,
      height: r.height ?? 1600,
      focus: SLIDE_FOCUS[r.slug] ?? null,
    });
  }
  if (slides.length < MIN_SLIDES) return null;
  return {
    id: f.id,
    maker: {
      id: f.makerId,
      slug: f.slug,
      name: f.displayName,
      city: f.city,
      state: f.state,
      foundingNumber: f.foundingNumber,
    },
    headline: f.headline?.trim() || f.displayName,
    blurb: f.blurb?.trim() || f.tagline,
    slides,
  };
}

/**
 * The active homepage feature, or null (the static hero shows). Cached for a minute (override
 * with HOME_FEATURE_REVALIDATE seconds; the e2e server uses 1), and revalidated by the admin card.
 */
export const getHomeFeature = unstable_cache(loadHomeFeature, ['home-feature'], {
  revalidate: Number(process.env.HOME_FEATURE_REVALIDATE ?? 60) || 60,
  tags: ['home-feature'],
});
