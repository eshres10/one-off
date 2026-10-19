import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { TERMS } from '@/lib/studio/terms';
import { nextPayoutDate } from './overview';

type Seller = Pick<SessionUser, 'id' | 'makerId'>;

export interface PayoutsView {
  connected: boolean;
  stripeAccountId: string | null;
  bank: string | null;
  next: { date: string; amountCents: number; orders: number };
  onTheWay: { amountCents: number; orders: number };
  paidAllTime: number;
  foundingSaved: number;
  founding: boolean;
  history: Array<{
    id: string;
    arrivalDate: string | null;
    orders: number;
    salesCents: number | null;
    feesCents: number | null;
    amountCents: number;
    status: string;
  }>;
}

export async function getPayouts(seller: Seller): Promise<PayoutsView> {
  const makerId = seller.makerId!;
  const [m] = await sql()<
    {
      stripeAccountId: string | null;
      charges: boolean;
      bankName: string | null;
      bankLast4: string | null;
      foundingUntil: Date | null;
    }[]
  >`
    select stripe_account_id, stripe_charges_enabled as charges, bank_name, bank_last4, founding_until
    from public.makers where id = ${makerId}`;
  const [money] = await sql()<
    {
      nextAmount: number;
      nextOrders: number;
      wayAmount: number;
      wayOrders: number;
      saved: number;
    }[]
  >`
    with last_paid as (
      select coalesce(max(created_at), 'epoch') as at from public.payouts where maker_id = ${makerId} and status = 'paid'
    )
    select
      coalesce(sum(f.seller_net_cents) filter (where f.transfer_released_at > (select at from last_paid)), 0)::int as next_amount,
      count(*) filter (where f.transfer_released_at > (select at from last_paid))::int as next_orders,
      coalesce(sum(f.seller_net_cents) filter (where f.transfer_released_at is null and f.status::text not in ('refunded', 'cancelled')), 0)::int as way_amount,
      count(*) filter (where f.transfer_released_at is null and f.status::text not in ('refunded', 'cancelled'))::int as way_orders,
      coalesce(sum(round(f.subtotal_cents * ${TERMS.standardCommissionPct} / 100.0) - f.platform_commission_cents)
        filter (where f.commission_pct_applied < ${TERMS.standardCommissionPct}), 0)::int as saved
    from public.fulfilments f join public.orders o on o.id = f.order_id
    where f.maker_id = ${makerId} and o.status in ('paid', 'partially_refunded')`;
  const history = await sql()<PayoutsView['history']>`
    select id, to_char(arrival_date, 'YYYY-MM-DD') as arrival_date, order_count as orders, sales_cents, fees_cents,
      amount_cents, status
    from public.payouts where maker_id = ${makerId} order by arrival_date desc nulls first, created_at desc limit 52`;
  const paid = history.filter((h) => h.status === 'paid').reduce((s, h) => s + h.amountCents, 0);
  return {
    connected: Boolean(m?.charges),
    stripeAccountId: m?.stripeAccountId ?? null,
    bank: m?.bankName
      ? `${m.bankName}${m.bankLast4 ? ` ••${m.bankLast4}` : ''}`
      : m?.bankLast4
        ? `••${m.bankLast4}`
        : null,
    next: { date: nextPayoutDate(), amountCents: money!.nextAmount, orders: money!.nextOrders },
    onTheWay: { amountCents: money!.wayAmount, orders: money!.wayOrders },
    paidAllTime: paid,
    foundingSaved: Math.max(0, money!.saved),
    founding: Boolean(m?.foundingUntil && new Date(m.foundingUntil).getTime() > Date.now()),
    history,
  };
}
