import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { TERMS } from '@/lib/studio/terms';
import { logShopEvent } from './concierge';

type User = Pick<SessionUser, 'id' | 'email' | 'role' | 'makerId'>;

export const MAKES = [
  'Dresses',
  'Slips',
  'Sets',
  'Tops',
  'Tailoring',
  'Knitwear',
  'Bridal',
  'Accessories',
] as const;
export const SELL_MODES = [
  { value: 'ready_to_ship', label: 'Ready to ship', body: 'Made already, posted within days.' },
  { value: 'made_to_order', label: 'Made to order', body: 'Cut and sewn once it’s ordered.' },
  { value: 'custom', label: 'Custom requests', body: 'Buyers ask for a piece made for them.' },
] as const;

export interface SellShop {
  id: string;
  slug: string;
  displayName: string;
  location: string | null;
  instagram: string | null;
  tags: string[];
  sellModes: string[];
  shopStatus: string;
  stripeAccountId: string | null;
  payoutsEnabled: boolean;
  chargesEnabled: boolean;
  bankName: string | null;
  bankLast4: string | null;
  pieces: number;
  hasShipping: boolean;
}

export async function mySellShop(user: Pick<User, 'id'>): Promise<SellShop | null> {
  const [s] = await sql()<SellShop[]>`
    select m.id, m.slug, m.display_name, m.location, m.instagram, m.tags, m.sell_modes, m.shop_status,
      m.stripe_account_id, m.stripe_payouts_enabled as payouts_enabled, m.stripe_charges_enabled as charges_enabled,
      m.bank_name, m.bank_last4,
      (select count(*) from public.products p where p.maker_id = m.id and p.status in ('approved', 'pending'))::int as pieces,
      exists (select 1 from public.maker_shipping_rates r where r.maker_id = m.id) as has_shipping
    from public.makers m where m.user_id = ${user.id} limit 1`;
  return s ?? null;
}

/** Shop statuses whose pieces can be published (buyers see them once the shop is live). */
export const SHOP_CAN_PUBLISH = ['approved', 'live', 'holiday'];
export const PUBLISH_BLOCKED = 'You can publish pieces once your shop is approved.';

/**
 * An approved shop goes live by itself once payouts are connected (Stripe charges enabled) and
 * its first piece is published. Founding time starts then. Safe to call any time.
 */
export async function goLiveIfReady(makerId: string): Promise<boolean> {
  const live = await sql().begin(async (tx) => {
    const [m] = await tx<{ ready: boolean }[]>`
      select (m.shop_status = 'approved' and m.stripe_charges_enabled
        and exists (select 1 from public.products p where p.maker_id = m.id and p.status = 'approved')) as ready
      from public.makers m where m.id = ${makerId} for update`;
    if (!m?.ready) return false;
    await tx`
      update public.makers set shop_status = 'live', status = 'approved', approved_at = coalesce(approved_at, now()),
        went_live_at = now(),
        founding_until = case when founding_number is not null
          then now() + make_interval(months => ${TERMS.foundingMonths}) else founding_until end
      where id = ${makerId}`;
    return true;
  });
  if (!live) return false;
  await logShopEvent(makerId, 'went_live', { source: 'application' });
  await audit('shop.went_live', { type: 'maker', id: makerId }, {}, null);
  return true;
}
