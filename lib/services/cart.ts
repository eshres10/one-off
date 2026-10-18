import { PREVIEW_ONLY_LABEL, PREVIEW_ONLY_TAG } from '@/lib/domain/preview';
import { randomUUID } from 'node:crypto';
import { sql, type Db } from '@/lib/db';
import { assertCheckoutEnabled } from '@/lib/features';
import { computeCartTotals, type CartTotals } from '@/lib/domain/cart';
import { estimateDelivery, formatDateRange } from '@/lib/domain/leadTime';
import { validateStock } from '@/lib/domain/stock';
import type { CartLine, MakerShipping, ProductType } from '@/lib/domain/types';

export interface CartLineView extends CartLine {
  id: string;
  makerSlug: string;
  stockQuantity: number;
  isAvailable: boolean;
  problem: string | null;
  deliveryEstimate: string;
}

export interface CartView {
  cartId: string | null;
  lines: CartLineView[];
  totals: CartTotals;
  hasProblems: boolean;
}

export class CartError extends Error {}

interface Row {
  id: string;
  productId: string;
  variantId: string;
  makerId: string;
  makerName: string;
  makerSlug: string;
  productTitle: string;
  productSlug: string;
  productType: ProductType;
  size: string;
  colour: string | null;
  colourCount: number;
  imageUrl: string | null;
  quantity: number;
  unitPriceCents: number;
  leadTimeDays: number | null;
  stockQuantity: number;
  variantActive: boolean;
  lowStockThreshold: number;
  productStatus: string;
  makerStatus: string;
  shippingStandardCents: number;
  freeShippingOverCents: number | null;
  dispatchDays: number;
}

export function variantLabel(size: string, colour: string | null, colourCount: number) {
  return `AU ${size}${colour && colourCount > 1 ? ` · ${colour}` : ''}`;
}

async function loadRows(db: Db, cartId: string): Promise<Row[]> {
  return db<Row[]>`
    select ci.id, ci.product_id, ci.variant_id, p.maker_id, m.display_name as maker_name, m.slug as maker_slug,
           p.title as product_title, p.slug as product_slug, p.product_type, v.size, v.colour,
           cardinality(p.colours) as colour_count,
           (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url,
           ci.quantity, coalesce(v.price_cents, p.price_cents) as unit_price_cents, p.lead_time_days,
           v.stock_quantity, v.is_active as variant_active, v.low_stock_threshold, p.status as product_status,
           m.status as maker_status, m.shipping_standard_cents, m.free_shipping_over_cents, m.dispatch_days
    from public.cart_items ci
    join public.products p on p.id = ci.product_id
    join public.product_variants v on v.id = ci.variant_id
    join public.makers m on m.id = p.maker_id
    where ci.cart_id = ${cartId}
    order by m.display_name, ci.created_at`;
}

export function shippingMap(
  rows: Array<
    Pick<Row, 'makerId' | 'shippingStandardCents' | 'freeShippingOverCents' | 'dispatchDays'>
  >,
) {
  return new Map<string, MakerShipping>(
    rows.map((r) => [
      r.makerId,
      {
        makerId: r.makerId,
        shippingStandardCents: r.shippingStandardCents,
        freeShippingOverCents: r.freeShippingOverCents,
        dispatchDays: r.dispatchDays,
      },
    ]),
  );
}

export async function findCartId(
  sessionId: string | undefined,
  db: Db = sql(),
): Promise<string | null> {
  if (!sessionId) return null;
  const [row] = await db<
    { id: string }[]
  >`select id from public.carts where session_id = ${sessionId}`;
  return row?.id ?? null;
}

export async function getCart(sessionId: string | undefined, db: Db = sql()): Promise<CartView> {
  const cartId = await findCartId(sessionId, db);
  if (!cartId)
    return {
      cartId: null,
      lines: [],
      totals: computeCartTotals([], new Map()),
      hasProblems: false,
    };
  const rows = await loadRows(db, cartId);
  const lines: CartLineView[] = rows.map((r) => {
    let problem: string | null = null;
    if (r.productStatus !== 'approved' || r.makerStatus !== 'approved')
      problem = 'This piece is no longer available.';
    else {
      const check = validateStock(
        {
          id: r.variantId,
          stockQuantity: r.stockQuantity,
          isActive: r.variantActive,
          lowStockThreshold: r.lowStockThreshold,
        },
        r.productType,
        r.quantity,
      );
      if (!check.ok) problem = check.reason;
    }
    const est = estimateDelivery({
      productType: r.productType,
      leadTimeDays: r.leadTimeDays,
      dispatchDays: r.dispatchDays,
    });
    return {
      id: r.id,
      productId: r.productId,
      variantId: r.variantId,
      makerId: r.makerId,
      makerName: r.makerName,
      makerSlug: r.makerSlug,
      productTitle: r.productTitle,
      productSlug: r.productSlug,
      variantLabel: variantLabel(r.size, r.colour, r.colourCount),
      productType: r.productType,
      imageUrl: r.imageUrl,
      quantity: r.quantity,
      unitPriceCents: r.unitPriceCents,
      leadTimeDays: r.leadTimeDays,
      stockQuantity: r.stockQuantity,
      isAvailable: problem === null,
      problem,
      deliveryEstimate: formatDateRange(est.deliveryFrom, est.deliveryTo),
    };
  });
  return {
    cartId,
    lines,
    totals: computeCartTotals(lines, shippingMap(rows)),
    hasProblems: lines.some((l) => !l.isAvailable),
  };
}

export async function addToCart(input: {
  sessionId: string;
  userId: string | null;
  productId: string;
  variantId: string;
  quantity: number;
}): Promise<void> {
  assertCheckoutEnabled();
  await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const [variant] = await db<
      {
        stockQuantity: number;
        isActive: boolean;
        lowStockThreshold: number;
        productType: ProductType;
        unitPriceCents: number;
        visible: boolean;
        previewOnly: boolean;
      }[]
    >`
      select v.stock_quantity, v.is_active, v.low_stock_threshold, p.product_type,
             coalesce(v.price_cents, p.price_cents) as unit_price_cents,
             (p.status = 'approved' and m.status = 'approved') as visible,
             ${PREVIEW_ONLY_TAG} = any(p.tags) as preview_only
      from public.product_variants v join public.products p on p.id = v.product_id join public.makers m on m.id = p.maker_id
      where v.id = ${input.variantId} and v.product_id = ${input.productId}`;
    if (!variant || !variant.visible) throw new CartError('This piece is no longer available.');
    if (variant.previewOnly) throw new CartError(`${PREVIEW_ONLY_LABEL}.`);

    const [cart] = await db<{ id: string }[]>`
      insert into public.carts (session_id, user_id) values (${input.sessionId}, ${input.userId})
      on conflict (session_id) do update set updated_at = now(), user_id = coalesce(public.carts.user_id, excluded.user_id)
      returning id`;
    const [existing] = await db<{ quantity: number }[]>`
      select quantity from public.cart_items where cart_id = ${cart!.id} and variant_id = ${input.variantId} for update`;
    const check = validateStock(
      {
        id: input.variantId,
        stockQuantity: variant.stockQuantity,
        isActive: variant.isActive,
        lowStockThreshold: variant.lowStockThreshold,
      },
      variant.productType,
      input.quantity,
      existing?.quantity ?? 0,
    );
    if (!check.ok)
      throw new CartError(
        existing && variant.productType === 'one_of_one'
          ? 'This piece is already in your bag.'
          : check.reason,
      );
    await db`
      insert into public.cart_items (cart_id, product_id, variant_id, quantity, unit_price_cents)
      values (${cart!.id}, ${input.productId}, ${input.variantId}, ${input.quantity}, ${variant.unitPriceCents})
      on conflict (cart_id, variant_id) do update set quantity = public.cart_items.quantity + excluded.quantity,
        unit_price_cents = excluded.unit_price_cents`;
  });
}

export async function updateCartItem(
  sessionId: string,
  itemId: string,
  quantity: number,
): Promise<void> {
  const cartId = await findCartId(sessionId);
  if (!cartId) return;
  if (quantity <= 0) {
    await sql()`delete from public.cart_items where id = ${itemId} and cart_id = ${cartId}`;
    return;
  }
  const [row] = await sql()<
    {
      stockQuantity: number;
      isActive: boolean;
      lowStockThreshold: number;
      productType: ProductType;
      variantId: string;
    }[]
  >`
    select v.stock_quantity, v.is_active, v.low_stock_threshold, p.product_type, v.id as variant_id
    from public.cart_items ci join public.product_variants v on v.id = ci.variant_id join public.products p on p.id = ci.product_id
    where ci.id = ${itemId} and ci.cart_id = ${cartId}`;
  if (!row) return;
  const check = validateStock(
    {
      id: row.variantId,
      stockQuantity: row.stockQuantity,
      isActive: row.isActive,
      lowStockThreshold: row.lowStockThreshold,
    },
    row.productType,
    quantity,
  );
  if (!check.ok) throw new CartError(check.reason);
  await sql()`update public.cart_items set quantity = ${quantity} where id = ${itemId} and cart_id = ${cartId}`;
}

export async function cartCount(sessionId: string | undefined): Promise<number> {
  if (!sessionId) return 0;
  const [row] = await sql()<{ n: number }[]>`
    select coalesce(sum(ci.quantity), 0)::int as n from public.cart_items ci join public.carts c on c.id = ci.cart_id
    where c.session_id = ${sessionId}`;
  return row?.n ?? 0;
}

export function newCartSessionId() {
  return randomUUID();
}
