import { sql } from '@/lib/db';
import { AVAILABILITY, isNarrowed, type DiscoverParams } from '@/lib/discover/params';
import { EDITS, editBySlug } from '@/lib/discover/edits';
import type { ProductType } from '@/lib/domain/types';
import { toPrefixQuery } from './catalog';

export const DISCOVER_PAGE_SIZE = 30;
/** One edit or maker card per this many pieces, when nothing is filtered. */
const CARD_EVERY = 9;

export interface DiscoverPiece {
  kind: 'piece';
  id: string;
  slug: string;
  title: string;
  makerName: string;
  makerSlug: string;
  priceCents: number;
  productType: ProductType;
  totalStock: number;
  imageUrl: string | null;
  imageAlt: string | null;
  width: number | null;
  height: number | null;
  previewOnly: boolean;
}

export interface DiscoverEdit {
  kind: 'edit';
  id: string;
  slug: string;
  title: string;
  image: string;
}

export interface DiscoverMaker {
  kind: 'maker';
  id: string;
  slug: string;
  displayName: string;
  suburb: string | null;
  avatarUrl: string | null;
  thumbs: Array<{ slug: string; imageUrl: string | null }>;
}

export type DiscoverItem = DiscoverPiece | DiscoverEdit | DiscoverMaker;

export interface DiscoverPage {
  items: DiscoverItem[];
  nextCursor: string | null;
  total: number | null;
}

interface Cursor {
  page: number;
  key: string;
  id: string;
}

function encodeCursor(c: Cursor) {
  return Buffer.from(`${c.page}|${c.key}|${c.id}`).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const [page, key, id] = Buffer.from(raw, 'base64url').toString().split('|');
    if (!page || !key || !id || !/^-?\d+(\.\d+)?$/.test(key) || !/^[0-9a-f-]{36}$/.test(id))
      return null;
    return { page: Number(page), key, id };
  } catch {
    return null;
  }
}

/** Search words (prefix-matched, all required) and an edit's words (any of them). */
function tsQuery(p: DiscoverParams): string | null {
  const parts: string[] = [];
  const q = p.q ? toPrefixQuery(p.q) : null;
  if (q) parts.push(`(${q})`);
  const edit = editBySlug(p.edit ?? undefined);
  if (edit) parts.push(`(${edit.terms.map((t) => `${t}:*`).join(' | ')})`);
  return parts.length ? parts.join(' & ') : null;
}

function feedArgs(p: DiscoverParams) {
  const db = sql();
  const avail = p.avail.map((a) => AVAILABILITY.find((x) => x.value === a)!.productType);
  return db`
    public.discover_feed(
      ${tsQuery(p)}::text,
      ${p.cat === 'all' || p.cat === 'makers' ? null : p.cat}::text,
      ${p.size.length ? p.size : null}::text[],
      ${avail.length ? avail : null}::text[],
      ${p.max !== null ? p.max * 100 : null}::int,
      ${p.colour.length ? p.colour : null}::text[],
      ${p.suburb}::text,
      ${p.sort}::text
    )`;
}

export async function countDiscover(p: DiscoverParams): Promise<number> {
  if (p.cat === 'makers') {
    const [row] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.makers where status = 'approved'`;
    return row?.n ?? 0;
  }
  const [row] = await sql()<{ n: number }[]>`select count(*)::int as n from ${feedArgs(p)}`;
  return row?.n ?? 0;
}

async function makerCards(
  limit: number,
  offset = 0,
  suburb: string | null = null,
): Promise<DiscoverMaker[]> {
  const rows = await sql()<Omit<DiscoverMaker, 'kind'>[]>`
    select m.id, m.slug, m.display_name, m.avatar_url,
      nullif(trim(split_part(coalesce(m.location, m.city, ''), ',', 1)), '') as suburb,
      coalesce((select json_agg(t) from (
        select p.slug, (select i.public_url from public.product_images i where i.product_id = p.id
          order by i.sort_order limit 1) as "imageUrl"
        from public.products p where p.maker_id = m.id and p.status = 'approved'
        order by p.is_featured desc, p.approved_at desc nulls last limit 3) t), '[]'::json) as thumbs
    from public.makers m
    where m.status = 'approved'
      ${suburb ? sql()`and lower(trim(split_part(coalesce(m.location, m.city, ''), ',', 1))) = lower(${suburb})` : sql()``}
    order by m.is_featured desc, m.rating desc, m.approved_at desc nulls last, m.id
    limit ${limit} offset ${offset}`;
  return rows.map((r) => ({ kind: 'maker' as const, ...r }));
}

/**
 * One page of the Discover feed. Pieces come from public.discover_feed, paged by a keyset cursor
 * (so loading more never repeats or skips). With nothing narrowing the feed, an edit or maker
 * card is mixed in after every ninth piece.
 */
export async function getDiscoverPage(
  p: DiscoverParams,
  rawCursor?: string | null,
): Promise<DiscoverPage> {
  const cursor = decodeCursor(rawCursor);
  const page = cursor ? cursor.page + 1 : 0;

  if (p.cat === 'makers') {
    const makers = await makerCards(60, 0, p.suburb);
    return { items: makers, nextCursor: null, total: makers.length };
  }

  const db = sql();
  const rows = await db<(Omit<DiscoverPiece, 'kind'> & { sortKey: string })[]>`
    select p.id, p.slug, p.title, p.price_cents, p.product_type, ('preview-only' = any(p.tags)) as preview_only,
      m.display_name as maker_name, m.slug as maker_slug, f.sort_key::text as sort_key,
      coalesce((select sum(v.stock_quantity) from public.product_variants v where v.product_id = p.id and v.is_active), 0)::int as total_stock,
      img.public_url as image_url, img.alt_text as image_alt, img.width, img.height
    from ${feedArgs(p)} f
    join public.products p on p.id = f.product_id
    join public.makers m on m.id = p.maker_id
    left join lateral (
      select public_url, alt_text, width, height from public.product_images i
      where i.product_id = p.id order by sort_order limit 1
    ) img on true
    ${cursor ? db`where (f.sort_key, f.product_id) < (${cursor.key}::numeric, ${cursor.id}::uuid)` : db``}
    order by f.sort_key desc, f.product_id desc
    limit ${DISCOVER_PAGE_SIZE + 1}`;

  const more = rows.length > DISCOVER_PAGE_SIZE;
  const pieces: DiscoverPiece[] = rows
    .slice(0, DISCOVER_PAGE_SIZE)
    .map(({ sortKey: _k, ...r }) => ({ kind: 'piece', ...r }));
  const last = rows[Math.min(rows.length, DISCOVER_PAGE_SIZE) - 1];
  const nextCursor = more && last ? encodeCursor({ page, key: last.sortKey, id: last.id }) : null;

  let items: DiscoverItem[] = pieces;
  if (!isNarrowed(p) && pieces.length > 4) {
    // Alternate edit and maker cards; the sequence continues across pages.
    const slots = Math.floor(pieces.length / CARD_EVERY) + 1;
    const startSlot = page * (Math.floor(DISCOVER_PAGE_SIZE / CARD_EVERY) + 1);
    const edits = EDITS.filter((e) => e.card);
    const makers = await makerCards(Math.ceil(slots / 2) + 1, Math.floor(startSlot / 2));
    items = [];
    let slot = 0;
    pieces.forEach((piece, i) => {
      items.push(piece);
      if ((i + 1 - 4) % CARD_EVERY === 0 && slot < slots) {
        const n = startSlot + slot;
        const card: DiscoverItem | undefined =
          n % 2 === 0
            ? (() => {
                const e = edits[(n / 2) % edits.length]!;
                return {
                  kind: 'edit' as const,
                  id: `edit-${e.slug}-${n}`,
                  slug: e.slug,
                  title: e.title,
                  image: e.image,
                };
              })()
            : makers[Math.floor(slot / 2)];
        if (card) items.push(card);
        slot++;
      }
    });
  }

  const total = cursor ? null : await countDiscover(p);
  return { items, nextCursor, total };
}
