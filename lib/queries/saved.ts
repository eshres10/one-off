import { sql, withUser } from '@/lib/db';
import { savedStatus, type SavedStatus } from '@/lib/domain/saved';
import type { SessionUser } from '@/lib/auth/session';
import { getCardsByIds, type ProductCard } from './catalog';

type Actor = Pick<SessionUser, 'id' | 'role'>;

export interface SavedVariant {
  id: string;
  size: string;
  colour: string | null;
  inStock: boolean;
}

export interface SavedPiece {
  card: ProductCard;
  priceAtSave: number | null;
  status: SavedStatus;
  variants: SavedVariant[];
  inBag: boolean;
}

interface Facts {
  productId: string;
  priceAtSave: number | null;
  totalStock: number;
  backInSize: boolean;
  variants: SavedVariant[];
  inBag: boolean;
}

/** Stock, saved price, size alerts and bag state for a list of products. */
async function facts(
  productIds: string[],
  userId: string | null,
  cartSessionId: string | undefined,
): Promise<Map<string, Facts>> {
  if (!productIds.length) return new Map();
  const rows = await sql()<Facts[]>`
    select p.id as product_id,
      ${userId ? sql()`(select s.price_at_save from public.saved_items s where s.user_id = ${userId} and s.product_id = p.id)` : sql()`null::int`} as price_at_save,
      coalesce((select sum(v.stock_quantity) from public.product_variants v where v.product_id = p.id and v.is_active), 0)::int as total_stock,
      ${
        userId
          ? sql()`exists (select 1 from public.size_watches w join public.product_variants v on v.id = w.variant_id
               where w.user_id = ${userId} and v.product_id = p.id and v.is_active and v.stock_quantity > 0)`
          : sql()`false`
      } as back_in_size,
      coalesce((select json_agg(json_build_object('id', v.id, 'size', v.size, 'colour', v.colour,
          'inStock', v.stock_quantity > 0 or p.product_type = 'made_to_order') order by v.sort_order)
        from public.product_variants v where v.product_id = p.id and v.is_active), '[]'::json) as variants,
      ${
        cartSessionId
          ? sql()`exists (select 1 from public.cart_items ci join public.carts c on c.id = ci.cart_id
               where c.session_id = ${cartSessionId} and ci.product_id = p.id)`
          : sql()`false`
      } as in_bag
    from public.products p where p.id in ${sql()(productIds)}`;
  return new Map(rows.map((r) => [r.productId, r]));
}

function toPieces(cards: ProductCard[], byId: Map<string, Facts>): SavedPiece[] {
  return cards.map((card) => {
    const f = byId.get(card.id);
    return {
      card,
      priceAtSave: f?.priceAtSave ?? null,
      variants: f?.variants ?? [],
      inBag: f?.inBag ?? false,
      status: savedStatus({
        priceCents: card.priceCents,
        priceAtSave: f?.priceAtSave ?? null,
        productType: card.productType,
        totalStock: f?.totalStock ?? 0,
        leadTimeDays: card.leadTimeDays,
        backInSize: f?.backInSize ?? false,
      }),
    };
  });
}

export async function getSavedPieces(
  user: Actor,
  cartSessionId: string | undefined,
): Promise<SavedPiece[]> {
  const rows = await withUser(
    user,
    (db) => db<{ productId: string }[]>`
      select product_id from public.saved_items where user_id = ${user.id} order by created_at desc`,
  );
  const cards = await getCardsByIds(rows.map((r) => r.productId));
  return toPieces(
    cards,
    await facts(
      cards.map((c) => c.id),
      user.id,
      cartSessionId,
    ),
  );
}

/** Signed-out saves live in the browser; this resolves them to cards. */
export async function getPiecesByIds(
  ids: string[],
  cartSessionId: string | undefined,
): Promise<SavedPiece[]> {
  const cards = await getCardsByIds(ids.slice(0, 100));
  return toPieces(
    cards,
    await facts(
      cards.map((c) => c.id),
      null,
      cartSessionId,
    ),
  );
}

export interface FollowedMaker {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  suburb: string | null;
  news: string;
}

/** Followed makers with a one-line "latest news" derived from their activity. */
export async function getFollowedMakers(user: Actor): Promise<FollowedMaker[]> {
  const rows = await withUser(
    user,
    (db) => db<
      (Omit<FollowedMaker, 'news'> & {
        newPieces: number;
        customCommissionsEnabled: boolean;
        latestAt: Date | null;
      })[]
    >`
      select m.id, m.slug, m.display_name, m.avatar_url,
        nullif(trim(split_part(coalesce(m.location, m.city, ''), ',', 1)), '') as suburb,
        m.custom_commissions_enabled,
        (select count(*) from public.products p where p.maker_id = m.id and p.status = 'approved'
           and p.approved_at > now() - interval '14 days')::int as new_pieces,
        (select max(p.approved_at) from public.products p where p.maker_id = m.id and p.status = 'approved') as latest_at
      from public.maker_follows f join public.makers m on m.id = f.maker_id
      where f.user_id = ${user.id} and m.status = 'approved'
      order by latest_at desc nulls last, m.display_name`,
  );
  return rows.map(({ newPieces, customCommissionsEnabled, latestAt: _l, ...m }) => ({
    ...m,
    news:
      newPieces > 0
        ? `${newPieces} new ${newPieces === 1 ? 'piece' : 'pieces'}`
        : customCommissionsEnabled
          ? 'Taking custom orders'
          : 'Making for the next drop',
  }));
}
