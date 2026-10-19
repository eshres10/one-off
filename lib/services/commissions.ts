import { audit } from '@/lib/audit';
import { sql, withUser } from '@/lib/db';
import { formatPrice } from '@/lib/domain/money';
import { sanitizeText } from '@/lib/domain/moderation';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { rateLimit } from '@/lib/rate-limit';
import type { SessionUser } from '@/lib/auth/session';
import { UserError } from './errors';

type Actor = Pick<SessionUser, 'id' | 'role' | 'email' | 'makerId' | 'displayName'>;

export interface CommissionInput {
  makerId?: string;
  sourceProductId?: string;
  garmentType: string;
  occasion?: string;
  budgetMin: number;
  budgetMax: number;
  deadline?: string;
  measurements?: string;
  fabricPreferences?: string;
  colourPreferences?: string;
  notes?: string;
  inspirationImageUrls: string[];
}

const clean = (v?: string) => (v ? sanitizeText(v) : null);

/** Concierge pilot: creates a structured custom-commission request and notifies the maker. */
export async function createCommissionRequest(
  buyer: Actor,
  input: CommissionInput,
): Promise<string> {
  await rateLimit('commission', buyer.id);
  let makerId = input.makerId ?? null;
  if (!makerId && input.sourceProductId) {
    const [p] = await sql()<
      { makerId: string }[]
    >`select maker_id from public.products where id = ${input.sourceProductId}`;
    makerId = p?.makerId ?? null;
  }
  let maker:
    | { id: string; email: string; customCommissionsEnabled: boolean; userId: string }
    | undefined;
  if (makerId) {
    [maker] = await sql()<
      { id: string; email: string; customCommissionsEnabled: boolean; userId: string }[]
    >`
      select m.id, u.email, m.custom_commissions_enabled, m.user_id
      from public.makers m join public.users u on u.id = m.user_id where m.id = ${makerId} and m.status = 'approved'`;
    if (!maker) throw new UserError('This maker isn’t available.');
    if (maker.userId === buyer.id)
      throw new UserError('You can’t request a commission from yourself.');
    // Without commissions enabled, the request goes to the concierge team to match a maker.
    if (!maker.customCommissionsEnabled) maker = undefined;
  }

  const id = await withUser(buyer, async (db) => {
    const [row] = await db<{ id: string }[]>`
      insert into public.commission_requests (buyer_user_id, maker_id, source_product_id, garment_type, occasion,
        inspiration_image_urls, budget_min_cents, budget_max_cents, deadline_date, measurements, fabric_preferences,
        colour_preferences, notes)
      values (${buyer.id}, ${maker?.id ?? null}, ${input.sourceProductId ?? null}, ${sanitizeText(input.garmentType)},
        ${clean(input.occasion)}, ${input.inspirationImageUrls}, ${input.budgetMin}, ${input.budgetMax}, ${input.deadline ?? null},
        ${clean(input.measurements)}, ${clean(input.fabricPreferences)}, ${clean(input.colourPreferences)}, ${clean(input.notes)})
      returning id`;
    return row!.id;
  });

  const budget = `${formatPrice(input.budgetMin)}–${formatPrice(input.budgetMax)}`;
  if (maker)
    await sendEmail(emails.commissionRequestMaker(maker.email, id, input.garmentType, budget));
  await sendEmail(
    emails.commissionRequestAdmin(
      env().ADMIN_NOTIFICATION_EMAIL,
      id,
      input.garmentType,
      Boolean(maker),
    ),
  );
  // The request becomes a conversation with the maker (or once the concierge team assigns one).
  const { ensureCommissionThread } = await import('./messaging');
  await ensureCommissionThread(id);
  await audit(
    'commission.requested',
    { type: 'commission_request', id },
    { makerId: maker?.id ?? null },
    buyer.id,
  );
  return id;
}

async function buyerEmailFor(requestId: string) {
  const [row] = await sql()<{ email: string; makerName: string | null }[]>`
    select u.email, m.display_name as maker_name from public.commission_requests c
    join public.users u on u.id = c.buyer_user_id left join public.makers m on m.id = c.maker_id where c.id = ${requestId}`;
  return row;
}

/** Maker accepts (moves to reviewing) or declines a request assigned to them. */
export async function respondToCommission(
  maker: Actor,
  requestId: string,
  action: 'accept' | 'decline',
) {
  const status = action === 'accept' ? 'reviewing' : 'declined';
  const updated = await withUser(
    maker,
    (db) => db`
    update public.commission_requests set status = ${status}::commission_status
    where id = ${requestId} and maker_id = ${maker.makerId ?? null} and status in ('submitted', 'reviewing')
    returning id`,
  );
  if (updated.length === 0) throw new UserError('This request can’t be updated.');
  const b = await buyerEmailFor(requestId);
  if (b)
    await sendEmail(
      emails.commissionStatusBuyer(
        b.email,
        requestId,
        b.makerName ?? 'The maker',
        action === 'accept' ? 'being reviewed by the maker' : 'declined',
      ),
    );
  await audit(`commission.${action}`, { type: 'commission_request', id: requestId }, {}, maker.id);
}

export interface QuoteInput {
  requestId: string;
  totalPrice: number;
  deposit: number;
  productionDays: number;
  revisionsIncluded: number;
  shipping: number;
  estimatedDeliveryDate: string;
  message?: string;
}

export async function createQuote(maker: Actor, input: QuoteInput): Promise<string> {
  const quoteId = await withUser(maker, async (db) => {
    const [req] = await db<{ id: string; status: string }[]>`
      select id, status from public.commission_requests where id = ${input.requestId} and maker_id = ${maker.makerId ?? null} for update`;
    if (!req) throw new UserError('Request not found.');
    if (!['submitted', 'reviewing', 'quoted'].includes(req.status))
      throw new UserError('This request is closed.');
    await db`update public.commission_quotes set status = 'declined' where commission_request_id = ${req.id} and status = 'pending'`;
    const [q] = await db<{ id: string }[]>`
      insert into public.commission_quotes (commission_request_id, maker_id, total_price_cents, deposit_cents, production_days,
        revisions_included, shipping_cents, estimated_delivery_date, message)
      values (${req.id}, ${maker.makerId!}, ${input.totalPrice}, ${input.deposit}, ${input.productionDays}, ${input.revisionsIncluded},
        ${input.shipping}, ${input.estimatedDeliveryDate}, ${clean(input.message)})
      returning id`;
    await db`update public.commission_requests set status = 'quoted' where id = ${req.id}`;
    return q!.id;
  });
  const b = await buyerEmailFor(input.requestId);
  if (b)
    await sendEmail(
      emails.commissionQuoteBuyer(
        b.email,
        input.requestId,
        b.makerName ?? 'Your maker',
        input.totalPrice,
        input.deposit,
      ),
    );
  await audit(
    'commission.quoted',
    { type: 'commission_request', id: input.requestId },
    { total: input.totalPrice },
    maker.id,
  );
  return quoteId;
}

/** Buyer accepts or declines the latest quote. Acceptance hands off to the concierge team. */
export async function decideQuote(
  buyer: Actor,
  requestId: string,
  decision: 'accepted' | 'declined',
) {
  await withUser(buyer, async (db) => {
    const [q] = await db<{ id: string }[]>`
      select q.id from public.commission_quotes q join public.commission_requests c on c.id = q.commission_request_id
      where c.id = ${requestId} and c.buyer_user_id = ${buyer.id} and q.status = 'pending'
      order by q.created_at desc limit 1`;
    if (!q) throw new UserError('There’s no open quote to respond to.');
    await db`update public.commission_quotes set status = ${decision}::quote_status where id = ${q.id}`;
    await db`update public.commission_requests set status = ${decision === 'accepted' ? 'accepted' : 'reviewing'}::commission_status
             where id = ${requestId}`;
    if (decision === 'accepted') {
      // Snapshot what was agreed; a database trigger stops it being edited afterwards.
      await db`
        update public.commission_requests c set agreed_at = now(), agreed_spec = jsonb_build_object(
          'garmentType', c.garment_type, 'occasion', c.occasion, 'measurements', c.measurements,
          'fabricPreferences', c.fabric_preferences, 'colourPreferences', c.colour_preferences,
          'notes', c.notes, 'deadlineDate', c.deadline_date,
          'quote', jsonb_build_object(
            'totalPriceCents', q.total_price_cents, 'depositCents', q.deposit_cents,
            'productionDays', q.production_days, 'revisionsIncluded', q.revisions_included,
            'shippingCents', q.shipping_cents, 'estimatedDeliveryDate', q.estimated_delivery_date,
            'message', q.message))
        from public.commission_quotes q
        where c.id = ${requestId} and q.id = ${q.id} and c.agreed_spec is null`;
    }
  });
  if (decision === 'accepted') {
    await sendEmail({
      to: env().ADMIN_NOTIFICATION_EMAIL,
      template: 'commission_quote_accepted',
      subject: 'Commission quote accepted',
      text: `A buyer accepted a commission quote and is paying the deposit through checkout.\n\n${env().APP_URL}/admin/commissions`,
      related: { type: 'commission_request', id: requestId },
    });
  }
  await audit(
    `commission.quote_${decision}`,
    { type: 'commission_request', id: requestId },
    {},
    buyer.id,
  );
}

/**
 * "Accept quote & pay deposit": accepts the open quote (snapshotting the agreed spec) and starts a
 * Checkout session for the deposit. The card is kept so the balance can be charged later.
 */
export async function startDepositCheckout(buyer: Actor, requestId: string): Promise<string> {
  const { assertCheckoutEnabled } = await import('@/lib/features');
  await assertCheckoutEnabled();
  const [open] = await withUser(
    buyer,
    (db) => db<{ id: string }[]>`
      select q.id from public.commission_quotes q join public.commission_requests c on c.id = q.commission_request_id
      where c.id = ${requestId} and c.buyer_user_id = ${buyer.id} and q.status = 'pending' limit 1`,
  );
  if (open) await decideQuote(buyer, requestId, 'accepted');

  const [q] = await withUser(
    buyer,
    (db) => db<
      {
        quoteId: string;
        depositCents: number;
        totalPriceCents: number;
        garmentType: string;
        makerName: string | null;
        depositPaidAt: Date | null;
      }[]
    >`
      select q.id as quote_id, q.deposit_cents, q.total_price_cents, c.garment_type, c.deposit_paid_at,
             (select display_name from public.makers m where m.id = c.maker_id) as maker_name
      from public.commission_requests c join public.commission_quotes q on q.commission_request_id = c.id
      where c.id = ${requestId} and c.buyer_user_id = ${buyer.id} and q.status = 'accepted'
      order by q.created_at desc limit 1`,
  );
  if (!q) throw new UserError('There’s no accepted quote to pay for.');
  if (q.depositPaidAt) throw new UserError('The deposit for this piece is already paid.');
  if (q.depositCents <= 0) throw new UserError('This quote doesn’t need a deposit.');

  const { payments } = await import('@/lib/payments');
  const [thread] = await sql()<
    { id: string }[]
  >`select id from public.message_threads where commission_request_id = ${requestId}`;
  const back = thread ? `/messages/${thread.id}` : `/account/commissions/${requestId}`;
  const session = await payments().createDepositSession({
    requestId,
    quoteId: q.quoteId,
    amountCents: q.depositCents,
    title: `Deposit: custom ${q.garmentType}`,
    description: `${q.makerName ?? 'Your maker'} · balance of ${formatPrice(q.totalPriceCents - q.depositCents)} due when it’s made`,
    customerEmail: buyer.email,
    successUrl: `${env().APP_URL}${back}?deposit=paid`,
    cancelUrl: `${env().APP_URL}${back}`,
  });
  await sql()`update public.commission_requests set stripe_deposit_session_id = ${session.id} where id = ${requestId}`;
  await audit(
    'commission.deposit_checkout',
    { type: 'commission_request', id: requestId },
    {},
    buyer.id,
  );
  return session.url;
}

/** Webhook: the deposit Checkout session was paid. Idempotent. */
export async function onDepositPaid(session: {
  id: string;
  amountTotal: number;
  paymentIntentId: string | null;
  metadata: Record<string, string>;
}) {
  const requestId = session.metadata.commission_request_id;
  if (!requestId) throw new Error(`Deposit session ${session.id} has no commission_request_id`);
  const [req] = await sql()<{ id: string; makerId: string | null; buyerUserId: string }[]>`
    update public.commission_requests set deposit_paid_at = now(), deposit_cents = ${session.amountTotal},
      stripe_deposit_payment_intent_id = ${session.paymentIntentId}
    where id = ${requestId} and deposit_paid_at is null
    returning id, maker_id, buyer_user_id`;
  if (!req) return; // already recorded
  const [thread] = await sql()<
    { id: string }[]
  >`select id from public.message_threads where commission_request_id = ${requestId}`;
  if (thread) {
    await sql()`
      insert into public.messages (thread_id, sender_user_id, body, kind)
      values (${thread.id}, ${req.buyerUserId}, ${`Deposit of ${formatPrice(session.amountTotal)} paid. The maker can start making.`}, 'system')`;
    await sql()`update public.message_threads set last_message_at = now(), maker_unread = maker_unread + 1 where id = ${thread.id}`;
  }
  if (req.makerId) {
    const [m] = await sql()<
      { email: string }[]
    >`select u.email from public.makers m join public.users u on u.id = m.user_id where m.id = ${req.makerId}`;
    if (m)
      await sendEmail({
        to: m.email,
        template: 'commission_deposit_paid',
        subject: 'Deposit paid — you can start making',
        text: `The buyer paid the ${formatPrice(session.amountTotal)} deposit for their custom piece.\n\n${env().APP_URL}/seller/messages${thread ? `/${thread.id}` : ''}`,
        related: { type: 'commission_request', id: requestId },
      });
  }
  await audit(
    'commission.deposit_paid',
    { type: 'commission_request', id: requestId },
    { amount: session.amountTotal },
  );
}
