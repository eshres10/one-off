import { sql } from '@/lib/db';
import {
  VISIBLE,
  cardColumns,
  cardJoins,
  toCard,
  toPrefixQuery,
  type CardRow,
  type ProductCard,
} from './catalog';

export interface ExploreQuery {
  q: string;
  filter: string;
  size: string | null;
  max: number | null;
  colour: string | null;
  state: string | null;
}

function where(x: ExploreQuery) {
  const db = sql();
  const tsq = x.q ? toPrefixQuery(x.q) : null;
  const parts = [
    VISIBLE(),
    tsq ? db`p.search_vector @@ to_tsquery('english', ${tsq})` : null,
    ['ready_to_ship', 'made_to_order', 'one_of_one'].includes(x.filter)
      ? db`p.product_type = ${x.filter}`
      : null,
    x.filter === 'under_300' ? db`p.price_cents < 30000` : null,
    x.max ? db`p.price_cents <= ${x.max * 100}` : null,
    x.size
      ? db`exists (select 1 from public.product_variants v where v.product_id = p.id and v.is_active
          and (v.stock_quantity > 0 or p.product_type = 'made_to_order') and regexp_replace(v.size, '^AU\\s*', '') = ${x.size})`
      : null,
    x.colour
      ? db`exists (select 1 from unnest(p.colours) c where lower(c) = ${x.colour.toLowerCase()})`
      : null,
    x.state ? db`m.state = ${x.state}` : null,
  ].filter(Boolean);
  return { db, tsq, where: parts.reduce((acc, c) => db`${acc} and ${c}`, db`true`) };
}

/** Pieces for the Explore results screen. */
export async function exploreProducts(x: ExploreQuery, limit = 80): Promise<ProductCard[]> {
  const { db, tsq, where: w } = where(x);
  const rows = await db<CardRow[]>`
    select ${cardColumns()} from public.products p ${cardJoins()}
    where ${w}
    order by ${tsq ? db`ts_rank(p.search_vector, to_tsquery('english', ${tsq})) desc,` : db``}
      (coalesce(st.total_stock, 0) > 0 or p.product_type = 'made_to_order') desc, p.save_count desc, p.id
    limit ${limit}`;
  return rows.map(toCard);
}

/** The live count on the filter sheet's button. */
export async function countExplore(x: ExploreQuery): Promise<number> {
  const { db, where: w } = where(x);
  const [r] = await db<{ n: number }[]>`
    select count(*)::int as n from public.products p join public.makers m on m.id = p.maker_id where ${w}`;
  return r?.n ?? 0;
}
