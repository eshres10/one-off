import { MAX_STYLE_TAGS, isStyleTag } from '@/lib/taste/tags';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql, withUser, type Db } from '@/lib/db';
import { sizeFromUrl } from '@/lib/image-size';
import { sanitizeText } from '@/lib/domain/moderation';
import { slugify, uniqueSuffix } from '@/lib/slug';
import { isOwnImageUrl } from '@/lib/storage';
import {
  MAX_PHOTOS,
  emptySizes,
  publishChecklist,
  type PieceDraft,
  type SaleType,
} from '@/lib/studio/pieces';
import { TERMS, leadDaysFor } from '@/lib/studio/terms';
import { UserError } from './errors';
import { PUBLISH_BLOCKED, SHOP_CAN_PUBLISH, goLiveIfReady } from './sell';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

/** Made-to-order sizes are offered rather than stocked; this is their nominal stock. */
const MTO_STOCK = 999;

export interface PieceRecord extends PieceDraft {
  id: string;
  slug: string;
  status: string;
  listedByAdmin: boolean;
  reviewedBySellerAt: Date | null;
  updatedAt: Date;
}

/** A piece as the editor sees it. Admins can open any shop's piece; makers only their own. */
export async function getPiece(actor: Actor, productId: string): Promise<PieceRecord | null> {
  return withUser(actor, async (db) => {
    const [p] = await db<
      (Omit<PieceRecord, 'sizes' | 'images' | 'measurements' | 'saleType' | 'priceCents'> & {
        productType: SaleType;
        priceCents: number;
        fabricComposition: string | null;
        careInstructions: string | null;
        makerId: string;
      })[]
    >`
      select id, slug, status, title, category, description, fabric_composition, care_instructions, occasions, style_tags, colours,
        product_type, mto_lead, mto_capacity, price_cents, accepts_custom, listed_by_admin, reviewed_by_seller_at,
        updated_at, maker_id
      from public.products where id = ${productId}`;
    if (!p) return null;
    if (actor.role !== 'admin' && p.makerId !== actor.makerId) return null;
    const variants = await db<{ size: string; stock: number; active: boolean }[]>`
      select size, sum(stock_quantity)::int as stock, bool_or(is_active) as active
      from public.product_variants where product_id = ${productId} group by size`;
    const images = await db<{ url: string; alt: string }[]>`
      select public_url as url, alt_text as alt from public.product_images where product_id = ${productId} order by sort_order`;
    const measurements = await db<{ name: string; valueCm: string }[]>`
      select garment_measurement_name as name, value_cm from public.product_measurements
      where product_id = ${productId} order by sort_order`;
    const sizes = emptySizes().map((s) => {
      const v = variants.find((x) => x.size === s.size);
      if (!v) return s;
      return {
        size: s.size,
        stock: p.productType === 'made_to_order' ? 0 : v.active ? v.stock : 0,
        offered: v.active,
      };
    });
    return {
      id: p.id,
      slug: p.slug,
      status: p.status,
      listedByAdmin: p.listedByAdmin,
      reviewedBySellerAt: p.reviewedBySellerAt,
      updatedAt: p.updatedAt,
      title: p.title,
      category: p.category,
      description: p.description,
      fabric: p.fabricComposition ?? '',
      care: p.careInstructions ?? '',
      occasions: p.occasions ?? [],
      styleTags: p.styleTags ?? [],
      colours: p.colours ?? [],
      saleType: p.productType,
      mtoLead: p.mtoLead,
      mtoCapacity: p.mtoCapacity,
      priceCents: p.priceCents,
      acceptsCustom: p.acceptsCustom,
      sizes,
      images,
      measurements: measurements.map((m) => ({ name: m.name, valueCm: Number(m.valueCm) })),
    };
  });
}

function clean(input: PieceDraft): PieceDraft {
  const saleType = (['ready_to_ship', 'made_to_order', 'one_of_one'] as const).includes(
    input.saleType,
  )
    ? input.saleType
    : 'ready_to_ship';
  if (input.images.length > MAX_PHOTOS) throw new UserError(`Add up to ${MAX_PHOTOS} photos.`);
  if (
    input.images.some(
      (i) => !isOwnImageUrl(i.url) && !i.url.startsWith('/seed/') && !i.url.startsWith('/preview/'),
    )
  )
    throw new UserError('Please upload photos here rather than linking them.');
  let sizes = emptySizes().map((s) => {
    const v = input.sizes.find((x) => x.size === s.size);
    const stock = Math.max(0, Math.min(999, Math.round(v?.stock ?? 0)));
    return { size: s.size, stock, offered: Boolean(v?.offered) };
  });
  if (saleType !== 'made_to_order')
    sizes = sizes.map((s) => (s.size === 'Custom' ? { ...s, offered: false, stock: 0 } : s));
  if (saleType === 'one_of_one') {
    const offered = sizes.filter((s) => s.offered);
    if (offered.length > 1) throw new UserError('A one-of-one piece comes in one size.');
  }
  const title = sanitizeText(input.title).slice(0, 120);
  return {
    ...input,
    saleType,
    title,
    // Older pieces may use a category outside the chips (e.g. occasionwear); keep it.
    category: /^[a-z-]{2,40}$/.test(input.category) ? input.category : '',
    description: sanitizeText(input.description).slice(0, 4000),
    fabric: sanitizeText(input.fabric).slice(0, 300),
    care: sanitizeText(input.care).slice(0, 500),
    occasions: input.occasions.map((o) => o.toLowerCase()).slice(0, 8),
    styleTags: [...new Set(input.styleTags.filter(isStyleTag))].slice(0, MAX_STYLE_TAGS),
    colours: input.colours.slice(0, 6),
    mtoLead:
      saleType === 'made_to_order'
        ? (TERMS.mtoLeadOptions as readonly string[]).includes(input.mtoLead ?? '')
          ? input.mtoLead
          : TERMS.mtoLeadOptions[1]
        : null,
    mtoCapacity:
      saleType === 'made_to_order' && input.mtoCapacity
        ? Math.max(1, Math.min(500, Math.round(input.mtoCapacity)))
        : null,
    priceCents:
      input.priceCents && input.priceCents > 0
        ? Math.min(Math.round(input.priceCents), 10_000_000)
        : null,
    sizes,
    images: input.images.map((i, n) => ({
      url: i.url,
      alt: sanitizeText(i.alt || `${title || 'Piece'}, photo ${n + 1}`).slice(0, 200),
    })),
    measurements: input.measurements
      .filter(
        (m) => m.name.trim() && Number.isFinite(m.valueCm) && m.valueCm > 0 && m.valueCm < 400,
      )
      .slice(0, 20),
  };
}

async function writePiece(db: Db, productId: string, p: PieceDraft) {
  await db`
    update public.products set title = ${p.title || 'Untitled piece'}, category = ${p.category || 'dresses'},
      description = ${p.description}, fabric_composition = ${p.fabric || null}, care_instructions = ${p.care || null},
      occasions = ${p.occasions}, style_tags = ${p.styleTags}, colours = ${p.colours}, product_type = ${p.saleType}::product_type,
      price_cents = ${p.priceCents ?? 100}, accepts_custom = ${p.acceptsCustom}, mto_lead = ${p.mtoLead},
      mto_capacity = ${p.mtoCapacity},
      lead_time_days = ${p.saleType === 'made_to_order' ? leadDaysFor(p.mtoLead) : null}, updated_at = now()
    where id = ${productId}`;

  // One variant per size; existing rows are reused so orders and bags keep pointing at them.
  const existing = await db<
    { id: string; size: string; colour: string | null; sortOrder: number }[]
  >`
    select id, size, colour, sort_order from public.product_variants where product_id = ${productId} order by sort_order, id`;
  for (const [i, s] of p.sizes.entries()) {
    const rows = existing.filter((e) => e.size === s.size);
    const active = p.saleType === 'ready_to_ship' ? s.stock > 0 || rows.length > 0 : s.offered;
    const stock =
      p.saleType === 'made_to_order'
        ? s.offered
          ? MTO_STOCK
          : 0
        : p.saleType === 'one_of_one'
          ? s.offered
            ? 1
            : 0
          : s.stock;
    const [keep, ...others] = rows;
    if (keep) {
      await db`update public.product_variants set stock_quantity = ${stock}, is_active = ${active}, colour = null,
        sort_order = ${i}, updated_at = now() where id = ${keep.id}`;
      for (const o of others)
        await db`update public.product_variants set stock_quantity = 0, is_active = false where id = ${o.id}`;
    } else if (active || stock > 0) {
      await db`insert into public.product_variants (product_id, size, stock_quantity, is_active, sort_order)
        values (${productId}, ${s.size}, ${stock}, ${active}, ${i})`;
    }
  }

  await db`delete from public.product_images where product_id = ${productId}`;
  for (const [i, img] of p.images.entries()) {
    const size = sizeFromUrl(img.url);
    await db`insert into public.product_images (product_id, storage_path, public_url, alt_text, sort_order, width, height)
      values (${productId}, ${img.url.replace(/^\/api\/files\//, '')}, ${img.url}, ${img.alt}, ${i},
        ${size?.width ?? null}, ${size?.height ?? null})`;
  }
  await db`delete from public.product_measurements where product_id = ${productId}`;
  for (const [i, m] of p.measurements.entries()) {
    await db`insert into public.product_measurements (product_id, size, garment_measurement_name, value_cm, sort_order)
      values (${productId}, null, ${sanitizeText(m.name).slice(0, 60)}, ${m.valueCm}, ${i})`;
  }
}

export type SaveIntent = 'autosave' | 'draft' | 'publish';

export interface SaveResult {
  id: string;
  slug: string;
  status: string;
  /** The piece was published (or stayed live) with this save. */
  live: boolean;
  /** The shop is live, so buyers can see published pieces. */
  shopLive: boolean;
  /** This save took an approved shop live. */
  wentLive: boolean;
}

/**
 * Saves a piece from the editor. `autosave` keeps the status (a live piece is only autosaved
 * when it still passes the checklist); `publish` checks all five items, then makes it live if
 * the shop is live, or marks it to go live with the shop. Admins (`asAdmin`) list pieces into a
 * draft shop as One Off: they're saved as drafts flagged "Set up by One Off".
 */
export async function savePiece(
  actor: Actor,
  input: { id: string | null; makerId?: string; draft: PieceDraft; intent: SaveIntent },
): Promise<SaveResult> {
  const asAdmin = actor.role === 'admin';
  const makerId = asAdmin ? input.makerId : actor.makerId;
  if (!makerId) throw new UserError('Shop not found.');
  const p = clean(input.draft);
  const check = publishChecklist(p);
  if (input.intent === 'publish' && !check.ready)
    throw new UserError(`Finish the checklist first (${check.passed}/${check.items.length}).`);

  const [shop] = await sql()<{ shopStatus: string }[]>`
    select shop_status from public.makers where id = ${makerId}`;
  if (!shop) throw new UserError('Shop not found.');
  const canPublish = SHOP_CAN_PUBLISH.includes(shop.shopStatus);
  if (input.intent === 'publish' && !asAdmin && !canPublish) throw new UserError(PUBLISH_BLOCKED);

  const result = await withUser(actor, async (db) => {
    let id = input.id;
    let status = 'draft';
    let slug = '';
    if (id) {
      const [current] = await db<{ status: string; slug: string; makerId: string }[]>`
        select status, slug, maker_id from public.products where id = ${id} for update`;
      if (!current || (!asAdmin && current.makerId !== makerId))
        throw new UserError('Piece not found.');
      status = current.status;
      slug = current.slug;
      if (status === 'approved' && input.intent !== 'publish' && !check.ready)
        throw new UserError('This piece is live, so it needs to pass the checklist to save.');
    } else {
      slug = `${slugify(p.title || 'piece') || 'piece'}-${uniqueSuffix()}`;
      const [row] = await db<{ id: string }[]>`
        insert into public.products (maker_id, slug, title, category, price_cents, product_type, status, listed_by_admin,
          lead_time_days)
        values (${makerId}, ${slug}, ${p.title || 'Untitled piece'}, ${p.category || 'dresses'}, ${p.priceCents ?? 100},
          ${p.saleType}::product_type, 'draft', ${asAdmin},
          ${p.saleType === 'made_to_order' ? leadDaysFor(p.mtoLead) : null})
        returning id`;
      id = row!.id;
    }
    await writePiece(db, id, p);
    if (input.intent === 'publish' && status !== 'approved') {
      if (canPublish && !asAdmin) {
        // In an approved shop the piece is published now and seen by buyers once the shop is live.
        await db`update public.products set status = 'approved' where id = ${id}`;
        status = 'approved';
      } else {
        await db`update public.products set keep_on_claim = true where id = ${id}`;
      }
    }
    return { id, slug, status };
  });
  if (input.intent !== 'autosave')
    await audit(
      input.intent === 'publish' ? 'piece.published' : 'piece.saved',
      { type: 'product', id: result.id },
      { asAdmin },
      actor.id,
    );
  const wentLive =
    result.status === 'approved' &&
    shop.shopStatus === 'approved' &&
    (await goLiveIfReady(makerId));
  return {
    ...result,
    live: result.status === 'approved',
    shopLive: wentLive || shop.shopStatus === 'live' || shop.shopStatus === 'holiday',
    wentLive,
  };
}

/** Live/Hidden switch on the listings grid. Hidden pieces stay in Studio, off the shop. */
export async function setPieceLive(actor: Actor, productId: string, live: boolean) {
  const piece = await getPiece(actor, productId);
  if (!piece) throw new UserError('Piece not found.');
  if (live && !publishChecklist(piece).ready)
    throw new UserError('Finish this piece’s checklist before it goes live.');
  const [shop] = await sql()<{ shopStatus: string }[]>`
    select shop_status from public.makers where id = ${actor.makerId!}`;
  if (live && !SHOP_CAN_PUBLISH.includes(shop?.shopStatus ?? ''))
    throw new UserError(PUBLISH_BLOCKED);
  await withUser(
    actor,
    (db) => db`
    update public.products set status = ${live ? 'approved' : 'archived'}::product_status
    where id = ${productId} and maker_id = ${actor.makerId!}`,
  );
  await audit(
    live ? 'piece.shown' : 'piece.hidden',
    { type: 'product', id: productId },
    {},
    actor.id,
  );
  if (live && shop?.shopStatus === 'approved') await goLiveIfReady(actor.makerId!);
}

export interface ListingCard {
  id: string;
  slug: string;
  title: string;
  status: string;
  productType: SaleType;
  priceCents: number;
  imageUrl: string | null;
  listedByAdmin: boolean;
  views: number;
  saves: number;
  sold: number;
  variants: Array<{ id: string; size: string; stock: number; active: boolean }>;
}

export async function listPieces(actor: Actor): Promise<ListingCard[]> {
  return withUser(actor, async (db) => {
    const rows = await db<Omit<ListingCard, 'variants'>[]>`
      select p.id, p.slug, p.title, p.status, p.product_type, p.price_cents, p.listed_by_admin,
        (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
        (select count(*) from public.product_views v where v.product_id = p.id)::int as views,
        (select count(*) from public.saved_items s where s.product_id = p.id)::int as saves,
        coalesce((select sum(oi.quantity) from public.order_items oi join public.orders o on o.id = oi.order_id
          where oi.product_id = p.id and o.status in ('paid', 'partially_refunded')), 0)::int as sold
      from public.products p where p.maker_id = ${actor.makerId!} and p.status <> 'rejected'
      order by (p.status = 'approved') desc, p.updated_at desc`;
    if (!rows.length) return [];
    const variants = await db<
      { id: string; productId: string; size: string; stock: number; active: boolean }[]
    >`
      select id, product_id, size, stock_quantity as stock, is_active as active from public.product_variants
      where product_id in ${db(rows.map((r) => r.id))} and (is_active or stock_quantity > 0)
      order by sort_order`;
    return rows.map((r) => ({
      ...r,
      variants: variants.filter((v) => v.productId === r.id).map(({ productId: _p, ...v }) => v),
    }));
  });
}

/** "Similar pieces sell for A$X–A$Y": the middle half of live prices in the category. */
export async function priceRange(
  category: string,
): Promise<{ low: number; high: number; n: number } | null> {
  const [r] = await sql()<{ low: number | null; high: number | null; n: number }[]>`
    select percentile_disc(0.25) within group (order by p.price_cents) as low,
      percentile_disc(0.75) within group (order by p.price_cents) as high, count(*)::int as n
    from public.products p join public.makers m on m.id = p.maker_id
    where p.status = 'approved' and m.status = 'approved' and p.category = ${category}`;
  if (!r || !r.low || !r.high || r.n < 3) return null;
  return { low: r.low, high: r.high, n: r.n };
}
