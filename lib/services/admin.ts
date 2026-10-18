import { randomBytes } from 'node:crypto';
import { audit } from '@/lib/audit';
import { BRAND } from '@/lib/brand';
import { sql } from '@/lib/db';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { env } from '@/lib/env';
import { createLocalAuthUser, findAuthUserIdByEmail, signMagicToken } from '@/lib/auth/local';
import { UserError } from './errors';

/**
 * Admin-only operations. Callers must have passed requireAdmin(); these run on the service
 * connection and record an audit event for every change.
 */

export async function createSeller(
  actorId: string,
  input: { email: string; displayName: string; slug: string; city: string; state: string },
): Promise<string> {
  const [taken] = await sql()`select 1 from public.makers where slug = ${input.slug}`;
  if (taken) throw new UserError('That shop URL is already taken.');
  const [existingUser] = await sql()<
    { id: string; role: string }[]
  >`select id, role from public.users where lower(email) = lower(${input.email})`;
  if (existingUser && existingUser.role !== 'buyer')
    throw new UserError('That email already belongs to a seller or admin.');

  let userId = existingUser?.id ?? null;
  let inviteLink: string | null = null;
  if (!userId) {
    if (env().AUTH_DRIVER === 'supabase') {
      const { supabaseAdmin } = await import('@/lib/auth/supabase');
      const { data, error } = await supabaseAdmin().auth.admin.inviteUserByEmail(input.email, {
        redirectTo: `${env().APP_URL}/auth/callback?next=/seller/onboarding`,
      });
      if (error || !data.user) throw new Error(error?.message ?? 'Invite failed');
      userId = data.user.id;
    } else {
      userId =
        (await findAuthUserIdByEmail(input.email)) ??
        (await createLocalAuthUser(input.email, randomBytes(24).toString('base64url')));
      inviteLink = `${env().APP_URL}/auth/magic?token=${await signMagicToken(userId)}&next=/seller/onboarding`;
    }
  }

  const makerId = await sql().begin(async (tx) => {
    await tx`
      insert into public.users (id, auth_user_id, email, display_name, role) values (${userId}, ${userId}, ${input.email}, ${input.displayName}, 'seller')
      on conflict (id) do update set role = 'seller'`;
    const [m] = await tx<{ id: string }[]>`
      insert into public.makers (user_id, slug, display_name, city, state, location, status)
      values (${userId}, ${input.slug}, ${input.displayName}, ${input.city}, ${input.state}, ${input.city}, 'draft') returning id`;
    return m!.id;
  });
  await sendEmail({
    to: input.email,
    template: 'seller_invite',
    subject: `You’re invited to sell on ${BRAND.name}`,
    text: `Hi ${input.displayName},\n\nWe’d love to have you on ${BRAND.name}. Set up your maker profile, shipping and payouts here:\n\n${
      inviteLink ?? `${env().APP_URL}/login?next=/seller/onboarding`
    }\n\nOnce your profile is approved you can submit listings.`,
    related: { type: 'maker', id: makerId },
  });
  await audit(
    'admin.seller_created',
    { type: 'maker', id: makerId },
    { email: input.email },
    actorId,
  );
  return makerId;
}

export async function setMakerStatus(
  actorId: string,
  makerId: string,
  status: 'approved' | 'paused' | 'pending',
  reason?: string,
) {
  const [m] = await sql()<{ email: string; displayName: string }[]>`
    update public.makers set status = ${status}::maker_status, rejection_reason = ${reason ?? null},
      approved_at = case when ${status} = 'approved' then coalesce(approved_at, now()) else approved_at end
    from public.users u where public.makers.id = ${makerId} and u.id = public.makers.user_id
    returning u.email, public.makers.display_name`;
  if (!m) throw new UserError('Maker not found.');
  if (status === 'approved') await sendEmail(emails.makerApproved(m.email, m.displayName));
  await audit(`admin.maker_${status}`, { type: 'maker', id: makerId }, { reason }, actorId);
}

export async function setListingStatus(
  actorId: string,
  productId: string,
  status: 'approved' | 'rejected' | 'archived',
  reason?: string,
) {
  const [p] = await sql()<{ title: string; email: string }[]>`
    update public.products p set status = ${status}::product_status, rejection_reason = ${reason ?? null},
      approved_at = case when ${status} = 'approved' then now() else p.approved_at end,
      is_featured = case when ${status} = 'approved' then p.is_featured else false end
    from public.makers m join public.users u on u.id = m.user_id
    where p.id = ${productId} and m.id = p.maker_id
    returning p.title, u.email`;
  if (!p) throw new UserError('Listing not found.');
  if (status !== 'archived')
    await sendEmail(emails.listingDecision(p.email, p.title, status === 'approved', reason));
  await audit(`admin.listing_${status}`, { type: 'product', id: productId }, { reason }, actorId);
}

export async function setFeatured(actorId: string, productId: string, featured: boolean) {
  await sql()`update public.products set is_featured = ${featured} where id = ${productId} and status = 'approved'`;
  await audit('admin.listing_featured', { type: 'product', id: productId }, { featured }, actorId);
}

export async function saveCollection(
  actorId: string,
  input: {
    id?: string;
    slug: string;
    title: string;
    subtitle?: string;
    description?: string;
    sortOrder: number;
    isActive: boolean;
  },
) {
  const [row] = input.id
    ? await sql()<{ id: string }[]>`
        update public.collections set slug = ${input.slug}, title = ${input.title}, subtitle = ${input.subtitle ?? null},
          description = ${input.description ?? null}, sort_order = ${input.sortOrder}, is_active = ${input.isActive}
        where id = ${input.id} returning id`
    : await sql()<{ id: string }[]>`
        insert into public.collections (slug, title, subtitle, description, sort_order, is_active)
        values (${input.slug}, ${input.title}, ${input.subtitle ?? null}, ${input.description ?? null}, ${input.sortOrder}, ${input.isActive})
        returning id`;
  await audit(
    'admin.collection_saved',
    { type: 'collection', id: row?.id },
    { slug: input.slug },
    actorId,
  );
  return row!.id;
}

export async function setCollectionProduct(
  actorId: string,
  collectionId: string,
  productSlug: string,
  add: boolean,
) {
  const [p] = await sql()<
    { id: string }[]
  >`select id from public.products where slug = ${productSlug}`;
  if (!p) throw new UserError('No listing with that URL slug.');
  if (add) {
    await sql()`insert into public.collection_products (collection_id, product_id, sort_order)
      values (${collectionId}, ${p.id}, (select coalesce(max(sort_order), 0) + 1 from public.collection_products where collection_id = ${collectionId}))
      on conflict do nothing`;
  } else {
    await sql()`delete from public.collection_products where collection_id = ${collectionId} and product_id = ${p.id}`;
  }
  await audit(
    'admin.collection_products',
    { type: 'collection', id: collectionId },
    { productSlug, add },
    actorId,
  );
}

export async function savePlacement(
  actorId: string,
  input: {
    id: string;
    title: string;
    subtitle?: string;
    href: string;
    imageUrl?: string;
    isActive: boolean;
  },
) {
  if (!input.href.startsWith('/'))
    throw new UserError('Links must be internal paths, e.g. /collections/statement-dresses');
  await sql()`
    update public.editorial_placements set title = ${input.title}, subtitle = ${input.subtitle ?? null}, href = ${input.href},
      image_url = coalesce(${input.imageUrl ?? null}, image_url), is_active = ${input.isActive}
    where id = ${input.id}`;
  await audit('admin.placement_saved', { type: 'editorial_placement', id: input.id }, {}, actorId);
}

export async function assignCommission(actorId: string, requestId: string, makerId: string) {
  const [m] = await sql()<{ email: string }[]>`
    select u.email from public.makers m join public.users u on u.id = m.user_id where m.id = ${makerId} and m.status = 'approved'`;
  if (!m) throw new UserError('Choose an approved maker.');
  const [req] = await sql()<
    { garmentType: string; budgetMinCents: number; budgetMaxCents: number }[]
  >`
    update public.commission_requests set maker_id = ${makerId}, status = 'submitted' where id = ${requestId}
    returning garment_type, budget_min_cents, budget_max_cents`;
  if (!req) throw new UserError('Request not found.');
  await sendEmail(
    emails.commissionRequestMaker(
      m.email,
      requestId,
      req.garmentType,
      `A$${req.budgetMinCents / 100}–A$${req.budgetMaxCents / 100}`,
    ),
  );
  await audit(
    'admin.commission_assigned',
    { type: 'commission_request', id: requestId },
    { makerId },
    actorId,
  );
}

export async function updateCommissionAdmin(
  actorId: string,
  requestId: string,
  status: string,
  adminNotes?: string,
) {
  await sql()`update public.commission_requests set status = ${status}::commission_status, admin_notes = coalesce(${adminNotes ?? null}, admin_notes)
              where id = ${requestId}`;
  await audit(
    'admin.commission_status',
    { type: 'commission_request', id: requestId },
    { status },
    actorId,
  );
}

export async function sendManualEmail(
  actorId: string,
  input: { to: string; subject: string; body: string },
) {
  await sendEmail({ to: input.to, template: 'manual', subject: input.subject, text: input.body });
  await audit(
    'admin.email_sent',
    { type: 'email', id: input.to },
    { subject: input.subject },
    actorId,
  );
}

export interface Metrics {
  gmvCents: number;
  orders: number;
  platformFeeCents: number;
  takeRate: number;
  activeListings: number;
  activeMakers: number;
  conversionRate: number;
  repeatPurchaseRate: number;
  refundRate: number;
  refundedCents: number;
  openDisputes: number;
  pendingMakers: number;
  pendingListings: number;
  flaggedMessages: number;
}

export async function marketplaceMetrics(days = 30): Promise<Metrics> {
  type Raw = Omit<Metrics, 'takeRate' | 'conversionRate' | 'repeatPurchaseRate' | 'refundRate'> & {
    subtotalCents: number;
    sessions: number;
    buyers: number;
    repeatBuyers: number;
  };
  const [m] = await sql()<Raw[]>`
    with paid as (
      select * from public.orders
      where status in ('paid', 'partially_refunded', 'refunded') and created_at > now() - make_interval(days => ${days})
    ), buyers as (
      select coalesce(buyer_user_id::text, lower(buyer_email)) as buyer, count(*) as n
      from public.orders where status in ('paid', 'partially_refunded', 'refunded') group by 1
    )
    select
      coalesce((select sum(total_cents) from paid), 0)::int as gmv_cents,
      (select count(*) from paid)::int as orders,
      coalesce((select sum(platform_fee_total_cents) from paid), 0)::int as platform_fee_cents,
      coalesce((select sum(subtotal_cents) from paid), 0)::int as subtotal_cents,
      coalesce((select sum(refunded_cents) from paid), 0)::int as refunded_cents,
      (select count(*) from public.products p join public.makers mk on mk.id = p.maker_id
        where p.status = 'approved' and mk.status = 'approved')::int as active_listings,
      (select count(*) from public.makers mk where mk.status = 'approved'
        and exists (select 1 from public.products p where p.maker_id = mk.id and p.status = 'approved'))::int as active_makers,
      (select count(distinct viewer_key) from public.product_views where created_at > now() - make_interval(days => ${days}))::int as sessions,
      (select count(*) from buyers)::int as buyers,
      (select count(*) from buyers where n >= 2)::int as repeat_buyers,
      (select count(*) from public.disputes where status not in ('won', 'lost'))::int as open_disputes,
      (select count(*) from public.makers where status = 'pending')::int as pending_makers,
      (select count(*) from public.products where status = 'pending')::int as pending_listings,
      (select count(*) from public.messages where is_flagged and created_at > now() - interval '30 days')::int as flagged_messages`;
  const r = m!;
  return {
    gmvCents: r.gmvCents,
    orders: r.orders,
    platformFeeCents: r.platformFeeCents,
    takeRate: r.subtotalCents ? r.platformFeeCents / r.subtotalCents : 0,
    activeListings: r.activeListings,
    activeMakers: r.activeMakers,
    conversionRate: r.sessions ? r.orders / r.sessions : 0,
    repeatPurchaseRate: r.buyers ? r.repeatBuyers / r.buyers : 0,
    refundRate: r.gmvCents ? r.refundedCents / r.gmvCents : 0,
    refundedCents: r.refundedCents,
    openDisputes: r.openDisputes,
    pendingMakers: r.pendingMakers,
    pendingListings: r.pendingListings,
    flaggedMessages: r.flaggedMessages,
  };
}

export async function reorderCollections(actorId: string, ids: string[]) {
  await sql().begin(async (tx) => {
    for (const [i, id] of ids.entries())
      await tx`update public.collections set sort_order = ${i} where id = ${id}`;
  });
  await audit('admin.collections_reordered', { type: 'collection' }, { ids }, actorId);
}

export async function setCollectionHero(actorId: string, collectionId: string, url: string) {
  await sql()`update public.collections set hero_image_url = ${url} where id = ${collectionId}`;
  await audit('admin.collection_hero', { type: 'collection', id: collectionId }, { url }, actorId);
}
