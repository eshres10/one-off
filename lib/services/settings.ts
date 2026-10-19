import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { slugify } from '@/lib/slug';
import { isOwnImageUrl } from '@/lib/storage';
import { TERMS, dispatchDaysFor, leadDaysFor } from '@/lib/studio/terms';
import { NOTIFY_EVENTS, prefsFor, type Channels, type NotifyEvent } from './notifications';
import { UserError } from './errors';
import { MAKER_TIMEZONES } from '@/lib/site/config';

type Seller = Pick<SessionUser, 'id' | 'email' | 'makerId'>;

export const SHOP_TAGS = [
  'Slips',
  'Dresses',
  'Sets',
  'Tailoring',
  'Knitwear',
  'Bridal',
  'Occasion',
  'Made to order',
  'Upcycled',
  'Natural fibres',
] as const;
export const REPLY_WITHIN = ['1 day', '2 days', '3 days', '1 week'] as const;

export interface Rate {
  region: 'same_state' | 'au' | 'nz';
  standardCents: number;
  expressCents: number | null;
  enabled: boolean;
}

export interface ShopSettings {
  name: string;
  slug: string;
  slugLocked: boolean;
  suburb: string;
  state: string;
  timezone: string;
  instagram: string;
  tagline: string;
  story: string;
  tags: string[];
  avatarUrl: string;
  bannerUrl: string;
  rates: Rate[];
  freeShipping: boolean;
  freeOverCents: number;
  /** Bundle deal on 2+ pieces in one parcel: free or a percentage off standard shipping. */
  bundleShipping: 'none' | 'free' | 'percent';
  bundlePercentOff: number;
  bundleMinPieces: number;
  localPickup: boolean;
  dispatchOption: string;
  mtoDefaultLead: string;
  mtoWeeklyCapacity: number | null;
  acceptsCustom: boolean;
  customFromCents: number | null;
  customDepositPct: number | null;
  customReplyWithin: string;
  customBlurb: string;
  policyExtra: string;
  /** Where buyers post ready-to-ship returns; shown to a buyer only once they start one. */
  returnAddress: string;
  /** The maker's own sizing notes, shown with the size guide link on their pieces. */
  sizeNotes: string;
  careDefault: string;
  holidayOn: boolean;
  holidayFrom: string;
  holidayUntil: string;
  holidayNote: string;
  prefs: Record<NotifyEvent, Channels>;
  abn: string;
  gstRegistered: boolean;
  loginEmail: string;
  mobile: string;
  bank: string | null;
  shopStatus: string;
  hasStripe: boolean;
}

const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date());

export async function getSettings(seller: Seller): Promise<ShopSettings> {
  const [m] = await sql()<
    Record<string, unknown>[]
  >`select * from public.makers where id = ${seller.makerId!}`;
  if (!m) throw new UserError('Shop not found.');
  const rates = await sql()<Rate[]>`
    select region, standard_cents, express_cents, enabled from public.maker_shipping_rates where maker_id = ${seller.makerId!}`;
  const rate = (region: Rate['region'], fallback: Rate): Rate =>
    rates.find((r) => r.region === region) ?? fallback;
  const d = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : '');
  return {
    name: String(m.displayName ?? ''),
    slug: String(m.slug ?? ''),
    slugLocked: Boolean(m.slugChangedAt),
    suburb: String(m.location ?? '')
      .split(',')[0]!
      .trim(),
    state: String(m.state ?? 'VIC'),
    timezone: String(m.timezone ?? 'Australia/Melbourne'),
    instagram: String(m.instagram ?? ''),
    tagline: String(m.tagline ?? ''),
    story: String(m.story ?? ''),
    tags: (m.tags as string[]) ?? [],
    avatarUrl: String(m.avatarUrl ?? ''),
    bannerUrl: String(m.coverUrl ?? ''),
    rates: [
      rate('same_state', {
        region: 'same_state',
        standardCents: Number(m.shippingStandardCents ?? 1200),
        expressCents: null,
        enabled: false,
      }),
      rate('au', {
        region: 'au',
        standardCents: Number(m.shippingStandardCents ?? 1200),
        expressCents: null,
        enabled: true,
      }),
      rate('nz', { region: 'nz', standardCents: 2800, expressCents: null, enabled: false }),
    ],
    freeShipping: m.freeShippingOverCents !== null,
    freeOverCents: Number(m.freeShippingOverCents ?? 30000),
    bundleShipping: (['free', 'percent'].includes(String(m.bundleShipping))
      ? m.bundleShipping
      : 'none') as ShopSettings['bundleShipping'],
    bundlePercentOff: Number(m.bundlePercentOff ?? 20),
    bundleMinPieces: Number(m.bundleMinPieces ?? 2),
    localPickup: Boolean(m.localPickup),
    dispatchOption: String(m.dispatchOption ?? TERMS.readyToShipDispatchOptions[1]),
    mtoDefaultLead: String(m.mtoDefaultLead ?? TERMS.mtoLeadOptions[1]),
    mtoWeeklyCapacity: (m.mtoWeeklyCapacity as number | null) ?? null,
    acceptsCustom: Boolean(m.customCommissionsEnabled),
    customFromCents: (m.customFromCents as number | null) ?? null,
    customDepositPct: (m.customDepositPct as number | null) ?? null,
    customReplyWithin: String(m.customReplyWithin ?? REPLY_WITHIN[1]),
    customBlurb: String(m.customBlurb ?? ''),
    policyExtra: String(m.policyExtra ?? ''),
    returnAddress: String(m.returnAddress ?? ''),
    sizeNotes: String(m.sizeNotes ?? ''),
    careDefault: String(m.careDefault ?? ''),
    holidayOn: m.shopStatus === 'holiday' || Boolean(m.holidayFrom && d(m.holidayUntil) > today()),
    holidayFrom: d(m.holidayFrom),
    holidayUntil: d(m.holidayUntil),
    holidayNote: String(m.holidayNote ?? ''),
    prefs: await prefsFor(seller.id),
    abn: String(m.abn ?? ''),
    gstRegistered: Boolean(m.gstRegistered),
    loginEmail: seller.email,
    mobile: String(m.mobile ?? ''),
    bank: m.bankName ? `${m.bankName}${m.bankLast4 ? ` ••${m.bankLast4}` : ''}` : null,
    shopStatus: String(m.shopStatus),
    hasStripe: Boolean(m.stripeAccountId),
  };
}

const cents = (n: unknown, max: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) && v >= 0 && v <= max ? v : null;
};

/** Saves every Settings section in one go (the save bar). Changes show on the live shop. */
export async function saveSettings(seller: Seller, s: ShopSettings) {
  const makerId = seller.makerId!;
  const [current] = await sql()<
    { slug: string; slugChangedAt: Date | null; shopStatus: string; timezone: string }[]
  >`
    select slug, slug_changed_at, shop_status, timezone from public.makers where id = ${makerId}`;
  if (!current) throw new UserError('Shop not found.');

  const name = sanitizeText(s.name).slice(0, 80);
  if (name.length < 2) throw new UserError('Your shop needs a name.');
  const tagline = sanitizeText(s.tagline);
  if (tagline.length > 80) throw new UserError('Keep the short line to 80 characters.');
  for (const url of [s.avatarUrl, s.bannerUrl])
    if (url && !isOwnImageUrl(url) && !url.startsWith('/seed/') && !url.startsWith('/preview/'))
      throw new UserError('Upload your photos here rather than linking them.');

  // The shop link can change once; the old one keeps working.
  let slug = current.slug;
  const wanted = slugify(s.slug);
  if (wanted && wanted !== current.slug) {
    if (current.slugChangedAt) throw new UserError('Your shop link has already been changed once.');
    if (!/^[a-z0-9-]{2,60}$/.test(wanted))
      throw new UserError('Use letters, numbers and dashes in your shop link.');
    const [taken] = await sql()<{ x: number }[]>`
      select 1 as x from public.makers where slug = ${wanted}
      union all select 1 from public.maker_slug_redirects where old_slug = ${wanted}`;
    if (taken) throw new UserError('That shop link is taken.');
    slug = wanted;
  }

  const rates = s.rates
    .filter((r) => ['same_state', 'au', 'nz'].includes(r.region))
    .map((r) => {
      const standard = cents(r.standardCents, 50_000);
      if (r.enabled && standard === null) throw new UserError('Check your shipping prices.');
      return {
        ...r,
        standardCents: standard ?? 0,
        expressCents: r.expressCents === null ? null : cents(r.expressCents, 50_000),
      };
    });
  if (!rates.find((r) => r.region === 'au')?.enabled)
    throw new UserError('Australia-wide shipping needs to stay on.');
  const au = rates.find((r) => r.region === 'au')!;
  const bundleKind = ['free', 'percent'].includes(s.bundleShipping) ? s.bundleShipping : 'none';
  const bundlePercent = Math.round(Number(s.bundlePercentOff));
  if (bundleKind === 'percent' && !(bundlePercent >= 5 && bundlePercent <= 90))
    throw new UserError('A bundle discount should be between 5% and 90%.');
  const bundle = {
    kind: bundleKind,
    percent: bundleKind === 'percent' ? bundlePercent : null,
    minPieces: Math.min(10, Math.max(2, Math.round(Number(s.bundleMinPieces) || 2))),
  };
  const dispatch = (TERMS.readyToShipDispatchOptions as readonly string[]).includes(
    s.dispatchOption,
  )
    ? s.dispatchOption
    : TERMS.readyToShipDispatchOptions[1];
  const lead = (TERMS.mtoLeadOptions as readonly string[]).includes(s.mtoDefaultLead)
    ? s.mtoDefaultLead
    : TERMS.mtoLeadOptions[1];
  if (s.customDepositPct !== null && (s.customDepositPct < 0 || s.customDepositPct > 100))
    throw new UserError('Deposit should be between 0% and 100%.');
  const abn = s.abn.replace(/\s+/g, '');
  if (abn && !/^\d{11}$/.test(abn)) throw new UserError('An ABN is 11 digits.');
  const mobile = s.mobile.replace(/[^\d+]/g, '');
  if (mobile && !/^(\+?61|0)4\d{8}$/.test(mobile))
    throw new UserError('Enter an Australian mobile, like 0412 345 678.');

  // Holiday mode: on now if it has started, scheduled if the away date is ahead.
  let holidayFrom: string | null = null;
  let holidayUntil: string | null = null;
  if (s.holidayOn) {
    holidayFrom = s.holidayFrom || today();
    holidayUntil = s.holidayUntil || null;
    if (!holidayUntil) throw new UserError('Add the date you’re back.');
    if (holidayUntil <= holidayFrom)
      throw new UserError('Your back date needs to be after your away date.');
  }
  let shopStatus = current.shopStatus;
  if (shopStatus === 'live' || shopStatus === 'holiday')
    shopStatus = s.holidayOn && holidayFrom! <= today() ? 'holiday' : 'live';

  await sql().begin(async (tx) => {
    if (slug !== current.slug) {
      await tx`insert into public.maker_slug_redirects (old_slug, maker_id) values (${current.slug}, ${makerId})
        on conflict (old_slug) do update set maker_id = excluded.maker_id`;
      await tx`delete from public.maker_slug_redirects where old_slug = ${slug}`;
    }
    await tx`
      update public.makers set display_name = ${name}, slug = ${slug},
        slug_changed_at = case when ${slug !== current.slug} then now() else slug_changed_at end,
        location = ${sanitizeText(s.suburb).slice(0, 60) || null},
        state = ${['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].includes(s.state) ? s.state : 'VIC'},
        timezone = ${MAKER_TIMEZONES.some((z) => z.value === s.timezone) ? s.timezone : current.timezone},
        instagram = ${s.instagram.replace(/^@/, '').trim().slice(0, 60) || null}, tagline = ${tagline || null},
        story = ${sanitizeText(s.story).slice(0, 4000) || null},
        tags = ${s.tags.filter((t) => (SHOP_TAGS as readonly string[]).includes(t)).slice(0, 6)},
        avatar_url = ${s.avatarUrl || null}, cover_url = ${s.bannerUrl || null},
        shipping_standard_cents = ${au.standardCents},
        free_shipping_over_cents = ${s.freeShipping ? (cents(s.freeOverCents, 1_000_000) ?? 30000) : null},
        bundle_shipping = ${bundle.kind}, bundle_percent_off = ${bundle.percent},
        bundle_min_pieces = ${bundle.minPieces},
        local_pickup = ${s.localPickup}, dispatch_option = ${dispatch}, dispatch_days = ${dispatchDaysFor(dispatch)},
        mto_default_lead = ${lead}, lead_time_days = ${leadDaysFor(lead)},
        mto_weekly_capacity = ${s.mtoWeeklyCapacity && s.mtoWeeklyCapacity > 0 ? Math.min(500, Math.round(s.mtoWeeklyCapacity)) : null},
        custom_commissions_enabled = ${s.acceptsCustom},
        custom_from_cents = ${s.customFromCents ? cents(s.customFromCents, 10_000_000) : null},
        custom_deposit_pct = ${s.customDepositPct}, custom_reply_within = ${s.customReplyWithin.slice(0, 20) || null},
        custom_blurb = ${sanitizeText(s.customBlurb).slice(0, 600) || null},
        policy_extra = ${sanitizeText(s.policyExtra).slice(0, 300) || null},
        return_address = ${sanitizeText(s.returnAddress ?? '').slice(0, 400) || null},
        size_notes = ${sanitizeText(s.sizeNotes ?? '').slice(0, 400) || null},
        care_default = ${sanitizeText(s.careDefault).slice(0, 500) || null},
        holiday_from = ${holidayFrom}, holiday_until = ${holidayUntil},
        holiday_note = ${s.holidayOn ? sanitizeText(s.holidayNote).slice(0, 280) || null : null},
        shop_status = ${shopStatus}, abn = ${abn || null}, gst_registered = ${s.gstRegistered}, mobile = ${mobile || null},
        updated_at = now()
      where id = ${makerId}`;
    for (const r of rates)
      await tx`
        insert into public.maker_shipping_rates (maker_id, region, standard_cents, express_cents, enabled, updated_at)
        values (${makerId}, ${r.region}, ${r.standardCents}, ${r.expressCents}, ${r.enabled}, now())
        on conflict (maker_id, region) do update set standard_cents = excluded.standard_cents,
          express_cents = excluded.express_cents, enabled = excluded.enabled, updated_at = now()`;
    for (const event of NOTIFY_EVENTS) {
      const c = s.prefs[event];
      if (!c) continue;
      await tx`
        insert into public.notification_prefs (user_id, event, email, push, sms, updated_at)
        values (${seller.id}, ${event}, ${Boolean(c.email)}, ${Boolean(c.push)}, ${Boolean(c.sms)}, now())
        on conflict (user_id, event) do update set email = excluded.email, push = excluded.push, sms = excluded.sms,
          updated_at = now()`;
    }
  });
  await audit(
    'shop.settings_saved',
    { type: 'maker', id: makerId },
    { slugChanged: slug !== current.slug },
    seller.id,
  );
  return { slug };
}

/** Close shop: hidden immediately; open orders still need fulfilling. Reopen any time. */
export async function setShopClosed(seller: Seller, closed: boolean) {
  const makerId = seller.makerId!;
  if (closed)
    await sql()`update public.makers set shop_status = 'closed', status = 'paused', closed_at = now() where id = ${makerId}`;
  else
    await sql()`update public.makers set shop_status = 'live', status = 'approved', closed_at = null
      where id = ${makerId} and shop_status = 'closed'`;
  await audit(
    closed ? 'shop.closed' : 'shop.reopened',
    { type: 'maker', id: makerId },
    {},
    seller.id,
  );
}

/**
 * Daily: holiday mode starts on the away date and ends on the back date. When a shop comes back,
 * people who saved its pieces get an email.
 */
export async function holidayTransitions(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(now);
  const started = await sql()<{ id: string }[]>`
    update public.makers set shop_status = 'holiday'
    where shop_status = 'live' and holiday_from is not null and holiday_from <= ${day}
      and (holiday_until is null or holiday_until > ${day})
    returning id`;
  const back = await sql()<{ id: string; displayName: string; slug: string }[]>`
    update public.makers set shop_status = 'live', holiday_from = null, holiday_until = null, holiday_note = null
    where shop_status = 'holiday' and holiday_until is not null and holiday_until <= ${day}
    returning id, display_name, slug`;
  for (const shop of back) {
    const people = await sql()<{ email: string }[]>`
      select distinct u.email from public.saved_items s join public.products p on p.id = s.product_id
      join public.users u on u.id = s.user_id where p.maker_id = ${shop.id} and p.status = 'approved'`;
    for (const p of people) await sendEmail(emails.shopBack(p.email, shop));
  }
  return { started: started.length, back: back.length };
}
