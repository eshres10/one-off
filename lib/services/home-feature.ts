import { audit } from '@/lib/audit';
import { sql } from '@/lib/db';
import { UserError } from './errors';

export interface FeaturePiece {
  id: string;
  slug: string;
  title: string;
  priceCents: number;
  imageUrl: string;
}

export interface AdminFeature {
  id: string;
  makerId: string;
  makerName: string;
  makerSlug: string;
  headline: string | null;
  blurb: string | null;
  startsAt: Date;
  endsAt: Date | null;
  /** Pieces in rotation order; ones no longer approved are dropped. */
  pieces: FeaturePiece[];
}

export interface AdminHomeFeature {
  active: AdminFeature | null;
  makers: { id: string; name: string }[];
  selectedMakerId: string | null;
  /** Approved pieces of the selected maker that have a real (non-placeholder) photo. */
  pieces: FeaturePiece[];
}

const PIECES = (makerId: string) => sql()<FeaturePiece[]>`
  select p.id, p.slug, p.title, p.price_cents, img.public_url as image_url
  from public.products p
  join lateral (
    select public_url from public.product_images i
    where i.product_id = p.id and not i.is_placeholder order by i.sort_order, i.created_at limit 1
  ) img on true
  where p.maker_id = ${makerId} and p.status = 'approved'
  order by p.created_at, p.title`;

/** What the admin card shows: the feature running now, live makers, and the chosen maker's pieces. */
export async function adminHomeFeature(makerParam?: string | null): Promise<AdminHomeFeature> {
  const [row] = await sql()<(Omit<AdminFeature, 'pieces'> & { productIds: string[] })[]>`
    select hf.id, hf.maker_id, m.display_name as maker_name, m.slug as maker_slug,
           hf.headline, hf.blurb, hf.starts_at, hf.ends_at, hf.product_ids
    from public.home_features hf join public.makers m on m.id = hf.maker_id
    where hf.is_active and hf.starts_at <= now() and (hf.ends_at is null or hf.ends_at > now())
    order by hf.starts_at desc limit 1`;
  let active: AdminFeature | null = null;
  if (row) {
    const rows = await sql()<FeaturePiece[]>`
      select p.id, p.slug, p.title, p.price_cents, img.public_url as image_url
      from public.products p
      join lateral (
        select public_url from public.product_images i
        where i.product_id = p.id and not i.is_placeholder order by i.sort_order, i.created_at limit 1
      ) img on true
      where p.id = any(${row.productIds}::uuid[]) and p.status = 'approved'`;
    const by = new Map(rows.map((r) => [r.id, r]));
    const { productIds, ...rest } = row;
    active = {
      ...rest,
      pieces: productIds.map((id) => by.get(id)).filter((p): p is FeaturePiece => Boolean(p)),
    };
  }
  const makers = await sql()<{ id: string; name: string }[]>`
    select id, display_name as name from public.makers where shop_status = 'live'
    order by display_name`;
  const selected =
    makers.find((m) => m.id === makerParam)?.id ??
    makers.find((m) => m.id === active?.makerId)?.id ??
    null;
  return {
    active,
    makers,
    selectedMakerId: selected,
    pieces: selected ? await PIECES(selected) : [],
  };
}

export interface FeatureInput {
  makerId: string;
  productIds: string[];
  headline?: string | null;
  blurb?: string | null;
  /** YYYY-MM-DD, Melbourne time. */
  startsOn?: string | null;
  endsOn?: string | null;
}

/** Features a maker on the homepage and switches the previous feature off. */
export async function saveHomeFeature(actorId: string, input: FeatureInput) {
  const ids = [...new Set(input.productIds)];
  if (ids.length < 2 || ids.length > 10)
    throw new UserError('Choose between 2 and 10 pieces to feature.');
  const [maker] = await sql()<{ shopStatus: string }[]>`
    select shop_status from public.makers where id = ${input.makerId}`;
  if (!maker || maker.shopStatus !== 'live')
    throw new UserError('Only makers whose shop is live can be featured.');
  const ok = await PIECES(input.makerId);
  const usable = new Set(ok.map((p) => p.id));
  if (!ids.every((id) => usable.has(id)))
    throw new UserError(
      'Every piece must belong to this maker, be approved and have a real photo.',
    );
  if (input.startsOn && input.endsOn && input.endsOn < input.startsOn)
    throw new UserError('The end date is before the start date.');
  const created = await sql().begin(async (tx) => {
    await tx`update public.home_features set is_active = false where is_active`;
    const [r] = await tx<{ id: string }[]>`
      insert into public.home_features (maker_id, headline, blurb, product_ids, starts_at, ends_at)
      values (
        ${input.makerId}, ${input.headline?.trim() || null}, ${input.blurb?.trim() || null},
        ${ids}::uuid[],
        coalesce((${input.startsOn || null}::date)::timestamp at time zone 'Australia/Melbourne', now()),
        -- The end date is inclusive: it ends as that day finishes.
        ((${input.endsOn || null}::date + 1)::timestamp at time zone 'Australia/Melbourne'))
      returning id`;
    return r!;
  });
  await audit(
    'admin.home_feature_set',
    { type: 'home_feature', id: created.id },
    { makerId: input.makerId, pieces: ids.length },
    actorId,
  );
  return created.id;
}

/** Takes the current feature down: the original hero shows again. */
export async function stopHomeFeature(actorId: string, id: string) {
  await sql()`update public.home_features set is_active = false where id = ${id}`;
  await audit('admin.home_feature_stopped', { type: 'home_feature', id }, {}, actorId);
}
