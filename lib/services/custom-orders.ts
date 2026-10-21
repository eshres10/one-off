import { randomBytes } from 'node:crypto';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql, withUser, type Db } from '@/lib/db';
import { commissionCents } from '@/lib/domain/commission';
import { sanitizeText } from '@/lib/domain/moderation';
import { formatPrice } from '@/lib/domain/money';
import { CUSTOM } from '@/lib/custom/config';
import { SITE } from '@/lib/site/config';
import { fmtDayLong, pieceTitle, type Measurements } from '@/lib/custom/brief';
import { env } from '@/lib/env';
import { assertCheckoutEnabled } from '@/lib/features';
import { reportError } from '@/lib/log';
import { payments } from '@/lib/payments';
import { isOwnImageUrl } from '@/lib/storage';
import { RETURNS_POLICY_VERSION } from '@/lib/content/returns';
import { policySnapshot } from '@/lib/returns/policy';
import { TERMS, commissionPctAt } from '@/lib/studio/terms';
import { addressProblem, cleanAddress, type CheckoutAddress } from './checkout';
import { UserError } from './errors';
import { notifyBuyerMilestone, notifyMakerAccepted, notifyMakerNotChosen } from './custom-notify';
import { refundOrderItem } from './webhook';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

/** The making steps a custom order goes through, in order. "Sent" is the existing ship flow. */
export const MILESTONES = [
  { key: 'sketch_shared', label: 'Share a sketch', done: 'Sketch shared', optional: true },
  { key: 'fabric_bought', label: 'Mark fabric bought', done: 'Fabric bought', optional: false },
  { key: 'fitting', label: 'Fitting done', done: 'Fitting done', optional: true },
  { key: 'made', label: 'Made', done: 'Made', optional: false },
  { key: 'sent', label: 'Sent', done: 'Sent', optional: false },
] as const;
export type MilestoneKey = (typeof MILESTONES)[number]['key'];
export interface MilestoneEntry {
  at: string;
  photo?: string | null;
  note?: string | null;
}
export type Milestones = Partial<Record<MilestoneKey, MilestoneEntry>>;

const stored = (a: CheckoutAddress) => ({
  name: a.name,
  line1: a.line1,
  line2: a.line2,
  city: a.suburb,
  state: a.state,
  postal_code: a.postcode,
  country: 'AU',
});

const feeBpsFor = (foundingUntil: Date | null, now: Date) => {
  const pct = commissionPctAt(foundingUntil, now);
  return pct === TERMS.standardCommissionPct ? env().PLATFORM_FEE_BPS : Math.round(pct * 100);
};

/** "88 cm" per measurement, the shape order items keep for made-to-order pieces. */
const measurementsForOrder = (m: Measurements | null) =>
  m
    ? Object.fromEntries(
        Object.entries(m)
          .filter(([, v]) => typeof v === 'number')
          .map(([k, v]) => [k, `${v} cm`]),
      )
    : null;

async function quoteForBuyer(buyer: Actor, quoteId: string, now: Date) {
  const [q] = await withUser(
    buyer,
    (db) => db<
      {
        id: string;
        requestId: string;
        makerId: string;
        price: number;
        readyBy: string;
        status: string;
        validUntil: Date;
        fabric: string | null;
        sketchPath: string | null;
        requestStatus: string;
        kind: string;
        fabrics: string[];
        measurements: Measurements | null;
        fitMode: string | null;
        buyerId: string;
      }[]
    >`
      select q.id, q.request_id, q.maker_id, q.price, to_char(q.ready_by, 'YYYY-MM-DD') as ready_by, q.status, q.valid_until,
        q.fabric, q.sketch_path, r.status as request_status, r.kind, r.fabrics, r.measurements, r.fit_mode, r.buyer_id
      from public.custom_quotes q join public.custom_requests r on r.id = q.request_id
      where q.id = ${quoteId} and r.buyer_id = ${buyer.id}`,
  );
  if (!q) throw new UserError('We couldn’t find that quote.');
  if (q.status === 'accepted') throw new UserError('You’ve already accepted this quote.');
  if (q.status !== 'sent') throw new UserError('This quote is no longer open.');
  if (new Date(q.validUntil) < now)
    throw new UserError('This quote has expired. Ask the maker for a new one.');
  if (!['sent', 'quoted'].includes(q.requestStatus)) throw new UserError('This request is closed.');
  return q;
}

export interface CustomOrderSummary {
  orderId: string;
  orderNumber: string;
  priceCents: number;
  shippingCents: number;
  totalCents: number;
  address: CheckoutAddress;
}

/**
 * Accepting a quote: one pending order for it (the buyer's address can change until they pay),
 * with a fulfilment and an item like any other order, so Studio, payouts and claims all work.
 */
export async function createCustomOrder(
  buyer: Actor,
  quoteId: string,
  addressInput: Partial<CheckoutAddress>,
  now = new Date(),
): Promise<CustomOrderSummary> {
  await assertCheckoutEnabled();
  const q = await quoteForBuyer(buyer, quoteId, now);
  const address = cleanAddress(addressInput);
  const problem = addressProblem(address);
  if (problem) throw new UserError(problem);
  const [maker] = await sql()<
    {
      id: string;
      displayName: string;
      shippingStandardCents: number;
      foundingUntil: Date | null;
      coverUrl: string | null;
      stripeChargesEnabled: boolean;
    }[]
  >`
    select id, display_name, shipping_standard_cents, founding_until, cover_url, stripe_charges_enabled
    from public.makers where id = ${q.makerId}`;
  if (!maker) throw new UserError('This maker isn’t available.');
  const [u] = await sql()<
    { email: string }[]
  >`select email from public.users where id = ${buyer.id}`;
  const shipping = maker.shippingStandardCents;
  const total = q.price + shipping;
  const feeBps = feeBpsFor(maker.foundingUntil, now);
  const commission = commissionCents(q.price, feeBps);
  const title = pieceTitle({ kind: q.kind as never, fabrics: q.fabrics });
  const readyBy = new Date(`${q.readyBy}T00:00:00Z`);
  const day = 86_400_000;

  const orderId = await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const [existing] = await db<{ id: string }[]>`
      select id from public.orders where custom_quote_id = ${q.id} and status = 'pending' for update`;
    if (existing) {
      await db`
        update public.orders set shipping_address = ${db.json(stored(address!) as never)}, buyer_name = ${address!.name},
          subtotal_cents = ${q.price}, shipping_total_cents = ${shipping}, total_cents = ${total}
        where id = ${existing.id}`;
      return existing.id;
    }
    const [paid] = await db<{ id: string }[]>`
      select id from public.orders where custom_quote_id = ${q.id} and status <> 'pending' and status <> 'cancelled' limit 1`;
    if (paid) throw new UserError('This quote has already been paid for.');
    const [o] = await db<{ id: string }[]>`
      insert into public.orders (order_number, buyer_user_id, buyer_email, buyer_name, shipping_address, status,
        subtotal_cents, shipping_total_cents, total_cents, platform_fee_total_cents, order_type, custom_quote_id, save_details)
      values (public.next_order_number(), ${buyer.id}, ${u?.email ?? ''}, ${address!.name},
        ${db.json(stored(address!) as never)}, 'pending', ${q.price}, ${shipping}, ${total}, ${commission}, 'custom', ${q.id}, false)
      returning id`;
    await db`update public.orders set transfer_group = id::text where id = ${o!.id}`;
    const [f] = await db<{ id: string }[]>`
      insert into public.fulfilments (order_id, maker_id, status, subtotal_cents, shipping_cents, shipping_list_cents,
        buyer_shipping_cents, shipping_subsidy_cents, shipping_subsidy_status, platform_commission_cents, seller_net_cents,
        estimated_dispatch_date, estimated_delivery_from, estimated_delivery_to, commission_pct_applied, shipping_method,
        speed, reply_token)
      values (${o!.id}, ${maker.id}, 'paid', ${q.price}, ${shipping}, ${shipping}, ${shipping}, 0, 'none', ${commission},
        ${q.price - commission + shipping}, ${q.readyBy}, ${new Date(readyBy.getTime() + 2 * day).toISOString().slice(0, 10)},
        ${new Date(readyBy.getTime() + 6 * day).toISOString().slice(0, 10)}, ${feeBps / 100}, 'Standard tracked', 'standard',
        ${randomBytes(12).toString('base64url')})
      returning id`;
    await db`
      insert into public.order_items (order_id, fulfilment_id, product_id, variant_id, maker_id, product_title, variant_label,
        product_type, image_url, quantity, unit_price_cents, line_total_cents, platform_commission_cents, seller_net_cents,
        custom_measurements, custom_quote_id, return_policy)
      values (${o!.id}, ${f!.id}, null, null, ${maker.id}, ${title}, ${q.fitMode === 'fitting' ? 'Fitted in person' : 'Made to your measurements'},
        'made_to_order', ${q.sketchPath ?? maker.coverUrl}, 1, ${q.price}, ${q.price}, ${commission}, ${q.price - commission},
        ${measurementsForOrder(q.measurements) ? db.json(measurementsForOrder(q.measurements) as never) : null}, ${q.id},
        ${db.json(policySnapshot('made_to_order') as never)})`;
    await audit(
      'custom_order.opened',
      { type: 'order', id: o!.id },
      { quoteId: q.id },
      buyer.id,
      db,
    );
    return o!.id;
  });
  const [o] = await sql()<
    { orderNumber: string }[]
  >`select order_number from public.orders where id = ${orderId}`;
  return {
    orderId,
    orderNumber: o!.orderNumber,
    priceCents: q.price,
    shippingCents: shipping,
    totalCents: total,
    address: address!,
  };
}

/** The buyer's default saved address, to prefill "Accept and pay". */
export async function defaultAddress(buyer: Actor): Promise<CheckoutAddress | null> {
  const [row] = await sql()<{ address: Partial<CheckoutAddress> | null }[]>`
    select coalesce(
      (select a from public.customer_prefs p, jsonb_array_elements(p.addresses) a where p.user_id = ${buyer.id}
        order by (a->>'isDefault')::boolean desc nulls last limit 1),
      (select o.shipping_address from public.orders o where o.buyer_user_id = ${buyer.id} and o.shipping_address is not null
        and o.status <> 'pending' order by o.created_at desc limit 1)) as address`;
  return cleanAddress(row?.address);
}

/**
 * The PaymentIntent for the custom order: the whole quote plus shipping, held by Off One. Same
 * webhook as checkout: the order is paid only when payment_intent.succeeded arrives.
 */
export async function prepareCustomPayment(
  buyer: Actor,
  quoteId: string,
  address: Partial<CheckoutAddress>,
  now = new Date(),
) {
  const o = await createCustomOrder(buyer, quoteId, address, now);
  const [row] = await sql()<
    { stripePaymentIntentId: string | null; buyerEmail: string; stripeCustomerId: string | null }[]
  >`
    select o.stripe_payment_intent_id, o.buyer_email, u.stripe_customer_id
    from public.orders o join public.users u on u.id = o.buyer_user_id where o.id = ${o.orderId}`;
  let customerId = row?.stripeCustomerId ?? null;
  if (!customerId) {
    const [u] = await sql()<{ email: string; displayName: string | null }[]>`
      select email, display_name from public.users where id = ${buyer.id}`;
    const c = await payments().createCustomer({
      email: u!.email,
      name: u!.displayName,
      userId: buyer.id,
    });
    customerId = c.id;
    await sql()`update public.users set stripe_customer_id = ${c.id} where id = ${buyer.id} and stripe_customer_id is null`;
  }
  const metadata = { order_id: o.orderId, order_number: o.orderNumber, kind: 'custom' };
  const pi = row?.stripePaymentIntentId
    ? await payments().updatePaymentIntent(row.stripePaymentIntentId, {
        amountCents: o.totalCents,
        email: row.buyerEmail,
        customerId,
        savePaymentMethod: true,
        metadata,
      })
    : await payments().createPaymentIntent({
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        amountCents: o.totalCents,
        email: row?.buyerEmail ?? null,
        customerId,
        savePaymentMethod: true,
        idempotencyKey: `pi:${o.orderId}`,
      });
  await sql()`
    update public.orders set stripe_payment_intent_id = ${pi.id}, stripe_customer_id = ${customerId},
      returns_ack_at = ${now}, returns_policy_version = ${RETURNS_POLICY_VERSION}
    where id = ${o.orderId}`;
  if (!pi.clientSecret) throw new UserError('Payment couldn’t start. Please try again.');
  return { ...o, clientSecret: pi.clientSecret, paymentIntentId: pi.id };
}

/**
 * After the payment lands: the request is accepted, the chosen maker is told, the others hear
 * they weren't picked this time and their quotes are withdrawn.
 */
export async function onCustomOrderPaid(orderId: string) {
  const changed = await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const [o] = await db<{ quoteId: string; requestId: string; makerId: string }[]>`
      select o.custom_quote_id as quote_id, q.request_id, q.maker_id
      from public.orders o join public.custom_quotes q on q.id = o.custom_quote_id
      where o.id = ${orderId} and o.order_type = 'custom' for update of o`;
    if (!o) return null;
    const [r] = await db<{ status: string }[]>`
      update public.custom_requests set status = 'accepted' where id = ${o.requestId} and status <> 'accepted' returning status`;
    if (!r) return null; // already processed
    await db`update public.custom_quotes set status = 'accepted' where id = ${o.quoteId}`;
    const others = await db<{ makerId: string }[]>`
      update public.custom_quotes set status = 'withdrawn' where request_id = ${o.requestId} and id <> ${o.quoteId} and status = 'sent'
      returning maker_id`;
    await db`
      update public.custom_request_recipients set status = 'chosen' where request_id = ${o.requestId} and maker_id = ${o.makerId}`;
    const notChosen = await db<{ makerId: string }[]>`
      update public.custom_request_recipients set status = 'not_chosen'
      where request_id = ${o.requestId} and maker_id <> ${o.makerId} and status in ('pending', 'quoted')
      returning maker_id`;
    await audit(
      'custom_request.accepted',
      { type: 'custom_request', id: o.requestId },
      { orderId },
      null,
      db,
    );
    return { ...o, tell: Array.from(new Set([...others, ...notChosen].map((x) => x.makerId))) };
  });
  if (!changed) return;
  await notifyMakerAccepted(orderId).catch((err) =>
    reportError(err, { orderId, where: 'custom accepted' }),
  );
  for (const makerId of changed.tell)
    await notifyMakerNotChosen(changed.requestId, makerId).catch((err) =>
      reportError(err, { makerId, where: 'custom not chosen' }),
    );
}

async function lockCustomOrder(db: Db, seller: Actor, orderId: string) {
  const [o] = await db<
    {
      id: string;
      status: string;
      milestones: Milestones;
      fulfilmentId: string;
      fulfilmentStatus: string;
      makerId: string;
    }[]
  >`
    select o.id, o.status, o.milestones, f.id as fulfilment_id, f.status::text as fulfilment_status, f.maker_id
    from public.orders o join public.fulfilments f on f.order_id = o.id
    where o.id = ${orderId} and o.order_type = 'custom' and f.maker_id = ${seller.makerId!} for update of o`;
  if (!o) throw new UserError('Order not found.');
  if (!['paid', 'partially_refunded'].includes(o.status))
    throw new UserError('This order has been refunded or cancelled.');
  return o;
}

/**
 * The maker marks a step, with an optional photo and note. The buyer hears about each one.
 * "Fabric bought" also pays the maker their advance.
 */
export async function setMilestone(
  seller: Actor,
  orderId: string,
  key: MilestoneKey,
  input: { note?: string; photo?: string | null } = {},
  now = new Date(),
) {
  if (!MILESTONES.some((m) => m.key === key)) throw new UserError('Choose a step.');
  if (key === 'sent')
    throw new UserError('Mark it sent from the ship form, with the tracking number.');
  const note =
    sanitizeText(input.note ?? '')
      .trim()
      .slice(0, 500) || null;
  const photo = input.photo && isOwnImageUrl(input.photo) ? input.photo : null;
  const entry: MilestoneEntry = { at: now.toISOString(), note, photo };
  const result = await sql().begin(async (tx) => {
    const db = tx as unknown as Db;
    const o = await lockCustomOrder(db, seller, orderId);
    if (['shipped', 'delivered', 'completed'].includes(o.fulfilmentStatus))
      throw new UserError('This piece has already been sent.');
    const already = Boolean(o.milestones[key]);
    const milestones: Milestones = { ...o.milestones, [key]: { ...o.milestones[key], ...entry } };
    const status = milestones.made
      ? 'ready'
      : milestones.fabric_bought || milestones.sketch_shared
        ? 'making'
        : 'paid';
    const step = milestones.made ? 4 : milestones.fabric_bought ? 1 : 0;
    await db`update public.orders set milestones = ${db.json(milestones as never)} where id = ${o.id}`;
    await db`
      update public.fulfilments set status = ${status}::fulfilment_status, mto_step = greatest(mto_step, ${step})
      where id = ${o.fulfilmentId} and status in ('paid', 'making', 'ready', 'preparing')`;
    await db`
      update public.order_items set fulfilment_status = ${step === 0 ? 'paid' : 'preparing'}::fulfilment_status
      where fulfilment_id = ${o.fulfilmentId} and fulfilment_status in ('paid', 'preparing')`;
    await audit(
      'custom_order.milestone',
      { type: 'order', id: o.id },
      { key, already },
      seller.id,
      db,
    );
    return { already, milestones };
  });
  if (key === 'fabric_bought')
    await payFabricAdvance(orderId, now).catch((err) =>
      reportError(err, { orderId, where: 'fabric advance' }),
    );
  if (!result.already)
    await notifyBuyerMilestone(orderId, MILESTONES.find((m) => m.key === key)!.done, note).catch(
      (err) => reportError(err, { orderId, where: 'milestone notify' }),
    );
  return result.milestones;
}

/**
 * The fabric advance: CUSTOM.advancePct of the piece price, less the maker's commission on that
 * part, transferred from the buyer's charge. Exactly once per order (idempotent on the order id,
 * so a double-click or retry can't pay twice); the rest comes off their final payout.
 */
export async function payFabricAdvance(orderId: string, now = new Date()) {
  const [o] = await sql()<
    {
      id: string;
      status: string;
      advanceCents: number | null;
      chargeId: string | null;
      makerId: string;
      fulfilmentId: string;
      stripeAccountId: string | null;
      chargesEnabled: boolean;
      price: number;
      feeBps: number;
      fabricBought: boolean;
    }[]
  >`
    select o.id, o.status, o.fabric_advance_cents as advance_cents, o.stripe_charge_id as charge_id, f.maker_id, f.id as fulfilment_id,
      m.stripe_account_id, m.stripe_charges_enabled as charges_enabled, f.subtotal_cents as price,
      round(coalesce(f.commission_pct_applied, ${TERMS.standardCommissionPct}) * 100)::int as fee_bps,
      (o.milestones ? 'fabric_bought') as fabric_bought
    from public.orders o join public.fulfilments f on f.order_id = o.id join public.makers m on m.id = f.maker_id
    where o.id = ${orderId} and o.order_type = 'custom'`;
  if (!o || !o.fabricBought) return null;
  if (o.advanceCents != null) return { amount: o.advanceCents, created: false };
  if (!['paid', 'partially_refunded'].includes(o.status)) return null;
  if (!o.stripeAccountId || !o.chargesEnabled) {
    await audit(
      'custom_order.advance_waiting',
      { type: 'order', id: orderId },
      { reason: 'no connected account' },
    );
    return null;
  }
  const gross = Math.round((o.price * CUSTOM.advancePct) / 100);
  const amount = gross - commissionCents(gross, o.feeBps);
  const t = await payments().createTransfer({
    amountCents: amount,
    destination: o.stripeAccountId,
    transferGroup: orderId,
    sourceTransaction: o.chargeId,
    metadata: {
      order_id: orderId,
      fulfilment_id: o.fulfilmentId,
      maker_id: o.makerId,
      kind: 'custom_fabric_advance',
    },
    idempotencyKey: `advance:${orderId}`,
  });
  await sql()`
    update public.orders set fabric_advance_cents = ${amount}, fabric_advance_transfer_id = ${t.id}
    where id = ${orderId} and fabric_advance_cents is null`;
  await audit(
    'transfer.custom_advance',
    { type: 'order', id: orderId },
    { amount, transferId: t.id, at: now.toISOString() },
  );
  return { amount, created: true };
}

/**
 * The same advance on a standard made-to-order order, when SITE.payouts.advanceOnMadeToOrder is
 * on: 30% of the maker's part, once per order, at "Fabric bought".
 */
export async function payMtoAdvance(orderId: string, fulfilmentId: string, now = new Date()) {
  if (!SITE.payouts.advanceOnMadeToOrder) return null;
  const [o] = await sql()<
    {
      status: string;
      advanceCents: number | null;
      chargeId: string | null;
      makerId: string;
      stripeAccountId: string | null;
      chargesEnabled: boolean;
      price: number;
      feeBps: number;
    }[]
  >`
    select o.status, o.fabric_advance_cents as advance_cents, o.stripe_charge_id as charge_id, f.maker_id,
      m.stripe_account_id, m.stripe_charges_enabled as charges_enabled, f.subtotal_cents as price,
      round(coalesce(f.commission_pct_applied, ${TERMS.standardCommissionPct}) * 100)::int as fee_bps
    from public.orders o join public.fulfilments f on f.order_id = o.id join public.makers m on m.id = f.maker_id
    where o.id = ${orderId} and f.id = ${fulfilmentId} and o.order_type = 'standard'`;
  if (!o) return null;
  if (o.advanceCents != null) return { amount: o.advanceCents, created: false };
  if (!['paid', 'partially_refunded'].includes(o.status)) return null;
  if (!o.stripeAccountId || !o.chargesEnabled) return null;
  const gross = Math.round((o.price * CUSTOM.advancePct) / 100);
  const amount = gross - commissionCents(gross, o.feeBps);
  const t = await payments().createTransfer({
    amountCents: amount,
    destination: o.stripeAccountId,
    transferGroup: orderId,
    sourceTransaction: o.chargeId,
    metadata: {
      order_id: orderId,
      fulfilment_id: fulfilmentId,
      maker_id: o.makerId,
      kind: 'mto_fabric_advance',
    },
    idempotencyKey: `advance:${orderId}`,
  });
  await sql()`
    update public.orders set fabric_advance_cents = ${amount}, fabric_advance_transfer_id = ${t.id}
    where id = ${orderId} and fabric_advance_cents is null`;
  await audit(
    'transfer.mto_advance',
    { type: 'order', id: orderId },
    { amount, transferId: t.id, at: now.toISOString() },
  );
  return { amount, created: true };
}

/** The buyer's "How your money is held" line for an order summary. */
export const heldExplainer = (maker: string) =>
  `Off One holds your payment. ${maker} gets ${CUSTOM.advancePct}% when they buy your fabric, and the rest ${TERMS.releaseDaysAfterDelivery} days after it arrives.`;

/**
 * [DECIDE] A maker cancels after the advance (CUSTOM.cancelAfterAdvance): the buyer gets a full
 * refund, and the advance comes off the maker's later payouts unless an admin waives it.
 */
export async function cancelCustomOrder(
  actor: Actor,
  orderId: string,
  reason: string,
): Promise<{ refundedCents: number; advanceRecovered: number }> {
  const [o] = await sql()<
    {
      id: string;
      status: string;
      makerId: string;
      makerUserId: string;
      advanceCents: number | null;
      fulfilmentId: string;
      fulfilmentStatus: string;
      itemId: string;
      shippingCents: number;
      paymentIntentId: string | null;
      refundedCents: number;
      totalCents: number;
    }[]
  >`
    select o.id, o.status, f.maker_id, m.user_id as maker_user_id, o.fabric_advance_cents as advance_cents, f.id as fulfilment_id,
      f.status::text as fulfilment_status, oi.id as item_id, f.shipping_cents, o.stripe_payment_intent_id as payment_intent_id,
      o.refunded_cents, o.total_cents
    from public.orders o join public.fulfilments f on f.order_id = o.id join public.makers m on m.id = f.maker_id
    join public.order_items oi on oi.fulfilment_id = f.id
    where o.id = ${orderId} and o.order_type = 'custom'`;
  if (!o) throw new UserError('Order not found.');
  if (actor.role !== 'admin' && actor.makerId !== o.makerId)
    throw new UserError('Order not found.');
  if (!['paid', 'partially_refunded'].includes(o.status))
    throw new UserError('This order is already closed.');
  if (['shipped', 'delivered', 'completed'].includes(o.fulfilmentStatus))
    throw new UserError('This piece has been sent. Use Report a problem instead.');
  const why = sanitizeText(reason).trim().slice(0, 500) || 'Cancelled by the maker';
  const item = await refundOrderItem({
    orderItemId: o.itemId,
    reason: `custom_cancelled: ${why}`,
    actorUserId: actor.id,
  });
  let shippingRefund = 0;
  const left = o.totalCents - o.refundedCents - item.amountCents;
  if (left > 0 && o.paymentIntentId) {
    const r = await payments().createRefund({
      paymentIntentId: o.paymentIntentId,
      amountCents: left,
      metadata: { order_id: orderId, reason: 'custom_cancelled_shipping' },
      idempotencyKey: `refund:${orderId}:shipping`,
    });
    shippingRefund = left;
    await sql()`
      insert into public.refunds (order_id, order_item_id, amount_cents, reason, stripe_refund_id, status, created_by)
      values (${orderId}, ${o.itemId}, ${left}, 'custom_cancelled_shipping', ${r.id}, ${r.status}, ${actor.id})
      on conflict (stripe_refund_id) do nothing`;
    await sql()`
      update public.orders set refunded_cents = refunded_cents + ${left},
        status = case when refunded_cents + ${left} >= total_cents then 'refunded'::order_status else status end
      where id = ${orderId}`;
  }
  let advanceRecovered = 0;
  if (o.advanceCents && CUSTOM.cancelAfterAdvance === 'recover_from_payouts') {
    await sql()`
      insert into public.maker_adjustments (maker_id, amount_cents, reason, fulfilment_id)
      values (${o.makerId}, ${o.advanceCents}, ${`Custom · fabric advance recovered (order cancelled: ${why})`}, ${o.fulfilmentId})`;
    advanceRecovered = o.advanceCents;
  }
  await sql()`update public.fulfilments set status = 'refunded', payout_status = 'reversed' where id = ${o.fulfilmentId}`;
  await audit(
    'custom_order.cancelled',
    { type: 'order', id: orderId },
    { reason: why, refunded: item.amountCents + shippingRefund, advanceRecovered },
    actor.id,
  );
  return { refundedCents: item.amountCents + shippingRefund, advanceRecovered };
}

/** Admin: the fabric went to the buyer, so the maker keeps the advance. */
export async function waiveAdvanceRecovery(admin: Actor, orderId: string) {
  if (admin.role !== 'admin') throw new UserError('Admins only.');
  const rows = await sql()<{ id: string }[]>`
    update public.maker_adjustments a set applied_at = now(), reason = a.reason || ' · waived'
    from public.fulfilments f
    where a.fulfilment_id = f.id and f.order_id = ${orderId} and a.applied_at is null and a.reason like 'Custom · fabric advance%'
    returning a.id`;
  await audit(
    'custom_order.advance_waived',
    { type: 'order', id: orderId },
    { adjustments: rows.length },
    admin.id,
  );
  return rows.length;
}

export interface CustomOrderFacts {
  milestones: Milestones;
  advanceCents: number | null;
  quote: {
    price: number;
    readyBy: string;
    readyByLabel: string;
    fittings: string;
    fabric: string | null;
    note: string;
    sketchPath: string | null;
  };
  request: { number: string; words: string | null; inspiration: string[] };
  makerName: string;
}

/** What both the buyer's and the maker's order pages show for a custom order. */
export async function customOrderFacts(orderId: string): Promise<CustomOrderFacts | null> {
  const [o] = await sql()<
    (Omit<CustomOrderFacts, 'quote' | 'request'> & {
      price: number;
      readyBy: string;
      fittings: string;
      fabric: string | null;
      note: string;
      sketchPath: string | null;
      number: string;
      words: string | null;
      inspiration: string[];
    })[]
  >`
    select o.milestones, o.fabric_advance_cents as advance_cents, q.price, to_char(q.ready_by, 'YYYY-MM-DD') as ready_by,
      q.fittings, q.fabric, q.note, q.sketch_path, r.number, r.words, r.inspiration, m.display_name as maker_name
    from public.orders o join public.custom_quotes q on q.id = o.custom_quote_id
    join public.custom_requests r on r.id = q.request_id join public.makers m on m.id = q.maker_id
    where o.id = ${orderId} and o.order_type = 'custom'`;
  if (!o) return null;
  return {
    milestones: o.milestones,
    advanceCents: o.advanceCents,
    makerName: o.makerName,
    quote: {
      price: o.price,
      readyBy: o.readyBy,
      readyByLabel: fmtDayLong(o.readyBy),
      fittings: o.fittings,
      fabric: o.fabric,
      note: o.note,
      sketchPath: o.sketchPath,
    },
    request: { number: o.number, words: o.words, inspiration: o.inspiration },
  };
}

/** "A$168 advance paid · A$392 after delivery" for the maker's payout line. */
export function advanceLine(
  priceCents: number,
  sellerNetCents: number,
  advanceCents: number | null,
) {
  const gross = Math.round((priceCents * CUSTOM.advancePct) / 100);
  return advanceCents != null
    ? `${formatPrice(advanceCents)} advance paid · ${formatPrice(Math.max(0, sellerNetCents - advanceCents))} after delivery`
    : `${CUSTOM.advancePct}% (${formatPrice(gross)} less commission) when you mark the fabric bought · the rest ${TERMS.releaseDaysAfterDelivery} days after delivery`;
}
