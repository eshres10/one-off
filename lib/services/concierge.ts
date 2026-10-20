import { createHash, randomBytes } from 'node:crypto';
import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { slugify } from '@/lib/slug';
import { isOwnImageUrl } from '@/lib/storage';
import { TERMS } from '@/lib/studio/terms';
import { UserError } from './errors';
import { nextFoundingNumber } from './founding';
import { STATE_CAPITAL, type MakerRegion } from '@/lib/site/config';

type Admin = Pick<SessionUser, 'id' | 'role'>;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function assertAdmin(user: Admin) {
  if (user.role !== 'admin') throw new UserError('Only Off One can do that.');
}

export interface NewShopInput {
  name: string;
  slug: string;
  suburb: string;
  state: string;
  instagram: string;
  tagline: string;
  story: string;
  avatarUrl: string;
  bannerUrl: string;
  email: string;
}

const STATES = ['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];

/** Off One sets up a shop for a maker before they sign up: a draft with no owner yet. */
export async function createShop(admin: Admin, input: NewShopInput): Promise<string> {
  assertAdmin(admin);
  const name = sanitizeText(input.name).slice(0, 80);
  if (name.length < 2) throw new UserError('Give the shop a name.');
  const slug = slugify(input.slug || name);
  if (!/^[a-z0-9-]{2,60}$/.test(slug))
    throw new UserError('The shop link can use letters, numbers and dashes.');
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new UserError('Add the maker’s email for the invite.');
  for (const url of [input.avatarUrl, input.bannerUrl])
    if (url && !isOwnImageUrl(url) && !url.startsWith('/seed/'))
      throw new UserError('Upload the photos here rather than linking them.');
  const [taken] = await sql()<{ id: string }[]>`
    select id from public.makers where slug = ${slug}
    union all select maker_id from public.maker_slug_redirects where old_slug = ${slug}`;
  if (taken) throw new UserError('That shop link is taken.');
  const state = (STATES.includes(input.state) ? input.state : 'VIC') as MakerRegion;
  const [row] = await sql()<{ id: string }[]>`
    insert into public.makers (slug, display_name, tagline, story, location, city, state, instagram, avatar_url, cover_url,
      status, shop_status, created_by_admin, invite_email, source)
    values (${slug}, ${name}, ${sanitizeText(input.tagline).slice(0, 80) || null}, ${sanitizeText(input.story) || null},
      ${sanitizeText(input.suburb).slice(0, 60) || null}, ${STATE_CAPITAL[state]}, ${state},
      ${input.instagram.replace(/^@/, '').trim() || null}, ${input.avatarUrl || null}, ${input.bannerUrl || null},
      'draft', 'draft', true, ${email}, 'invite')
    returning id`;
  await sql()`
    insert into public.maker_shipping_rates (maker_id, region, standard_cents, express_cents, enabled)
    values (${row!.id}, 'au', 1200, null, true) on conflict do nothing`;
  await audit('shop.created', { type: 'maker', id: row!.id }, { slug }, admin.id);
  return row!.id;
}

/**
 * Sends (or re-sends) the claim link. The token is random and only its hash is stored; it works
 * once, for TERMS.inviteLinkDays days. The shop becomes "invited" and takes the next founding
 * number while places remain.
 */
export async function sendInvite(admin: Admin, makerId: string): Promise<{ url: string }> {
  assertAdmin(admin);
  const [shop] = await sql()<
    {
      id: string;
      displayName: string;
      email: string | null;
      shopStatus: string;
      foundingNumber: number | null;
      coverUrl: string | null;
      pieces: number;
    }[]
  >`
    select m.id, m.display_name, m.invite_email as email, m.shop_status, m.founding_number, m.cover_url,
      (select count(*) from public.products p where p.maker_id = m.id)::int as pieces
    from public.makers m where m.id = ${makerId}`;
  if (!shop) throw new UserError('Shop not found.');
  if (!shop.email) throw new UserError('Add the maker’s email first.');
  if (!['draft', 'invited'].includes(shop.shopStatus))
    throw new UserError('This shop has already been claimed.');

  const token = randomBytes(24).toString('base64url');
  await sql().begin(async (tx) => {
    // A new link replaces any unused one.
    await tx`update public.shop_invites set expires_at = least(expires_at, now()) where maker_id = ${makerId} and used_at is null`;
    await tx`
      insert into public.shop_invites (maker_id, token_hash, email, expires_at, created_by)
      values (${makerId}, ${hashToken(token)}, ${shop.email}, now() + make_interval(days => ${TERMS.inviteLinkDays}), ${admin.id})`;
    if (shop.foundingNumber === null) {
      const n = await nextFoundingNumber(tx);
      if (n) await tx`update public.makers set founding_number = ${n} where id = ${makerId}`;
    }
    await tx`update public.makers set shop_status = 'invited' where id = ${makerId}`;
  });
  const url = `${env().APP_URL}/claim/${token}`;
  await sendEmail(
    emails.shopInvite(shop.email, {
      makerId,
      shop: shop.displayName,
      url,
      pieces: shop.pieces,
      bannerUrl: shop.coverUrl,
    }),
  );
  await logShopEvent(makerId, 'invite_sent');
  await audit('shop.invited', { type: 'maker', id: makerId }, {}, admin.id);
  return { url };
}

export async function logShopEvent(makerId: string, event: string, meta?: Record<string, unknown>) {
  await sql()`
    insert into public.shop_events (maker_id, event, meta) values (${makerId}, ${event}, ${meta ? sql().json(meta as never) : null})`;
}

export type PipelineStage =
  | 'draft'
  | 'invited'
  | 'opened'
  | 'agreement signed'
  | 'Stripe connected'
  | 'live';

export interface PipelineRow {
  id: string;
  slug: string;
  displayName: string;
  email: string | null;
  instagram: string | null;
  foundingNumber: number | null;
  shopStatus: string;
  stage: PipelineStage;
  pieces: number;
  lastActivity: Date;
  lastEvent: string | null;
  claimStep: number;
}

/** Every shop Off One set up, furthest stage reached, and when it last moved. */
export async function getPipeline(): Promise<PipelineRow[]> {
  const rows = await sql()<
    (Omit<PipelineRow, 'stage'> & { opened: boolean; signed: boolean; connected: boolean })[]
  >`
    select m.id, m.slug, m.display_name, m.invite_email as email, m.instagram, m.founding_number, m.shop_status,
      m.claim_step,
      (select count(*) from public.products p where p.maker_id = m.id)::int as pieces,
      exists (select 1 from public.shop_invites i where i.maker_id = m.id and i.opened_at is not null) as opened,
      exists (select 1 from public.seller_agreements a where a.maker_id = m.id) as signed,
      m.stripe_charges_enabled as connected,
      greatest(m.created_at, m.updated_at,
        coalesce((select max(created_at) from public.shop_events e where e.maker_id = m.id), m.created_at)) as last_activity,
      (select event from public.shop_events e where e.maker_id = m.id order by created_at desc limit 1) as last_event
    from public.makers m
    where m.source = 'invite'
    order by case m.shop_status when 'invited' then 0 when 'draft' then 1 else 2 end, last_activity desc`;
  return rows.map(({ opened, signed, connected, ...r }) => ({
    ...r,
    stage:
      r.shopStatus === 'live' || r.shopStatus === 'holiday' || r.shopStatus === 'closed'
        ? 'live'
        : connected
          ? 'Stripe connected'
          : signed
            ? 'agreement signed'
            : opened
              ? 'opened'
              : r.shopStatus === 'invited'
                ? 'invited'
                : 'draft',
  }));
}

export async function getAdminShop(makerId: string) {
  const [shop] = await sql()<
    {
      id: string;
      slug: string;
      displayName: string;
      email: string | null;
      instagram: string | null;
      location: string | null;
      tagline: string | null;
      story: string | null;
      avatarUrl: string | null;
      coverUrl: string | null;
      shopStatus: string;
      foundingNumber: number | null;
      userId: string | null;
    }[]
  >`
    select id, slug, display_name, invite_email as email, instagram, location, tagline, story, avatar_url, cover_url,
      shop_status, founding_number, user_id
    from public.makers where id = ${makerId}`;
  if (!shop) return null;
  const pieces = await sql()<
    {
      id: string;
      title: string;
      status: string;
      priceCents: number;
      imageUrl: string | null;
      keepOnClaim: boolean;
    }[]
  >`
    select p.id, p.title, p.status, p.price_cents, p.keep_on_claim,
      (select public_url from public.product_images i where i.product_id = p.id order by sort_order limit 1) as image_url
    from public.products p where p.maker_id = ${makerId} order by p.created_at`;
  const invites = await sql()<
    {
      id: string;
      email: string;
      createdAt: Date;
      expiresAt: Date;
      openedAt: Date | null;
      usedAt: Date | null;
    }[]
  >`
    select id, email, created_at, expires_at, opened_at, used_at from public.shop_invites
    where maker_id = ${makerId} order by created_at desc limit 10`;
  const events = await sql()<{ event: string; createdAt: Date }[]>`
    select event, created_at from public.shop_events where maker_id = ${makerId} order by created_at desc limit 20`;
  return { shop, pieces, invites, events };
}
