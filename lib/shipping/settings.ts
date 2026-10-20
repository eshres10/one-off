import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { cached, invalidate } from '@/lib/cache';
import { sql } from '@/lib/db';
import { UserError } from '@/lib/services/errors';
import { DEFAULT_SHIPPING_OFFER, parseShippingOffer, type ShippingOffer } from './offer';

/** The shipping offer as the admin set it (site_settings 'shipping_offer'), cached for a minute. */
export const getShippingOffer = cached(
  async (): Promise<ShippingOffer> => {
    try {
      const [row] = await sql()<{ value: unknown }[]>`
        select value from public.site_settings where key = 'shipping_offer'`;
      return row ? parseShippingOffer(row.value) : DEFAULT_SHIPPING_OFFER;
    } catch {
      return DEFAULT_SHIPPING_OFFER;
    }
  },
  ['site-shipping-offer'],
  { revalidate: 60, tags: ['site'] },
);

/** What Off One has covered on shipping for orders paid this calendar month (Melbourne time). */
export async function subsidySpentThisMonth(now = new Date()): Promise<number> {
  const [row] = await sql()<{ cents: number }[]>`
    select coalesce(sum(f.shipping_subsidy_cents), 0)::int as cents
    from public.fulfilments f join public.orders o on o.id = f.order_id
    where o.paid_at >= (date_trunc('month', ${now}::timestamptz at time zone 'Australia/Melbourne')
                        at time zone 'Australia/Melbourne')
      and o.status in ('paid', 'partially_refunded', 'refunded')`;
  return row?.cents ?? 0;
}

/**
 * The offer to price a bag with right now: the admin's settings, switched off for the rest of
 * the month once Off One's shipping budget is used up.
 */
export async function activeShippingOffer(now = new Date()): Promise<ShippingOffer> {
  const offer = await getShippingOffer();
  if (!offer.enabled || offer.monthlyBudgetCents === null) return offer;
  const spent = await subsidySpentThisMonth(now);
  return spent >= offer.monthlyBudgetCents ? { ...offer, enabled: false } : offer;
}

const toCents = (dollars: string, label: string, max: number): number | null => {
  const t = dollars.trim();
  if (!t) return null;
  const n = Math.round(Number(t) * 100);
  if (!Number.isFinite(n) || n < 0 || n > max)
    throw new UserError(`${label} should be between A$0 and A$${max / 100}.`);
  return n;
};

export async function setShippingOffer(
  admin: Pick<SessionUser, 'id' | 'role'>,
  input: {
    enabled: boolean;
    extraMaker: string;
    cap: string;
    freeOver: string;
    monthlyBudget: string;
  },
) {
  if (admin.role !== 'admin') throw new UserError('Admins only.');
  const value: ShippingOffer = {
    enabled: input.enabled,
    extraMakerCents: toCents(input.extraMaker, 'Each extra maker', 10_000) ?? 0,
    capCents: toCents(input.cap, 'The cap', 20_000),
    freeOverCents: toCents(input.freeOver, 'Free shipping over', 1_000_000),
    monthlyBudgetCents: toCents(input.monthlyBudget, 'The monthly budget', 10_000_000),
  };
  if (value.freeOverCents === 0) throw new UserError('Leave “Free over” empty to turn it off.');
  await sql()`
    insert into public.site_settings (key, value, updated_at, updated_by)
    values ('shipping_offer', ${sql().json({ ...value })}, now(), ${admin.id})
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`;
  await audit('site.shipping_offer', { type: 'site', id: null }, { ...value }, admin.id);
  invalidate('site');
}
