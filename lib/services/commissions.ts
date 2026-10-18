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

export async function createQuote(maker: Actor, input: QuoteInput) {
  await withUser(maker, async (db) => {
    const [req] = await db<{ id: string; status: string }[]>`
      select id, status from public.commission_requests where id = ${input.requestId} and maker_id = ${maker.makerId ?? null} for update`;
    if (!req) throw new UserError('Request not found.');
    if (!['submitted', 'reviewing', 'quoted'].includes(req.status))
      throw new UserError('This request is closed.');
    await db`update public.commission_quotes set status = 'declined' where commission_request_id = ${req.id} and status = 'pending'`;
    await db`
      insert into public.commission_quotes (commission_request_id, maker_id, total_price_cents, deposit_cents, production_days,
        revisions_included, shipping_cents, estimated_delivery_date, message)
      values (${req.id}, ${maker.makerId!}, ${input.totalPrice}, ${input.deposit}, ${input.productionDays}, ${input.revisionsIncluded},
        ${input.shipping}, ${input.estimatedDeliveryDate}, ${clean(input.message)})`;
    await db`update public.commission_requests set status = 'quoted' where id = ${req.id}`;
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
  });
  if (decision === 'accepted') {
    await sendEmail({
      to: env().ADMIN_NOTIFICATION_EMAIL,
      template: 'commission_quote_accepted',
      subject: 'Commission quote accepted — send deposit payment link',
      text: `A buyer accepted a commission quote. Send a Stripe Payment Link or invoice for the deposit.\n\n${env().APP_URL}/admin/commissions`,
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
