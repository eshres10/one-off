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

export interface PayoutAdjustment {
  id: string;
  /** "Return OO-R-1042" or the case's reason. */
  label: string;
  /** What comes off the maker: their share of the refund (the commission is refunded to them). */
  amountCents: number;
  at: Date;
  /** How it was taken. */
  how: 'reversed' | 'next_payout' | 'taken' | 'before_payout';
  appliedAt: Date | null;
}

/**
 * Refunds after a sale, shown as their own lines on Studio → Payouts: change-of-mind returns
 * (reversed from the transfer, taken from a later payout, or deducted before it was paid) and
 * any other amount owed from a refund that couldn't be reversed.
 */
export async function getPayoutAdjustments(seller: Seller): Promise<PayoutAdjustment[]> {
  const makerId = seller.makerId!;
  const returns = await sql()<PayoutAdjustment[]>`
    select r.id, 'Return ' || r.number as label,
      round(r.refund_amount::numeric * oi.seller_net_cents / oi.line_total_cents)::int as amount_cents,
      r.refunded_at as at, a.applied_at,
      case when a.id is not null and a.applied_at is not null then 'taken'
           when a.id is not null then 'next_payout'
           when f.stripe_transfer_id is not null then 'reversed'
           else 'before_payout' end as how
    from public.returns r
    join public.order_items oi on oi.id = r.order_item_id
    join public.fulfilments f on f.id = oi.fulfilment_id
    left join public.maker_adjustments a on a.return_id = r.id
    where r.maker_id = ${makerId} and r.status = 'refunded' and r.refund_amount is not null`;
  const other = await sql()<PayoutAdjustment[]>`
    select a.id, a.reason as label, a.amount_cents, a.created_at as at, a.applied_at,
      case when a.applied_at is not null then 'taken' else 'next_payout' end as how
    from public.maker_adjustments a
    where a.maker_id = ${makerId} and a.return_id is null`;
  return [...returns, ...other].sort((x, y) => new Date(y.at).getTime() - new Date(x.at).getTime());
}
