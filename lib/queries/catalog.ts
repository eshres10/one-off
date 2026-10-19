import { unstable_cache } from 'next/cache';
import { z } from 'zod';
import { sql, withUser } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import type { ProductBadge } from '@/lib/domain/stock';
import type { ProductType } from '@/lib/domain/types';

/**
 * Public catalogue reads. These run on the service connection with explicit visibility filters
 * (approved product AND approved maker) — the same rule the `products_select` RLS policy uses.
 */
export const VISIBLE = (alias = 'p', makerAlias = 'm') =>
  sql().unsafe(`${alias}.status = 'approved' and ${makerAlias}.status = 'approved'`);

export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  productType: ProductType;
  makerName: string;
  makerSlug: string;
  makerCity: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  leadTimeDays: number | null;
  colours: string[];
  badges: ProductBadge[];
  /** Sample listing: labelled and never purchasable (see lib/domain/preview.ts). */
  previewOnly: boolean;
}

export interface CardRow extends Omit<ProductCard, 'badges'> {
  totalStock: number;
  hasLow: boolean;
}

export const cardColumns = () =>
  sql().unsafe(`
  p.id, p.slug, p.title, p.price_cents, p.product_type, p.lead_time_days, p.colours,
  ('preview-only' = any(p.tags)) as preview_only, m.display_name as maker_name, m.slug as maker_slug, m.city as maker_city,
  img.public_url as image_url, img.alt_text as image_alt,
  coalesce(st.total_stock, 0)::int as total_stock, coalesce(st.has_low, false) as has_low`);

export const cardJoins = () =>
  sql().unsafe(`
  join public.makers m on m.id = p.maker_id
  left join lateral (
    select public_url, alt_text from public.product_images i where i.product_id = p.id order by sort_order limit 1
  ) img on true
  left join lateral (
    select sum(v.stock_quantity) as total_stock,
           bool_or(v.stock_quantity > 0 and v.stock_quantity <= v.low_stock_threshold) as has_low
    from public.product_variants v where v.product_id = p.id and v.is_active
  ) st on true`);

export function toCard(r: CardRow): ProductCard {
  // Same rules as productBadges(), applied to aggregated variant stock.
  const badges: ProductBadge[] = [r.productType];
  if (r.totalStock <= 0) badges.push('sold_out');
  else if (r.productType === 'ready_to_ship' && r.hasLow) badges.push('low_stock');
  const { totalStock: _t, hasLow: _h, ...card } = r;
  return { ...card, badges };
}

export const FEED_TABS = ['for-you', 'new', 'following', 'collections'] as const;
export type FeedTab = (typeof FEED_TABS)[number];

const optionalNumber = z
  .string()
  .optional()
  .transform((v) => (v && !Number.isNaN(Number(v)) ? Number(v) : undefined));

export const filtersSchema = z.object({
  tab: z.enum(FEED_TABS).catch('for-you').default('for-you'),
  q: z
    .string()
    .max(80)
    .optional()
    .catch(undefined)
    .transform((v) => (v?.trim() ? v.trim() : undefined)),
  category: z.string().max(40).optional().catch(undefined),
  size: z.string().max(10).optional().catch(undefined),
  colour: z.string().max(30).optional().catch(undefined),
  state: z.enum(['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT']).optional().catch(undefined),
  type: z.enum(['ready_to_ship', 'made_to_order', 'one_of_one']).optional().catch(undefined),
  minPrice: optionalNumber.catch(undefined),
  maxPrice: optionalNumber.catch(undefined),
  maxLead: optionalNumber.catch(undefined),
  page: optionalNumber.catch(undefined),
});
export type FeedFilters = z.infer<typeof filtersSchema>;

export function parseFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FeedFilters {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  return filtersSchema.parse(flat);
}

export function activeFilterCount(f: FeedFilters): number {
  return [f.category, f.size, f.colour, f.state, f.type, f.minPrice, f.maxPrice, f.maxLead].filter(
    (v) => v !== undefined && v !== '',
  ).length;
}

export const PAGE_SIZE = 24;

export async function getFeed(
  f: FeedFilters,
  userId: string | null,
  scope: { collectionId?: string; limit?: number } = {},
): Promise<{ items: ProductCard[]; hasMore: boolean }> {
  const db = sql();
  const page = Math.max(1, Math.min(f.page ?? 1, 20));
  const limit = scope.limit ?? PAGE_SIZE * page;
  const conditions = [
    VISIBLE(),
    f.q
      ? db`(p.title ilike ${'%' + f.q + '%'} or m.display_name ilike ${'%' + f.q + '%'} or p.category ilike ${'%' + f.q + '%'}
            or ${f.q.toLowerCase()} = any(p.tags) or exists (select 1 from unnest(p.colours) c where c ilike ${f.q}))`
      : null,
    scope.collectionId
      ? db`exists (select 1 from public.collection_products cp where cp.product_id = p.id and cp.collection_id = ${scope.collectionId})`
      : null,
    f.category ? db`p.category = ${f.category}` : null,
    f.type ? db`p.product_type = ${f.type}` : null,
    f.colour ? db`${f.colour} = any(p.colours)` : null,
    f.state ? db`m.state = ${f.state}` : null,
    f.minPrice !== undefined ? db`p.price_cents >= ${Math.round(f.minPrice * 100)}` : null,
    f.maxPrice !== undefined ? db`p.price_cents <= ${Math.round(f.maxPrice * 100)}` : null,
    f.maxLead !== undefined
      ? db`(p.product_type <> 'made_to_order' or p.lead_time_days <= ${f.maxLead})`
      : null,
    f.size
      ? db`exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active and v.stock_quantity > 0 and v.size = ${f.size})`
      : null,
    f.tab === 'new' ? db`p.approved_at > now() - interval '7 days'` : null,
    f.tab === 'following'
      ? userId
        ? db`exists (select 1 from public.maker_follows mf where mf.maker_id = m.id and mf.user_id = ${userId})`
        : db`false`
      : null,
  ].filter(Boolean);
  const where = conditions.reduce((acc, c) => db`${acc} and ${c}`, db`true`);

  const order =
    f.tab === 'new' || f.tab === 'following'
      ? db`p.approved_at desc nulls last, p.id`
      : db`p.is_featured desc,
           ${userId ? db`exists (select 1 from public.maker_follows mf where mf.maker_id = m.id and mf.user_id = ${userId}) desc,` : db``}
           (case when coalesce(st.total_stock, 0) > 0 then 1 else 0 end) desc,
           (p.save_count * 3 + p.view_count / 25.0 - extract(epoch from now() - coalesce(p.approved_at, p.created_at)) / 86400 * 0.6) desc,
           p.id`;

  const rows = await db<CardRow[]>`
    select ${cardColumns()} from public.products p ${cardJoins()}
    where ${where}
    order by ${order}
    limit ${limit + 1}`;
  return { items: rows.slice(0, limit).map(toCard), hasMore: rows.length > limit };
}

async function getFacetOptionsUncached() {
  const [row] = await sql()<{ categories: string[]; colours: string[]; sizes: string[] }[]>`
    select
      (select array_agg(distinct p.category order by p.category) from public.products p join public.makers m on m.id = p.maker_id where ${VISIBLE()}) as categories,
      (select array_agg(distinct c order by c) from public.products p join public.makers m on m.id = p.maker_id, unnest(p.colours) c where ${VISIBLE()}) as colours,
      (select array_agg(distinct v.size) from public.product_variants v join public.products p on p.id = v.product_id
         join public.makers m on m.id = p.maker_id where ${VISIBLE()} and v.is_active) as sizes`;
  const sizeOrder = (s: string) => (Number.isNaN(Number(s)) ? 999 : Number(s));
  return {
    categories: row?.categories ?? [],
    colours: row?.colours ?? [],
    sizes: (row?.sizes ?? []).sort((a, b) => sizeOrder(a) - sizeOrder(b)),
  };
}

export async function getSavedProductIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await sql()<
    { productId: string }[]
  >`select product_id from public.saved_items where user_id = ${userId}`;
  return new Set(rows.map((r) => r.productId));
}

export async function getCardsByIds(ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const rows = await sql()<CardRow[]>`
    select ${cardColumns()} from public.products p ${cardJoins()}
    where ${VISIBLE()} and p.id in ${sql()(ids)}`;
  const byId = new Map(rows.map((r) => [r.id, toCard(r)]));
  return ids.map((id) => byId.get(id)).filter((c): c is ProductCard => Boolean(c));
}

export interface Collection {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  heroImageUrl: string | null;
  productCount: number;
}

async function getCollectionsUncached(): Promise<Collection[]> {
  return sql()<Collection[]>`
    select c.id, c.slug, c.title, c.subtitle, c.description, c.hero_image_url,
      (select count(*) from public.collection_products cp join public.products p on p.id = cp.product_id
        join public.makers m on m.id = p.maker_id where cp.collection_id = c.id and ${VISIBLE()})::int as product_count
    from public.collections c where c.is_active order by c.sort_order, c.title`;
}

export async function getCollection(slug: string) {
  const [c] = await sql()<Collection[]>`
    select id, slug, title, subtitle, description, hero_image_url, 0 as product_count
    from public.collections where slug = ${slug} and is_active`;
  if (!c) return null;
  const rows = await sql()<CardRow[]>`
    select ${cardColumns()} from public.collection_products cp join public.products p on p.id = cp.product_id ${cardJoins()}
    where cp.collection_id = ${c.id} and ${VISIBLE()}
    order by cp.sort_order, p.title`;
  return { collection: c, products: rows.map(toCard) };
}

export interface Placement {
  id: string;
  slot: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
}

async function getPlacementsUncached(): Promise<Placement[]> {
  return sql()<Placement[]>`
    select id, slot, title, subtitle, image_url, href from public.editorial_placements where is_active order by slot, sort_order`;
}

export interface ProductDetail {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  colours: string[];
  priceCents: number;
  productType: ProductType;
  fabricComposition: string | null;
  careInstructions: string | null;
  countryOfMaking: string;
  modelHeightCm: number | null;
  modelSizeWorn: string | null;
  leadTimeDays: number | null;
  madeToOrderOptions: string | null;
  shippingPolicy: string | null;
  returnPolicy: string | null;
  maker: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    city: string | null;
    state: string | null;
    location: string | null;
    rating: number;
    reviewCount: number;
    completedOrders: number;
    responseTimeHours: number;
    dispatchDays: number;
    shippingStandardCents: number;
    freeShippingOverCents: number | null;
    returnPolicy: string;
    customCommissionsEnabled: boolean;
    userId: string;
    shopStatus: string;
    chargesEnabled: boolean;
    holidayUntil: Date | null;
    holidayNote: string | null;
    policyExtra: string | null;
  };
  images: Array<{ id: string; url: string; alt: string }>;
  variants: Array<{
    id: string;
    size: string;
    colour: string | null;
    stockQuantity: number;
    isActive: boolean;
    lowStockThreshold: number;
    priceCents: number | null;
  }>;
  measurements: Array<{ name: string; valueCm: number; size: string | null; notes: string | null }>;
}

export async function getProduct(
  slug: string,
  opts: { includeUnapproved?: boolean } = {},
): Promise<ProductDetail | null> {
  const [p] = await sql()<
    (Omit<ProductDetail, 'maker' | 'images' | 'variants' | 'measurements'> & {
      makerId: string;
      status: string;
      makerStatus: string;
    })[]
  >`
    select p.id, p.slug, p.title, p.description, p.category, p.tags, p.colours, p.price_cents, p.product_type, p.fabric_composition,
           p.care_instructions, p.country_of_making, p.model_height_cm, p.model_size_worn, p.lead_time_days, p.made_to_order_options,
           p.shipping_policy, p.return_policy, p.maker_id, p.status, m.status as maker_status
    from public.products p join public.makers m on m.id = p.maker_id where p.slug = ${slug}`;
  if (!p) return null;
  if (!opts.includeUnapproved && (p.status !== 'approved' || p.makerStatus !== 'approved'))
    return null;
  const [maker] = await sql()<ProductDetail['maker'][]>`
    select id, slug, display_name, avatar_url, city, state, location, rating::float as rating, review_count, completed_orders,
           response_time_hours, dispatch_days, shipping_standard_cents, free_shipping_over_cents, return_policy,
           custom_commissions_enabled, user_id, shop_status, stripe_charges_enabled as charges_enabled,
           holiday_until, holiday_note, policy_extra
    from public.makers where id = ${p.makerId}`;
  const images = await sql()<ProductDetail['images']>`
    select id, public_url as url, alt_text as alt from public.product_images where product_id = ${p.id} order by sort_order`;
  const variants = await sql()<ProductDetail['variants']>`
    select id, size, colour, stock_quantity, is_active, low_stock_threshold, price_cents
    from public.product_variants where product_id = ${p.id} and is_active order by sort_order`;
  const measurements = await sql()<ProductDetail['measurements']>`
    select garment_measurement_name as name, value_cm::float as value_cm, size, notes
    from public.product_measurements where product_id = ${p.id} order by sort_order`;
  const { makerId: _m, status: _s, makerStatus: _ms, ...rest } = p;
  return { ...rest, maker: maker!, images, variants, measurements };
}

export async function getRelated(
  productId: string,
  makerId: string,
  category: string,
  colours: string[],
) {
  const fromMaker = await sql()<CardRow[]>`
    select ${cardColumns()} from public.products p ${cardJoins()}
    where ${VISIBLE()} and p.maker_id = ${makerId} and p.id <> ${productId}
    order by p.is_featured desc, p.save_count desc limit 4`;
  // "Visually similar": same category, overlapping colours, from other makers.
  const similar = await sql()<CardRow[]>`
    select ${cardColumns()} from public.products p ${cardJoins()}
    where ${VISIBLE()} and p.maker_id <> ${makerId} and p.category = ${category}
    order by (p.colours && ${colours}::text[]) desc, p.save_count desc, p.id limit 4`;
  return { fromMaker: fromMaker.map(toCard), similar: similar.map(toCard) };
}

export interface ReviewView {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  createdAt: Date;
  buyerName: string;
  productTitle: string;
  variantLabel: string;
}

export async function getReviews(
  filter: { productId?: string; makerId?: string },
  limit = 10,
): Promise<ReviewView[]> {
  return sql()<ReviewView[]>`
    select r.id, r.rating, r.title, r.body, r.created_at, split_part(coalesce(u.display_name, 'Verified buyer'), ' ', 1) as buyer_name,
           oi.product_title, oi.variant_label
    from public.reviews r join public.users u on u.id = r.buyer_user_id join public.order_items oi on oi.id = r.order_item_id
    where ${filter.productId ? sql()`r.product_id = ${filter.productId}` : sql()`r.maker_id = ${filter.makerId ?? null}`}
    order by r.created_at desc limit ${limit}`;
}

export interface MakerProfile {
  id: string;
  slug: string;
  displayName: string;
  tagline: string | null;
  story: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  process: string | null;
  materials: string | null;
  sizingNotes: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
  leadTimeDays: number;
  responseTimeHours: number;
  rating: number;
  reviewCount: number;
  completedOrders: number;
  customCommissionsEnabled: boolean;
  returnPolicy: string;
  followerCount: number;
  approvedAt: Date | null;
  /** Null until a shop set up by One Off is claimed. */
  userId: string | null;
}

export async function getMaker(
  slug: string,
  opts: { preview?: boolean } = {},
): Promise<{ maker: MakerProfile; products: ProductCard[] } | null> {
  const [maker] = await sql()<MakerProfile[]>`
    select m.id, m.slug, m.display_name, m.tagline, m.story, m.location, m.city, m.state, m.process, m.materials, m.sizing_notes,
           m.avatar_url, m.cover_url, m.lead_time_days, m.response_time_hours, m.rating::float as rating, m.review_count,
           m.completed_orders, m.custom_commissions_enabled, m.return_policy, m.user_id, m.approved_at,
           (select count(*) from public.maker_follows f where f.maker_id = m.id)::int as follower_count
    from public.makers m where m.slug = ${slug} ${opts.preview ? sql()`` : sql()`and m.status = 'approved'`}`;
  if (!maker) return null;
  // Preview (admins and the owner) shows the draft shop with the pieces it would launch with.
  const rows = await sql()<CardRow[]>`
    select ${cardColumns()} from public.products p ${cardJoins()}
    where ${opts.preview ? sql()`p.status in ('approved', 'draft', 'pending') and p.keep_on_claim` : VISIBLE()}
      and p.maker_id = ${maker.id}
    order by (coalesce(st.total_stock, 0) > 0) desc, p.is_featured desc, p.approved_at desc`;
  return { maker, products: rows.map(toCard) };
}

export async function isFollowing(userId: string | null, makerId: string): Promise<boolean> {
  if (!userId) return false;
  const [row] =
    await sql()`select 1 from public.maker_follows where user_id = ${userId} and maker_id = ${makerId}`;
  return Boolean(row);
}

export async function getMakersDirectory() {
  return sql()<
    Pick<
      MakerProfile,
      | 'id'
      | 'slug'
      | 'displayName'
      | 'tagline'
      | 'city'
      | 'avatarUrl'
      | 'coverUrl'
      | 'rating'
      | 'reviewCount'
    >[]
  >`
    select id, slug, display_name, tagline, city, avatar_url, cover_url, rating::float as rating, review_count
    from public.makers where status = 'approved' order by display_name`;
}

export async function recordProductView(productId: string, makerId: string, viewerKey: string) {
  await sql()`
    with ins as (
      insert into public.product_views (product_id, maker_id, viewer_key)
      select ${productId}, ${makerId}, ${viewerKey}
      where not exists (
        select 1 from public.product_views where product_id = ${productId} and viewer_key = ${viewerKey}
          and created_at > now() - interval '30 minutes')
      returning 1
    )
    update public.products set view_count = view_count + (select count(*) from ins) where id = ${productId}`;
}

export const SEARCH_FILTERS = [
  'all',
  'ready_to_ship',
  'made_to_order',
  'one_of_one',
  'under_300',
] as const;
export type SearchFilter = (typeof SEARCH_FILTERS)[number];

export function parseSearchFilter(v: string | string[] | undefined): SearchFilter {
  const s = Array.isArray(v) ? v[0] : v;
  return (SEARCH_FILTERS as readonly string[]).includes(s ?? '') ? (s as SearchFilter) : 'all';
}

/** "wedding gue" → `wedding:* & gue:*` — every word must match, the last one as a prefix. */
export function toPrefixQuery(q: string): string | null {
  const words = q
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(' & ') : null;
}

/** Full-text search over name, maker, category, tags and occasion, ranked by relevance. */
export async function searchProducts(
  q: string | undefined,
  filter: SearchFilter,
  limit = 60,
): Promise<ProductCard[]> {
  const db = sql();
  const tsq = q ? toPrefixQuery(q) : null;
  const conditions = [
    VISIBLE(),
    tsq ? db`p.search_vector @@ to_tsquery('english', ${tsq})` : null,
    filter === 'ready_to_ship' || filter === 'made_to_order' || filter === 'one_of_one'
      ? db`p.product_type = ${filter}`
      : null,
    filter === 'under_300' ? db`p.price_cents < 30000` : null,
  ].filter(Boolean);
  const where = conditions.reduce((acc, c) => db`${acc} and ${c}`, db`true`);
  const rows = await db<CardRow[]>`
    select ${cardColumns()} from public.products p ${cardJoins()}
    where ${where}
    order by ${tsq ? db`ts_rank(p.search_vector, to_tsquery('english', ${tsq})) desc,` : db``}
      (coalesce(st.total_stock, 0) > 0 or p.product_type = 'made_to_order') desc, p.save_count desc, p.id
    limit ${limit}`;
  return rows.map(toCard);
}

/**
 * Remembers the sizes that were sold out when a signed-in shopper looked at a piece, so Saved
 * can say "Back in your size" when one returns.
 */
export async function watchSoldOutSizes(user: Pick<SessionUser, 'id' | 'role'>, productId: string) {
  await withUser(
    user,
    (db) => db`
      insert into public.size_watches (user_id, variant_id)
      select ${user.id}, v.id from public.product_variants v
      where v.product_id = ${productId} and v.is_active and v.stock_quantity = 0
      on conflict do nothing`,
  );
}

/**
 * Made-to-order capacity: when a piece already has as many open orders as the maker can take at
 * once, buyers see "Next slot: {date}" (the earliest open order's ship-by) instead of sold out.
 */
export async function getNextSlot(productId: string): Promise<string | null> {
  const [row] = await sql()<{ capacity: number | null; open: number; earliest: string | null }[]>`
    select p.mto_capacity as capacity,
      (select count(distinct f.id) from public.order_items oi join public.fulfilments f on f.id = oi.fulfilment_id
        where oi.product_id = p.id and f.status in ('paid', 'making', 'ready', 'preparing'))::int as open,
      (select to_char(min(f.estimated_dispatch_date), 'YYYY-MM-DD') from public.order_items oi
        join public.fulfilments f on f.id = oi.fulfilment_id
        where oi.product_id = p.id and f.status in ('paid', 'making', 'ready', 'preparing')) as earliest
    from public.products p where p.id = ${productId} and p.product_type = 'made_to_order'`;
  if (!row?.capacity || row.open < row.capacity || !row.earliest) return null;
  return new Date(`${row.earliest}T00:00:00Z`).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Where an old shop link now points (after a rename), if anywhere. */
export async function makerSlugRedirect(slug: string): Promise<string | null> {
  const [row] = await sql()<{ slug: string }[]>`
    select m.slug from public.maker_slug_redirects r join public.makers m on m.id = r.maker_id
    where r.old_slug = ${slug}`;
  return row?.slug ?? null;
}

/** Same for every visitor, so cached for a minute. */
export const getFacetOptions = unstable_cache(getFacetOptionsUncached, ['facet-options'], {
  revalidate: 60,
  tags: ['catalog'],
});

/** Same for every visitor, so cached for a minute. */
export const getCollections = unstable_cache(getCollectionsUncached, ['collections'], {
  revalidate: 60,
  tags: ['catalog'],
});

/** Same for every visitor, so cached for a minute. */
export const getPlacements = unstable_cache(getPlacementsUncached, ['placements'], {
  revalidate: 60,
  tags: ['catalog'],
});
