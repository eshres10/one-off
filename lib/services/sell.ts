import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { slugify } from '@/lib/slug';
import { TERMS } from '@/lib/studio/terms';
import { logShopEvent } from './concierge';
import { UserError } from './errors';

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

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 40) || 'studio';
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await sql()`
      select 1 from public.makers where slug = ${slug}
      union all select 1 from public.maker_slug_redirects where old_slug = ${slug}`;
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Step 1 of /sell/start: the label. Creates (or updates) the maker's shop as a draft, makes the
 * account a seller account, and gives early shops a founding number.
 */
export async function saveLabel(
  user: User,
  input: { name: string; suburb: string; instagram: string; makes: string[]; modes: string[] },
): Promise<SellShop> {
  const name = sanitizeText(input.name).trim().slice(0, 60);
  if (name.length < 2) throw new UserError('Add your label’s name.');
  const suburb = sanitizeText(input.suburb).trim().slice(0, 60);
  if (!suburb) throw new UserError('Add the suburb you work from.');
  const instagram =
    input.instagram
      .trim()
      .replace(/^@/, '')
      .replace(/[^\w.]/g, '')
      .slice(0, 30) || null;
  const makes = input.makes.filter((m) => (MAKES as readonly string[]).includes(m));
  if (!makes.length) throw new UserError('Pick what you make.');
  const modes = input.modes.filter((m) => SELL_MODES.some((x) => x.value === m));
  if (!modes.length) throw new UserError('Pick how you sell.');

  const existing = await mySellShop(user);
  if (existing && existing.shopStatus !== 'draft')
    throw new UserError('Your shop is already set up. Change these details in Studio settings.');
  if (user.role === 'admin') throw new UserError('Admin accounts can’t open a shop.');

  if (existing) {
    await sql()`
      update public.makers set display_name = ${name}, location = ${suburb}, city = ${suburb}, instagram = ${instagram},
        tags = ${makes}, sell_modes = ${modes}, custom_commissions_enabled = ${modes.includes('custom')}
      where id = ${existing.id}`;
    return (await mySellShop(user))!;
  }

  const slug = await uniqueSlug(name);
  const makerId = await sql().begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into public.makers (user_id, slug, display_name, location, city, instagram, tags, sell_modes,
        custom_commissions_enabled, status, shop_status, self_signup, claimed_at)
      values (${user.id}, ${slug}, ${name}, ${suburb}, ${suburb}, ${instagram}, ${makes}, ${modes},
        ${modes.includes('custom')}, 'draft', 'draft', true, now())
      returning id`;
    await tx`update public.users set role = 'seller' where id = ${user.id} and role = 'buyer'`;
    await tx`select pg_advisory_xact_lock(hashtext('founding_number'))`;
    const [next] = await tx<
      { n: number }[]
    >`select coalesce(max(founding_number), 0) + 1 as n from public.makers`;
    if (next!.n <= TERMS.foundingMakerCap)
      await tx`update public.makers set founding_number = ${next!.n} where id = ${row!.id}`;
    return row!.id;
  });
  await logShopEvent(makerId, 'self_signup');
  await audit('shop.self_signup', { type: 'maker', id: makerId }, { slug }, user.id);
  return (await mySellShop(user))!;
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
