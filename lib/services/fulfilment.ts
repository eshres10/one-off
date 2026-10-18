import { audit } from '@/lib/audit';
import { sql, withUser } from '@/lib/db';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import type { SessionUser } from '@/lib/auth/session';
import { UserError } from './errors';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

const NEXT: Record<string, string[]> = {
  paid: ['preparing', 'shipped'],
  preparing: ['shipped'],
  shipped: ['delivered'],
};

export type FulfilmentAction =
  | { action: 'preparing'; fulfilmentId: string }
  | { action: 'shipped'; fulfilmentId: string; carrier: string; trackingNumber: string }
  | { action: 'delivered'; fulfilmentId: string };

/** Seller moves their own fulfilment forward (RLS restricts to the maker's rows). */
export async function updateFulfilment(seller: Actor, input: FulfilmentAction) {
  const result = await withUser(seller, async (db) => {
    const [f] = await db<{ id: string; status: string; orderId: string; orderStatus: string }[]>`
      select f.id, f.status, f.order_id, o.status as order_status
      from public.fulfilments f join public.orders o on o.id = f.order_id
      where f.id = ${input.fulfilmentId} for update of f`;
    if (!f) throw new UserError('Order not found.');
    if (!['paid', 'partially_refunded'].includes(f.orderStatus))
      throw new UserError('This order can’t be updated.');
    if (!NEXT[f.status]?.includes(input.action))
      throw new UserError(`Can’t mark a ${f.status} order as ${input.action}.`);

    if (input.action === 'shipped') {
      await db`update public.fulfilments set status = 'shipped', carrier = ${input.carrier}, tracking_number = ${input.trackingNumber},
               shipped_at = now() where id = ${f.id}`;
      await db`update public.order_items set fulfilment_status = 'shipped', carrier = ${input.carrier},
               tracking_number = ${input.trackingNumber}, shipped_at = now() where fulfilment_id = ${f.id} and fulfilment_status <> 'refunded'`;
    } else if (input.action === 'delivered') {
      await db`update public.fulfilments set status = 'delivered', delivered_at = now() where id = ${f.id}`;
      await db`update public.order_items set fulfilment_status = 'delivered', delivered_at = now()
               where fulfilment_id = ${f.id} and fulfilment_status <> 'refunded'`;
    } else {
      await db`update public.fulfilments set status = 'preparing' where id = ${f.id}`;
      await db`update public.order_items set fulfilment_status = 'preparing' where fulfilment_id = ${f.id} and fulfilment_status <> 'refunded'`;
    }
    return f;
  });

  if (input.action === 'delivered') {
    await sql()`update public.makers m set completed_orders = (
      select count(*) from public.fulfilments f where f.maker_id = m.id and f.status = 'delivered') where id = ${seller.makerId ?? null}`;
  }
  const [info] = await sql()<{ email: string; orderNumber: string; makerName: string }[]>`
    select o.buyer_email as email, o.order_number, m.display_name as maker_name
    from public.orders o join public.fulfilments f on f.order_id = o.id join public.makers m on m.id = f.maker_id
    where f.id = ${input.fulfilmentId}`;
  if (info && input.action === 'shipped') {
    await sendEmail(
      emails.orderShipped(
        info.email,
        { id: result.orderId, orderNumber: info.orderNumber },
        info.makerName,
        input.carrier,
        input.trackingNumber,
      ),
    );
  }
  if (info && input.action === 'delivered') {
    await sendEmail(
      emails.orderDelivered(
        info.email,
        { id: result.orderId, orderNumber: info.orderNumber },
        info.makerName,
      ),
    );
  }
  await audit(
    `fulfilment.${input.action}`,
    { type: 'fulfilment', id: input.fulfilmentId },
    {},
    seller.id,
  );
}
