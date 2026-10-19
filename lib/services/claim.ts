import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { payments } from '@/lib/payments';
import { TERMS, dispatchDaysFor, leadDaysFor } from '@/lib/studio/terms';
import { hashToken, logShopEvent } from './concierge';
import { UserError } from './errors';

type User = Pick<SessionUser, 'id' | 'email' | 'role' | 'makerId'>;

/** The steps after sign-in: 0 welcome, 1 check, 2 deal, 3 bank, 4 shipping, 5 live. */
export const CLAIM_STEPS = 5;
export const AGREEMENT_VERSION = '2026-10-draft';

export interface ClaimShop {
  id: string;
  slug: string;
  displayName: string;
  coverUrl: string | null;
  avatarUrl: string | null;
  foundingNumber: number | null;
  shopStatus: string;
  claimStep: number;
  userId: string | null;
  inviteEmail: string | null;
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  bankName: string | null;
  bankLast4: string | null;
  freeShippingOverCents: number | null;
  dispatchOption: string | null;
  mtoDefaultLead: string | null;
  foundingUntil: Date | null;
}

const SHOP_COLUMNS = `
  m.id, m.slug, m.display_name, m.cover_url, m.avatar_url, m.founding_number, m.shop_status, m.claim_step, m.user_id,
  m.invite_email, m.stripe_account_id, m.stripe_charges_enabled as charges_enabled,
  m.stripe_payouts_enabled as payouts_enabled, m.bank_name, m.bank_last4, m.free_shipping_over_cents, m.dispatch_option,
  m.mto_default_lead, m.founding_until`;

export type InviteCheck =
  | { ok: true; shop: ClaimShop; inviteId: string; used: boolean }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' };

/** Looks an invite token up by its hash. The first look counts as "opened". */
export async function checkInvite(token: string): Promise<InviteCheck> {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(token)) return { ok: false, reason: 'invalid' };
  const [invite] = await sql()<
    { id: string; makerId: string; expiresAt: Date; usedAt: Date | null; openedAt: Date | null }[]
  >`
    select id, maker_id, expires_at, used_at, opened_at from public.shop_invites where token_hash = ${hashToken(token)}`;
  if (!invite) return { ok: false, reason: 'invalid' };
  const shop = await shopById(invite.makerId);
  if (!shop) return { ok: false, reason: 'invalid' };
  if (invite.usedAt) return { ok: true, shop, inviteId: invite.id, used: true };
  if (new Date(invite.expiresAt).getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (!invite.openedAt) {
    await sql()`update public.shop_invites set opened_at = now() where id = ${invite.id} and opened_at is null`;
    await logShopEvent(shop.id, 'claim_opened');
  }
  return { ok: true, shop, inviteId: invite.id, used: false };
}

export async function shopById(makerId: string): Promise<ClaimShop | null> {
  const [shop] = await sql()<ClaimShop[]>`
    select ${sql().unsafe(SHOP_COLUMNS)} from public.makers m where m.id = ${makerId}`;
  return shop ?? null;
}

/** The shop the signed-in maker is claiming (after the invite link has been used). */
export async function myClaimShop(user: User): Promise<ClaimShop | null> {
  const [shop] = await sql()<ClaimShop[]>`
    select ${sql().unsafe(SHOP_COLUMNS)} from public.makers m where m.user_id = ${user.id}`;
  return shop ?? null;
}

/** Claims the shop for the signed-in person: they become its owner and a seller. */
export async function claimShop(user: User, token: string): Promise<ClaimShop> {
  const check = await checkInvite(token);
  if (!check.ok) throw new UserError('This link has expired.');
  const { shop } = check;
  if (shop.userId === user.id) return shop;
  if (check.used || shop.userId) throw new UserError('This shop has already been claimed.');
  if (user.makerId)
    throw new UserError('Your account already has a shop. Sign in with another email.');
  if (user.role === 'admin') throw new UserError('Sign in as the maker to claim this shop.');
  await sql().begin(async (tx) => {
    const [taken] = await tx<{ id: string }[]>`
      select id from public.shop_invites where id = ${check.inviteId} and used_at is null for update`;
    if (!taken) throw new UserError('This shop has already been claimed.');
    await tx`update public.shop_invites set used_at = now() where id = ${check.inviteId}`;
    await tx`update public.makers set user_id = ${user.id}, claimed_at = now(), claim_step = greatest(claim_step, 0)
      where id = ${shop.id} and user_id is null`;
    await tx`update public.users set role = 'seller' where id = ${user.id} and role = 'buyer'`;
  });
  await logShopEvent(shop.id, 'claimed');
  await audit('shop.claimed', { type: 'maker', id: shop.id }, {}, user.id);
  return (await shopById(shop.id))!;
}

async function ownShop(user: User): Promise<ClaimShop> {
  const shop = await myClaimShop(user);
  if (!shop) throw new UserError('Open your invite link to claim your shop.');
  return shop;
}

/** Saves progress so the maker can leave and come back. */
export async function setClaimStep(user: User, step: number) {
  const shop = await ownShop(user);
  const next = Math.max(0, Math.min(CLAIM_STEPS, Math.round(step)));
  await sql()`update public.makers set claim_step = greatest(claim_step, ${next}) where id = ${shop.id}`;
  if (next > shop.claimStep) await logShopEvent(shop.id, `claim_step_${next}`);
}

export async function claimPieces(makerId: string) {
  return sql()<
    {
      id: string;
      slug: string;
      title: string;
      priceCents: number;
      productType: string;
      keepOnClaim: boolean;
      imageUrl: string | null;
      listedByAdmin: boolean;
    }[]
  >`
    select p.id, p.slug, p.title, p.price_cents, p.product_type, p.keep_on_claim, p.listed_by_admin,
      (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
    from public.products p where p.maker_id = ${makerId} and p.status in ('draft', 'pending', 'approved')
    order by p.created_at`;
}

/** Step 1: show or hide a piece One Off listed (it goes live with the shop only if shown). */
export async function setKeepOnClaim(user: User, productId: string, keep: boolean) {
  const shop = await ownShop(user);
  await sql()`update public.products set keep_on_claim = ${keep} where id = ${productId} and maker_id = ${shop.id}`;
}

/** Step 1: "Looks good" — the maker has checked what was listed. Nothing goes live yet. */
export async function markPiecesReviewed(user: User) {
  const shop = await ownShop(user);
  await sql()`
    update public.products set reviewed_by_seller_at = now()
    where maker_id = ${shop.id} and reviewed_by_seller_at is null`;
  await setClaimStep(user, 2);
}

/** Step 2: the Seller Agreement, recorded with when, from where and on what. */
export async function acceptAgreement(
  user: User,
  meta: { ip: string | null; userAgent: string | null; photoRights: boolean },
) {
  const shop = await ownShop(user);
  if (!meta.photoRights) throw new UserError('Tick the box to agree.');
  await sql()`
    insert into public.seller_agreements (maker_id, user_id, version, ip, user_agent, photo_rights_confirmed)
    values (${shop.id}, ${user.id}, ${AGREEMENT_VERSION}, ${meta.ip}, ${(meta.userAgent ?? '').slice(0, 400)}, true)`;
  await logShopEvent(shop.id, 'agreement_signed');
  await setClaimStep(user, 3);
}

export async function hasAgreement(makerId: string) {
  const [row] = await sql()<{ n: number }[]>`
    select count(*)::int as n from public.seller_agreements where maker_id = ${makerId}`;
  return (row?.n ?? 0) > 0;
}

/**
 * Step 3: Stripe Connect Express. Creates the connected account on first visit (weekly payouts
 * on TERMS.payoutWeekday) and returns an onboarding link back to the claim flow.
 */
export async function stripeOnboardingLink(
  user: User,
  backTo = '/claim/continue?step=3',
): Promise<string> {
  const shop = await ownShop(user);
  // Payouts are set up only once a shop is approved (invited shops are pre-approved).
  if (!['invited', 'approved', 'live', 'holiday'].includes(shop.shopStatus))
    throw new UserError('You can connect payouts once your shop is approved.');
  let accountId = shop.stripeAccountId;
  if (!accountId) {
    const acct = await payments().createExpressAccount({
      email: user.email,
      makerId: shop.id,
      businessName: shop.displayName,
      payoutWeekday: TERMS.payoutWeekday,
    });
    accountId = acct.id;
    await sql()`update public.makers set stripe_account_id = ${accountId} where id = ${shop.id}`;
    await logShopEvent(shop.id, 'stripe_account_created');
  }
  const base = env().APP_URL;
  const link = await payments().createAccountLink(
    accountId,
    `${base}${backTo}&refresh=1`,
    `${base}${backTo}&return=1`,
  );
  return link.url;
}

/** Back from Stripe: read the account and store what it can do and where payouts go. */
export async function syncStripeAccount(user: User) {
  const shop = await ownShop(user);
  if (!shop.stripeAccountId) return shop;
  const info = await payments().retrieveAccount(shop.stripeAccountId);
  await sql()`
    update public.makers set stripe_onboarding_complete = ${info.detailsSubmitted},
      stripe_charges_enabled = ${info.chargesEnabled}, stripe_payouts_enabled = ${info.payoutsEnabled},
      bank_name = coalesce(${info.bankName}, bank_name), bank_last4 = coalesce(${info.bankLast4}, bank_last4)
    where id = ${shop.id}`;
  if (info.chargesEnabled) {
    // The account.updated webhook may have got here first, so check the log rather than the flag.
    const [seen] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.shop_events where maker_id = ${shop.id} and event = 'stripe_connected'`;
    if (!seen?.n) await logShopEvent(shop.id, 'stripe_connected');
  }
  if (info.detailsSubmitted) await setClaimStep(user, 4);
  return { ...(await shopById(shop.id))!, requirementsDue: info.requirementsDue };
}

/** Step 4: shipping prices, free-shipping threshold and dispatch / making times. */
export async function saveClaimShipping(
  user: User,
  input: {
    standardCents: number;
    expressCents: number | null;
    freeOver: boolean;
    dispatchOption: string;
    mtoLead: string;
  },
) {
  const shop = await ownShop(user);
  if (
    !Number.isInteger(input.standardCents) ||
    input.standardCents < 0 ||
    input.standardCents > 20000
  )
    throw new UserError('Standard shipping should be between A$0 and A$200.');
  if (input.expressCents !== null && (input.expressCents < 0 || input.expressCents > 30000))
    throw new UserError('Express shipping should be between A$0 and A$300.');
  const dispatch = (TERMS.readyToShipDispatchOptions as readonly string[]).includes(
    input.dispatchOption,
  )
    ? input.dispatchOption
    : TERMS.readyToShipDispatchOptions[1];
  const lead = (TERMS.mtoLeadOptions as readonly string[]).includes(input.mtoLead)
    ? input.mtoLead
    : TERMS.mtoLeadOptions[1];
  await sql()`
    insert into public.maker_shipping_rates (maker_id, region, standard_cents, express_cents, enabled, updated_at)
    values (${shop.id}, 'au', ${input.standardCents}, ${input.expressCents}, true, now())
    on conflict (maker_id, region) do update set standard_cents = excluded.standard_cents,
      express_cents = excluded.express_cents, enabled = true, updated_at = now()`;
  await sql()`
    update public.makers set shipping_standard_cents = ${input.standardCents},
      free_shipping_over_cents = ${input.freeOver ? 30000 : null}, dispatch_option = ${dispatch},
      dispatch_days = ${dispatchDaysFor(dispatch)}, mto_default_lead = ${lead}, lead_time_days = ${leadDaysFor(lead)}
    where id = ${shop.id}`;
  await setClaimStep(user, 5);
}

/**
 * Step 5: Go live. The shop goes live, founding starts now (TERMS.foundingMonths), and every piece
 * the maker kept switched on is published.
 */
export async function goLive(user: User) {
  const shop = await ownShop(user);
  if (shop.shopStatus === 'live') return shop;
  if (!(await hasAgreement(shop.id))) throw new UserError('Agree to the Seller Agreement first.');
  const published = await sql().begin(async (tx) => {
    await tx`
      update public.makers set shop_status = 'live', status = 'approved', approved_at = coalesce(approved_at, now()),
        went_live_at = now(), claim_step = ${CLAIM_STEPS},
        founding_until = case when founding_number is not null
          then now() + make_interval(months => ${TERMS.foundingMonths}) else founding_until end
      where id = ${shop.id}`;
    const rows = await tx<{ id: string }[]>`
      update public.products set status = 'approved'
      where maker_id = ${shop.id} and status in ('draft', 'pending') and keep_on_claim
      returning id`;
    await tx`
      update public.products set status = 'archived'
      where maker_id = ${shop.id} and status in ('draft', 'pending') and not keep_on_claim and listed_by_admin`;
    return rows.length;
  });
  await logShopEvent(shop.id, 'went_live', { pieces: published });
  await audit('shop.went_live', { type: 'maker', id: shop.id }, { pieces: published }, user.id);
  return (await shopById(shop.id))!;
}
