import { randomBytes } from 'node:crypto';
import { audit } from '@/lib/audit';
import { sql, type Db } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { splitOrder } from '@/lib/domain/split';
import type { ProductType } from '@/lib/domain/types';
import { env } from '@/lib/env';
import { assertCheckoutEnabled } from '@/lib/features';
import { payments } from '@/lib/payments';
import {
  estimateArrival,
  formatArrival,
  latestArrival,
  rateFor,
  stateFromPostcode,
  zoneFor,
  type MakerRates,
  type Speed,
  type Zone,
} from '@/lib/shipping/estimate';
import { SITE } from '@/lib/site/config';
import { RETURNS_POLICY_VERSION } from '@/lib/content/returns';
import { TERMS, commissionPctAt } from '@/lib/studio/terms';
import { CartError, getCart, type CartLineView } from './cart';

/**
 * Checkout is one pending order per bag, owned by the browser session that holds the bag (the
 * `oo_cart` cookie). Every step re-reads the bag and recomputes prices, delivery and totals on
 * the server; nothing from the browser is trusted except the buyer's own details and choices.
 * Payment is one PaymentIntent on the platform account (transfer_group = order id); the order
 * becomes paid only when the verified payment_intent.succeeded webhook arrives.
 */

export interface CheckoutAddress {
  name: string;
  line1: string;
  line2: string;
  suburb: string;
  state: string;
  postcode: string;
}

export interface CheckoutItem {
  id: string;
  variantId: string;
  productId: string;
  productSlug: string | null;
  title: string;
  variantLabel: string;
  imageUrl: string | null;
  productType: ProductType;
  quantity: number;
  unitPriceCents: number;
  leadTimeDays: number | null;
  /** Another buyer is paying for this one-of-one right now. */
  heldByOther: boolean;
}

export interface CheckoutParcel {
  fulfilmentId: string;
  makerId: string;
  makerName: string;
  /** "Fitzroy, VIC" */
  makerPlace: string;
  zone: Zone;
  speed: Speed;
  items: CheckoutItem[];
  options: Record<Speed, { cents: number; arrival: string; from: string; to: string }>;
  /** Made to order: "Halde Studio starts once you pay and finishes in about 14 days." */
  mtoNote: string | null;
}

export interface CheckoutView {
  orderId: string;
  orderNumber: string;
  email: string;
  phone: string;
  address: CheckoutAddress | null;
  saveDetails: boolean;
  signedIn: boolean;
  firstName: string | null;
  savedAddresses: Array<CheckoutAddress & { id: string; label: string; isDefault: boolean }>;
  parcels: CheckoutParcel[];
  pieces: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  gstCents: number;
  /** 1 details, 2 delivery, 3 payment: the first step not yet done. */
  step: 1 | 2 | 3;
  detailsDone: boolean;
  deliveryDone: boolean;
  hasHeld: boolean;
}

interface Owner {
  sessionId: string;
  userId: string | null;
  email?: string | null;
}

export const HELD_MESSAGE =
  'Someone’s checking out with this piece. It’ll be free in a few minutes if they don’t.';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const typeLabel: Record<ProductType, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};
export { typeLabel as PRODUCT_TYPE_LABEL };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** GST included in a GST-inclusive Australian price (1/11). */
export const gstIncluded = (cents: number) => Math.round(cents / 11);

/**
 * Orders store addresses in Stripe's shape (line1, line2, city, state, postal_code, country),
 * which packing slips, Studio and emails already read. Checkout works with suburb / postcode.
 */
type StoredAddress = {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};
const toStored = (a: CheckoutAddress): StoredAddress => ({
  name: a.name,
  line1: a.line1,
  line2: a.line2,
  city: a.suburb,
  state: a.state,
  postal_code: a.postcode,
  country: 'AU',
});

function cleanAddress(
  raw: (Partial<CheckoutAddress> & StoredAddress) | null | undefined,
): CheckoutAddress | null {
  if (!raw) return null;
  const a: Partial<CheckoutAddress> = {
    ...raw,
    suburb: raw.suburb ?? raw.city,
    postcode: raw.postcode ?? raw.postal_code,
  };
  const t = (v: unknown, max: number) =>
    sanitizeText(String(v ?? ''))
      .trim()
      .slice(0, max);
  const out = {
    name: t(a.name, 120),
    line1: t(a.line1, 200),
    line2: t(a.line2, 120),
    suburb: t(a.suburb, 100),
    state: t(a.state, 3).toUpperCase(),
    postcode: t(a.postcode, 4),
  };
  return out;
}

function addressProblem(a: CheckoutAddress | null): string | null {
  if (!a) return 'Add your delivery address.';
  if (a.name.length < 2) return 'Add the name for the delivery.';
  if (a.line1.length < 3) return 'Add your street address.';
  if (!a.suburb) return 'Add your suburb.';
  if (!(SITE.makerRegions as readonly string[]).includes(a.state)) return 'Pick your state.';
  if (!/^\d{4}$/.test(a.postcode)) return 'Add a 4-digit postcode.';
  const fromPostcode = stateFromPostcode(a.postcode);
  if (fromPostcode && fromPostcode !== a.state)
    return `That postcode is in ${fromPostcode}. Check the state or postcode.`;
  return null;
}

/** The buyer's state for delivery prices: from the address, or a saved / last-used one. */
async function buyerStateFor(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const [row] = await sql()<{ state: string | null }[]>`
    select coalesce(
      (select a->>'state' from public.customer_prefs p, jsonb_array_elements(p.addresses) a
        where p.user_id = ${userId} order by (a->>'isDefault')::boolean desc nulls last limit 1),
      (select o.shipping_address->>'state' from public.orders o
        where o.buyer_user_id = ${userId} and o.shipping_address is not null and o.status <> 'pending'
        order by o.created_at desc limit 1)) as state`;
  return row?.state ?? null;
}

interface MakerRow {
  makerId: string;
  makerName: string;
  city: string | null;
  state: string | null;
  dispatchDays: number;
  freeShippingOverCents: number | null;
  foundingUntil: Date | null;
  sameStandard: number | null;
  sameExpress: number | null;
  auStandard: number | null;
  auExpress: number | null;
}

async function makerRows(makerIds: string[]): Promise<Map<string, MakerRow>> {
  if (!makerIds.length) return new Map();
  const rows = await sql()<MakerRow[]>`
    select m.id as maker_id, m.display_name as maker_name, m.city, m.state, m.dispatch_days, m.free_shipping_over_cents,
      m.founding_until,
      (select standard_cents from public.maker_shipping_rates r where r.maker_id = m.id and r.region = 'same_state' and r.enabled) as same_standard,
      (select express_cents from public.maker_shipping_rates r where r.maker_id = m.id and r.region = 'same_state' and r.enabled) as same_express,
      (select standard_cents from public.maker_shipping_rates r where r.maker_id = m.id and r.region = 'au' and r.enabled) as au_standard,
      (select express_cents from public.maker_shipping_rates r where r.maker_id = m.id and r.region = 'au' and r.enabled) as au_express
    from public.makers m where m.id in ${sql()(makerIds)}`;
  return new Map(rows.map((r) => [r.makerId, r]));
}

const ratesOf = (m: MakerRow): MakerRates => ({
  sameState: { standard: m.sameStandard, express: m.sameExpress },
  interstate: { standard: m.auStandard, express: m.auExpress },
  freeOverCents: m.freeShippingOverCents,
});

/** Price and arrival for one maker's parcel, at a speed. */
function parcelQuote(
  m: MakerRow,
  lines: Array<Pick<CartLineView, 'productType' | 'leadTimeDays' | 'unitPriceCents' | 'quantity'>>,
  buyerState: string | null,
  speed: Speed,
  now: Date,
) {
  const zone = zoneFor(m.state, buyerState);
  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  const cents = rateFor(zone, speed, ratesOf(m), subtotal);
  const arrival = latestArrival(
    lines.map((l) =>
      estimateArrival(
        {
          productType: l.productType,
          leadTimeDays: l.leadTimeDays,
          dispatchDays: m.dispatchDays,
          zone,
          speed,
        },
        now,
      ),
    ),
  );
  return { zone, cents, arrival };
}

/**
 * The bag's estimate before checkout: standard delivery from each maker to the buyer's saved or
 * last-used state, or the interstate price ("from") when the state is unknown.
 */
export async function bagDeliveryEstimate(
  lines: CartLineView[],
  userId: string | null,
): Promise<{ cents: number; makers: number; from: boolean }> {
  const byMaker = new Map<string, CartLineView[]>();
  for (const l of lines) byMaker.set(l.makerId, [...(byMaker.get(l.makerId) ?? []), l]);
  const makers = await makerRows(Array.from(byMaker.keys()));
  const state = await buyerStateFor(userId);
  let cents = 0;
  for (const [makerId, ls] of byMaker) {
    const m = makers.get(makerId);
    if (m) cents += parcelQuote(m, ls, state, 'standard', new Date()).cents;
  }
  return { cents, makers: byMaker.size, from: !state };
}

async function pendingOrderFor(owner: Owner) {
  const [o] = await sql()<
    {
      id: string;
      orderNumber: string;
      cartId: string | null;
      buyerEmail: string;
      buyerPhone: string | null;
      buyerName: string | null;
      shippingAddress: (Partial<CheckoutAddress> & StoredAddress) | null;
      saveDetails: boolean;
      buyerUserId: string | null;
      stripePaymentIntentId: string | null;
      stripeCustomerId: string | null;
      checkoutStep: number;
    }[]
  >`
    select o.id, o.order_number, o.cart_id, o.buyer_email, o.buyer_phone, o.buyer_name, o.shipping_address,
      o.save_details, o.buyer_user_id, o.stripe_payment_intent_id, o.stripe_customer_id, o.checkout_step
    from public.orders o join public.carts c on c.id = o.cart_id
    where c.session_id = ${owner.sessionId} and o.status = 'pending' and o.checkout_session = ${owner.sessionId}
    order by o.created_at desc limit 1`;
  return o ?? null;
}

/**
 * Opens (or re-opens) checkout for the bag: makes sure there's a pending order, and rebuilds its
 * parcels and items from the bag so prices and stock are always current.
 */
export async function openCheckout(owner: Owner, now = new Date()): Promise<CheckoutView> {
  await assertCheckoutEnabled();
  const cart = await getCart(owner.sessionId);
  if (!cart.cartId || cart.lines.length === 0) throw new CartError('Your bag is empty.');
  if (cart.hasProblems)
    throw new CartError('Some pieces in your bag are no longer available. Please review your bag.');

  let order = await pendingOrderFor(owner);
  if (!order) {
    const [prefill] = owner.userId
      ? await sql()<
          {
            email: string;
            phone: string | null;
            name: string | null;
            address: CheckoutAddress | null;
          }[]
        >`
          select u.email,
            (select o.buyer_phone from public.orders o where o.buyer_user_id = u.id and o.buyer_phone is not null
              order by o.created_at desc limit 1) as phone,
            coalesce(p.first_name, u.display_name) as name,
            coalesce(
              (select a from jsonb_array_elements(p.addresses) a order by (a->>'isDefault')::boolean desc nulls last limit 1),
              (select o.shipping_address from public.orders o where o.buyer_user_id = u.id and o.shipping_address is not null
                and o.status <> 'pending' order by o.created_at desc limit 1)) as address
          from public.users u left join public.customer_prefs p on p.user_id = u.id where u.id = ${owner.userId}`
      : [];
    const [created] = await sql()<{ id: string }[]>`
      insert into public.orders (order_number, buyer_user_id, buyer_email, buyer_phone, buyer_name, shipping_address,
        status, subtotal_cents, shipping_total_cents, total_cents, cart_id, checkout_session, save_details, transfer_group)
      values (public.next_order_number(), ${owner.userId}, ${prefill?.email ?? owner.email ?? ''}, ${prefill?.phone ?? null},
        ${prefill?.address?.name ?? prefill?.name ?? null},
        ${prefill?.address ? sql().json(toStored(cleanAddress(prefill.address)!) as never) : null},
        'pending', 0, 0, 0, ${cart.cartId}, ${owner.sessionId}, ${!owner.userId}, null)
      returning id`;
    await sql()`update public.orders set transfer_group = id::text where id = ${created!.id}`;
    order = (await pendingOrderFor(owner))!;
    await audit('checkout.opened', { type: 'order', id: order.id }, {}, owner.userId);
  } else if (owner.userId && !order.buyerUserId) {
    // Signed in part way (the sign-in link from the details step): fill in what we know.
    const [u] = await sql()<
      { email: string }[]
    >`select email from public.users where id = ${owner.userId}`;
    await sql()`
      update public.orders set buyer_user_id = ${owner.userId},
        buyer_email = case when buyer_email = '' then ${u?.email ?? ''} else buyer_email end
      where id = ${order.id}`;
    order = (await pendingOrderFor(owner))!;
  }
  await syncOrder(order.id, cart.lines, now);
  return checkoutView(owner, now);
}

/** Rebuilds a pending order's parcels and items from the bag, keeping each maker's speed. */
async function syncOrder(orderId: string, lines: CartLineView[], now: Date) {
  const [o] = await sql()<{ shippingAddress: Partial<CheckoutAddress> | null }[]>`
    select shipping_address from public.orders where id = ${orderId}`;
  const buyerState = cleanAddress(o?.shippingAddress)?.state || null;
  const makers = await makerRows(Array.from(new Set(lines.map((l) => l.makerId))));
  const speeds = new Map(
    (
      await sql()<{ makerId: string; speed: Speed }[]>`
        select maker_id, speed from public.fulfilments where order_id = ${orderId}`
    ).map((r) => [r.makerId, r.speed]),
  );
  const quotes = new Map<string, ReturnType<typeof parcelQuote> & { speed: Speed }>();
  for (const makerId of new Set(lines.map((l) => l.makerId))) {
    const speed = speeds.get(makerId) ?? 'standard';
    quotes.set(makerId, {
      ...parcelQuote(
        makers.get(makerId)!,
        lines.filter((l) => l.makerId === makerId),
        buyerState,
        speed,
        now,
      ),
      speed,
    });
  }
  const plan = splitOrder(
    lines,
    new Map(
      Array.from(quotes.entries()).map(([makerId, q]) => [
        makerId,
        {
          makerId,
          shippingStandardCents: q.cents,
          freeShippingOverCents: null,
          dispatchDays: makers.get(makerId)!.dispatchDays,
        },
      ]),
    ),
    (makerId) => {
      const pct = commissionPctAt(makers.get(makerId)?.foundingUntil, now);
      return pct === TERMS.standardCommissionPct ? env().PLATFORM_FEE_BPS : Math.round(pct * 100);
    },
  );

  await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const [locked] = await db<{ status: string }[]>`
      select status from public.orders where id = ${orderId} for update`;
    if (locked?.status !== 'pending') return;
    const notes = new Map(
      (
        await db<{ variantId: string; note: string | null }[]>`
          select variant_id, note_to_maker as note from public.order_items where order_id = ${orderId}`
      ).map((r) => [r.variantId, r.note]),
    );
    await db`delete from public.order_items where order_id = ${orderId}`;
    await db`delete from public.fulfilments where order_id = ${orderId}`;
    for (const f of plan.fulfilments) {
      const q = quotes.get(f.makerId)!;
      const [ful] = await db<{ id: string }[]>`
        insert into public.fulfilments (order_id, maker_id, status, subtotal_cents, shipping_cents, platform_commission_cents,
          seller_net_cents, estimated_dispatch_date, estimated_delivery_from, estimated_delivery_to, commission_pct_applied,
          shipping_method, speed, reply_token)
        values (${orderId}, ${f.makerId}, 'paid', ${f.subtotalCents}, ${f.shippingCents}, ${f.platformCommissionCents},
          ${f.sellerNetCents}, ${iso(q.arrival.dispatch)}, ${iso(q.arrival.from)}, ${iso(q.arrival.to)}, ${f.feeBps / 100},
          ${q.speed === 'express' ? 'Express tracked' : f.shippingCents === 0 ? 'Free tracked shipping' : 'Standard tracked'},
          ${q.speed}, ${randomBytes(12).toString('base64url')})
        returning id`;
      for (const item of f.items) {
        await db`
          insert into public.order_items (order_id, fulfilment_id, product_id, variant_id, maker_id, product_title, variant_label,
            product_type, image_url, quantity, unit_price_cents, line_total_cents, platform_commission_cents, seller_net_cents,
            custom_measurements, note_to_maker)
          values (${orderId}, ${ful!.id}, ${item.productId}, ${item.variantId}, ${item.makerId}, ${item.productTitle},
            ${item.variantLabel}, ${item.productType}, ${item.imageUrl ?? null}, ${item.quantity}, ${item.unitPriceCents},
            ${item.lineTotalCents}, ${item.platformCommissionCents}, ${item.sellerNetCents},
            (select ci.custom_measurements from public.cart_items ci join public.orders o on o.cart_id = ci.cart_id
              where o.id = ${orderId} and ci.variant_id = ${item.variantId} limit 1),
            ${notes.get(item.variantId) ?? null})`;
      }
    }
    await db`
      update public.orders set subtotal_cents = ${plan.subtotalCents}, shipping_total_cents = ${plan.shippingTotalCents},
        total_cents = ${plan.totalCents}, platform_fee_total_cents = ${plan.platformFeeTotalCents}
      where id = ${orderId}`;
    await db`
      delete from public.reservations r where r.order_id = ${orderId}
        and not exists (select 1 from public.order_items oi where oi.order_id = ${orderId} and oi.variant_id = r.variant_id)`;
  });
}

/** What the checkout page shows for the session's pending order. */
export async function checkoutView(owner: Owner, now = new Date()): Promise<CheckoutView> {
  const order = await pendingOrderFor(owner);
  if (!order) throw new CartError('Your checkout has expired. Please start again from your bag.');
  const address = cleanAddress(order.shippingAddress);
  const buyerState = address?.state || null;
  const rows = await sql()<
    (CheckoutItem & {
      fulfilmentId: string;
      makerId: string;
      speed: Speed;
      shippingCents: number;
    })[]
  >`
    select oi.id, oi.variant_id, oi.product_id, p.slug as product_slug, oi.product_title as title, oi.variant_label,
      oi.image_url, oi.product_type, oi.quantity, oi.unit_price_cents, p.lead_time_days, f.id as fulfilment_id,
      f.maker_id, f.speed, f.shipping_cents,
      (oi.product_type = 'one_of_one' and exists (
        select 1 from public.reservations r where r.variant_id = oi.variant_id and r.order_id <> oi.order_id
          and r.expires_at > now())) as held_by_other
    from public.order_items oi join public.fulfilments f on f.id = oi.fulfilment_id
    left join public.products p on p.id = oi.product_id
    where oi.order_id = ${order.id}
    order by f.created_at, oi.created_at`;
  const makers = await makerRows(Array.from(new Set(rows.map((r) => r.makerId))));
  const parcels: CheckoutParcel[] = [];
  for (const fid of Array.from(new Set(rows.map((r) => r.fulfilmentId)))) {
    const items = rows.filter((r) => r.fulfilmentId === fid);
    const first = items[0]!;
    const m = makers.get(first.makerId)!;
    const quote = (speed: Speed) => {
      const q = parcelQuote(m, items, buyerState, speed, now);
      return {
        cents: q.cents,
        arrival: formatArrival(q.arrival.from, q.arrival.to),
        from: iso(q.arrival.from),
        to: iso(q.arrival.to),
      };
    };
    const mto = items.find((i) => i.productType === 'made_to_order');
    parcels.push({
      fulfilmentId: fid,
      makerId: first.makerId,
      makerName: m.makerName,
      makerPlace: [m.city, m.state].filter(Boolean).join(', '),
      zone: zoneFor(m.state, buyerState),
      speed: first.speed,
      items: items.map(
        ({ fulfilmentId: _f, makerId: _m, speed: _s, shippingCents: _c, ...i }) => i,
      ),
      options: { standard: quote('standard'), express: quote('express') },
      mtoNote: mto
        ? `Made to order. ${m.makerName} starts once you pay and finishes in about ${mto.leadTimeDays ?? 14} days.`
        : null,
    });
  }
  const [totals] = await sql()<
    { subtotalCents: number; shippingTotalCents: number; totalCents: number }[]
  >`
    select subtotal_cents, shipping_total_cents, total_cents from public.orders where id = ${order.id}`;
  const saved = owner.userId
    ? ((
        await sql()<
          {
            addresses: Array<CheckoutAddress & { id: string; label: string; isDefault: boolean }>;
          }[]
        >`
          select addresses from public.customer_prefs where user_id = ${owner.userId}`
      )[0]?.addresses ?? [])
    : [];
  const [names] = owner.userId
    ? await sql()<{ firstName: string | null }[]>`
        select coalesce(p.first_name, split_part(u.display_name, ' ', 1)) as first_name
        from public.users u left join public.customer_prefs p on p.user_id = u.id where u.id = ${owner.userId}`
    : [];
  const detailsDone = EMAIL.test(order.buyerEmail);
  const deliveryDone = detailsDone && !addressProblem(address) && order.checkoutStep >= 3;
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    email: order.buyerEmail,
    phone: order.buyerPhone ?? '',
    address,
    saveDetails: order.saveDetails,
    signedIn: Boolean(owner.userId),
    firstName: names?.firstName ?? null,
    savedAddresses: saved,
    parcels,
    pieces: rows.reduce((s, r) => s + r.quantity, 0),
    subtotalCents: totals!.subtotalCents,
    shippingCents: totals!.shippingTotalCents,
    totalCents: totals!.totalCents,
    gstCents: gstIncluded(totals!.totalCents),
    step: !detailsDone ? 1 : !deliveryDone ? 2 : 3,
    detailsDone,
    deliveryDone,
    hasHeld: rows.some((r) => r.heldByOther),
  };
}

async function requireOrder(owner: Owner) {
  await assertCheckoutEnabled();
  const order = await pendingOrderFor(owner);
  if (!order) throw new CartError('Your checkout has expired. Please start again from your bag.');
  return order;
}

/** Step 1: email and mobile ("for delivery updates"). */
export async function saveCheckoutDetails(owner: Owner, input: { email: string; phone: string }) {
  const order = await requireOrder(owner);
  const email = input.email.trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) throw new CartError('Enter an email for your receipt.');
  const phone = input.phone
    .replace(/[^\d+ ]/g, '')
    .trim()
    .slice(0, 20);
  if (phone && phone.replace(/\D/g, '').length < 8)
    throw new CartError('Check your mobile number.');
  await sql()`
    update public.orders set buyer_email = ${email}, buyer_phone = ${phone || null},
      checkout_step = greatest(checkout_step, 2)
    where id = ${order.id}`;
}

/** Step 2: the delivery address and each maker's speed. Prices follow the buyer's state. */
export async function saveCheckoutDelivery(
  owner: Owner,
  input: { address: Partial<CheckoutAddress>; speeds: Record<string, string> },
  now = new Date(),
  /** False while the buyer is still typing: re-price for their state without finishing the step. */
  advance = true,
) {
  const order = await requireOrder(owner);
  const address = cleanAddress(input.address);
  const problem = addressProblem(address);
  if (problem) throw new CartError(problem);
  await setSpeeds(order.id, input.speeds);
  await sql()`
    update public.orders set shipping_address = ${sql().json(toStored(address!) as never)}, buyer_name = ${address!.name},
      checkout_step = greatest(checkout_step, ${advance ? 3 : 2})
    where id = ${order.id}`;
  const cart = await getCart(owner.sessionId);
  await syncOrder(order.id, cart.lines, now);
}

/** Changing one parcel's speed (from the delivery step, or the summary). */
export async function setCheckoutSpeed(
  owner: Owner,
  makerId: string,
  speed: string,
  now = new Date(),
) {
  const order = await requireOrder(owner);
  await setSpeeds(order.id, { [makerId]: speed });
  const cart = await getCart(owner.sessionId);
  await syncOrder(order.id, cart.lines, now);
}

async function setSpeeds(orderId: string, speeds: Record<string, string>) {
  for (const [makerId, speed] of Object.entries(speeds))
    if (speed === 'standard' || speed === 'express')
      await sql()`update public.fulfilments set speed = ${speed} where order_id = ${orderId} and maker_id = ${makerId}`;
}

export async function setSaveDetails(owner: Owner, on: boolean) {
  const order = await requireOrder(owner);
  await sql()`update public.orders set save_details = ${on} where id = ${order.id}`;
}

/** The buyer's Stripe Customer (created once), so cards can be saved for next time. */
async function customerFor(userId: string): Promise<string> {
  const [u] = await sql()<
    { email: string; displayName: string | null; stripeCustomerId: string | null }[]
  >`
    select email, display_name, stripe_customer_id from public.users where id = ${userId}`;
  if (u?.stripeCustomerId) return u.stripeCustomerId;
  const c = await payments().createCustomer({ email: u!.email, name: u!.displayName, userId });
  await sql()`update public.users set stripe_customer_id = ${c.id} where id = ${userId} and stripe_customer_id is null`;
  return c.id;
}

/**
 * Pay: checks everything again, holds one-of-ones for SITE.reservationMinutes, and creates or
 * updates the order's PaymentIntent for the current total. Returns what the browser needs to
 * confirm the payment with Stripe.
 */
export async function preparePayment(
  owner: Owner,
  now = new Date(),
): Promise<{
  orderId: string;
  orderNumber: string;
  clientSecret: string;
  paymentIntentId: string;
  totalCents: number;
}> {
  const order = await requireOrder(owner);
  const cart = await getCart(owner.sessionId);
  if (!cart.lines.length) throw new CartError('Your bag is empty.');
  if (cart.hasProblems)
    throw new CartError('Some pieces in your bag are no longer available. Please review your bag.');
  await syncOrder(order.id, cart.lines, now);
  const view = await checkoutView(owner, now);
  if (!view.detailsDone) throw new CartError('Add your email first.');
  const problem = addressProblem(view.address);
  if (problem) throw new CartError(problem);

  // Hold one-of-ones: nobody else can pay for them for the next few minutes.
  const ones = view.parcels.flatMap((p) => p.items).filter((i) => i.productType === 'one_of_one');
  await sql().begin(async (tx) => {
    for (const i of ones) {
      await tx`select 1 from public.product_variants where id = ${i.variantId} for update`;
      const [other] = await tx`
        select 1 from public.reservations where variant_id = ${i.variantId} and order_id <> ${order.id} and expires_at > ${now}`;
      if (other) throw new CartError(`${i.title}: ${HELD_MESSAGE}`);
      await tx`
        insert into public.reservations (variant_id, order_id, expires_at)
        values (${i.variantId}, ${order.id}, ${new Date(now.getTime() + SITE.reservationMinutes * 60_000)})
        on conflict (variant_id, order_id) do update set expires_at = excluded.expires_at`;
    }
  });

  let customerId: string | null = order.stripeCustomerId;
  if (owner.userId) customerId = await customerFor(owner.userId);
  else if (order.saveDetails && !customerId) {
    // A guest saving their details: the card is kept on a Customer that becomes their account's.
    const c = await payments().createCustomer({
      email: view.email,
      name: view.address?.name ?? null,
      userId: `order:${order.id}`,
    });
    customerId = c.id;
  }
  const metadata = { order_id: order.id, order_number: order.orderNumber };
  const pi = order.stripePaymentIntentId
    ? await payments().updatePaymentIntent(order.stripePaymentIntentId, {
        amountCents: view.totalCents,
        email: view.email,
        customerId,
        savePaymentMethod: order.saveDetails || Boolean(owner.userId),
        metadata,
      })
    : await payments().createPaymentIntent({
        orderId: order.id,
        orderNumber: order.orderNumber,
        amountCents: view.totalCents,
        email: view.email,
        customerId,
        savePaymentMethod: order.saveDetails || Boolean(owner.userId),
        idempotencyKey: `pi:${order.id}`,
      });
  await sql()`
    update public.orders set stripe_payment_intent_id = ${pi.id}, stripe_customer_id = ${customerId},
      returns_ack_at = ${now}, returns_policy_version = ${RETURNS_POLICY_VERSION}
    where id = ${order.id}`;
  if (!pi.clientSecret) throw new CartError('Payment couldn’t start. Please try again.');
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    clientSecret: pi.clientSecret,
    paymentIntentId: pi.id,
    totalCents: view.totalCents,
  };
}

/**
 * Express checkout (Apple Pay / Google Pay): the wallet supplies the email, phone and address,
 * and every parcel goes standard. Returns the payment to confirm.
 */
export async function expressCheckout(
  owner: Owner,
  input: { email: string; phone: string; address: Partial<CheckoutAddress> },
  now = new Date(),
) {
  await saveCheckoutDetails(owner, { email: input.email, phone: input.phone ?? '' });
  const view = await checkoutView(owner, now);
  await saveCheckoutDelivery(
    owner,
    {
      address: input.address,
      speeds: Object.fromEntries(view.parcels.map((p) => [p.makerId, p.speed])),
    },
    now,
  );
  return preparePayment(owner, now);
}

/** A quote for an address before it's saved (express checkout's shipping address change). */
export async function quoteForState(owner: Owner, state: string, now = new Date()) {
  const order = await requireOrder(owner);
  const cart = await getCart(owner.sessionId);
  const makers = await makerRows(Array.from(new Set(cart.lines.map((l) => l.makerId))));
  const speeds = new Map(
    (
      await sql()<{ makerId: string; speed: Speed }[]>`
        select maker_id, speed from public.fulfilments where order_id = ${order.id}`
    ).map((r) => [r.makerId, r.speed]),
  );
  let shipping = 0;
  for (const makerId of makers.keys())
    shipping += parcelQuote(
      makers.get(makerId)!,
      cart.lines.filter((l) => l.makerId === makerId),
      state.toUpperCase(),
      speeds.get(makerId) ?? 'standard',
      now,
    ).cents;
  const subtotal = cart.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
  return { shippingCents: shipping, totalCents: subtotal + shipping };
}

/** The pending order's id for this browser (used by the mock payment pages). */
export async function pendingOrderId(owner: Owner): Promise<string | null> {
  return (await pendingOrderFor(owner))?.id ?? null;
}

export async function setItemNote(owner: Owner, orderItemId: string, note: string) {
  const order = await requireOrder(owner);
  await sql()`
    update public.order_items set note_to_maker = ${sanitizeText(note).trim().slice(0, 500) || null}
    where id = ${orderItemId} and order_id = ${order.id}`;
}
