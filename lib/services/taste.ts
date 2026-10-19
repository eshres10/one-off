import { sql, withUser } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { reportError } from '@/lib/log';
import {
  OCCASIONS,
  STYLE_GROUPS,
  isStyleTag,
  leaningLine,
  tasteFromPicks,
  topTags,
  type StyleTag,
  type TasteWeights,
} from '@/lib/taste/tags';

type User = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

export interface CustomerPrefs {
  sizes: string[];
  heightBand: string | null;
  occasions: string[];
  tasteTags: TasteWeights;
  tastePicks: string[];
  onboardingStep: number;
  onboardingCompletedAt: Date | null;
}

const EMPTY: CustomerPrefs = {
  sizes: [],
  heightBand: null,
  occasions: [],
  tasteTags: {},
  tastePicks: [],
  onboardingStep: 0,
  onboardingCompletedAt: null,
};

export async function getPrefs(userId: string): Promise<CustomerPrefs> {
  const [row] = await sql()<CustomerPrefs[]>`
    select sizes, height_band, occasions, taste_tags, taste_picks::text[] as taste_picks, onboarding_step,
      onboarding_completed_at
    from public.customer_prefs where user_id = ${userId}`;
  return row ?? { ...EMPTY };
}

/** Saves onboarding answers as they're made, so leaving midway keeps progress. */
export async function savePrefs(
  user: User,
  patch: Partial<Pick<CustomerPrefs, 'sizes' | 'heightBand' | 'occasions' | 'onboardingStep'>> & {
    completed?: boolean;
  },
) {
  await withUser(user, async (db) => {
    await db`insert into public.customer_prefs (user_id) values (${user.id}) on conflict (user_id) do nothing`;
    await db`
      update public.customer_prefs set
        sizes = coalesce(${patch.sizes ?? null}::text[], sizes),
        height_band = case when ${patch.heightBand !== undefined} then ${patch.heightBand ?? null} else height_band end,
        occasions = coalesce(${patch.occasions ?? null}::text[], occasions),
        onboarding_step = greatest(onboarding_step, coalesce(${patch.onboardingStep ?? null}::int, 0)),
        onboarding_completed_at = case when ${patch.completed ?? false} then coalesce(onboarding_completed_at, now())
          else onboarding_completed_at end
      where user_id = ${user.id}`;
  });
}

/**
 * Taste events after onboarding: saves +1, add to bag +2, purchase +3, a long quick view +0.25.
 * Never breaks the calling flow.
 */
export async function bumpTaste(
  userId: string | null | undefined,
  productId: string,
  weight: number,
) {
  if (!userId) return;
  try {
    await sql()`select public.bump_taste(${userId}::uuid, ${productId}::uuid, ${weight}::numeric)`;
  } catch (err) {
    reportError(err, { where: 'bump_taste' });
  }
}

/** The two tags each maker uses most across their live pieces. */
async function makerCommonTags(makerIds: string[]): Promise<Map<string, string[]>> {
  if (!makerIds.length) return new Map();
  const rows = await sql()<{ makerId: string; tags: string[] }[]>`
    select maker_id, (array_agg(tag order by n desc, tag))[1:2] as tags from (
      select p.maker_id, t as tag, count(*) as n from public.products p, unnest(p.style_tags) t
      where p.maker_id = any(${makerIds}::uuid[]) and p.status = 'approved'
      group by 1, 2) x
    group by maker_id`;
  return new Map(rows.map((r) => [r.makerId, r.tags]));
}

/**
 * The taste picker: toggles a pick, mirrors it in Saved, and rebuilds the taste profile from
 * all picks so far.
 */
export async function setPick(user: User, productId: string, picked: boolean) {
  await withUser(user, async (db) => {
    await db`insert into public.customer_prefs (user_id) values (${user.id}) on conflict (user_id) do nothing`;
    await db`
      update public.customer_prefs set taste_picks = case when ${picked}
        then array(select distinct unnest(array_append(taste_picks, ${productId}::uuid)))
        else array_remove(taste_picks, ${productId}::uuid) end
      where user_id = ${user.id}`;
    if (picked)
      await db`
        insert into public.saved_items (user_id, product_id, price_at_save)
        select ${user.id}, p.id, p.price_cents from public.products p where p.id = ${productId}
        on conflict do nothing`;
    else
      await db`delete from public.saved_items where user_id = ${user.id} and product_id = ${productId}`;
  });
  return rebuildTasteFromPicks(user);
}

export async function rebuildTasteFromPicks(user: User): Promise<TasteWeights> {
  const picks = await sql()<{ id: string; makerId: string; tags: string[] }[]>`
    select p.id, p.maker_id, p.style_tags as tags from public.customer_prefs cp
    join public.products p on p.id = any(cp.taste_picks)
    where cp.user_id = ${user.id}`;
  const common = await makerCommonTags([...new Set(picks.map((p) => p.makerId))]);
  const weights = tasteFromPicks(
    picks.map((p) => ({ tags: p.tags, makerCommonTags: common.get(p.makerId) ?? [] })),
  );
  await withUser(user, async (db) => {
    await db`
      update public.customer_prefs set taste_tags = ${db.json(weights as never)}, taste_updated_at = now()
      where user_id = ${user.id}`;
  });
  return weights;
}

/** Account → Your style: drop a tag from the profile. */
export async function removeTasteTag(user: User, tag: string) {
  if (!isStyleTag(tag)) return;
  await withUser(user, async (db) => {
    await db`update public.customer_prefs set taste_tags = taste_tags - ${tag} where user_id = ${user.id}`;
  });
}

export interface PickerPiece {
  id: string;
  slug: string;
  title: string;
  makerName: string;
  imageUrl: string | null;
  width: number | null;
  height: number | null;
  tags: StyleTag[];
}

/** Small deterministic shuffle so the picker is varied but stable for a given seed. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 16807) % 2147483647;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483647, 7);

/**
 * Twelve live pieces for the taste picker, chosen for variety: at least one per mood and per
 * colour group, preferring pieces in the shopper's sizes, never repeating ones already shown.
 */
export async function pickerPieces(
  userId: string,
  exclude: string[] = [],
  count = 12,
): Promise<PickerPiece[]> {
  const prefs = await getPrefs(userId);
  const rows = await sql()<(PickerPiece & { inSize: boolean })[]>`
    select p.id, p.slug, p.title, m.display_name as maker_name, p.style_tags as tags,
      img.public_url as image_url, img.width, img.height,
      (cardinality(${prefs.sizes}::text[]) = 0 or exists (
        select 1 from public.product_variants v where v.product_id = p.id and v.is_active
          and v.size = any(${prefs.sizes}::text[]) and (v.stock_quantity > 0 or p.product_type = 'made_to_order'))) as in_size
    from public.products p
    join public.makers m on m.id = p.maker_id
    left join lateral (
      select public_url, width, height from public.product_images i where i.product_id = p.id
      order by sort_order limit 1) img on true
    where p.status = 'approved' and m.status = 'approved' and cardinality(p.style_tags) > 0
      and img.public_url is not null and not (p.id = any(${exclude}::uuid[]))`;
  // Real photos first (placeholder drawings only fill in), then pieces in the shopper's sizes.
  const photo = (p: { imageUrl: string | null }) => (p.imageUrl?.endsWith('.svg') ? 0 : 1);
  const pool = shuffle(rows, seedOf(`${userId}:${exclude.length}`)).sort(
    (a, b) => photo(b) - photo(a) || Number(b.inSize) - Number(a.inSize),
  );
  const chosen: typeof pool = [];
  const take = (p: (typeof pool)[number] | undefined) => {
    if (p && !chosen.includes(p) && chosen.length < count) chosen.push(p);
  };
  for (const tag of [...STYLE_GROUPS.mood, ...STYLE_GROUPS.colour])
    if (!chosen.some((c) => c.tags.includes(tag)))
      take(pool.find((p) => p.tags.includes(tag) && !chosen.includes(p) && photo(p)));
  for (const p of pool) take(p);
  return shuffle(chosen, seedOf(userId)).map(({ inSize: _i, ...p }) => p);
}

/** Onboarding occasions → the occasions pieces are tagged with. */
const OCCASION_MATCH: Record<string, string[]> = {
  weddings: ['wedding guest'],
  racing: ['races'],
  'black-tie': ['evening'],
  everyday: [],
  holiday: [],
  work: [],
};

export interface SuggestedMaker {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  suburb: string | null;
  makes: string;
  pieces: Array<{ slug: string; imageUrl: string | null }>;
  following: boolean;
}

/** Three or four makers for the shopper, ranked by how their pieces match taste and occasions. */
export async function suggestedMakers(userId: string, limit = 4): Promise<SuggestedMaker[]> {
  const prefs = await getPrefs(userId);
  const occasionTags = prefs.occasions.flatMap((o) => OCCASION_MATCH[o] ?? []);
  const rows = await sql()<(SuggestedMaker & { tagCounts: Record<string, number>; occ: number })[]>`
    select m.id, m.slug, m.display_name, m.avatar_url,
      nullif(trim(split_part(coalesce(m.location, m.city, ''), ',', 1)), '') as suburb,
      coalesce((select string_agg(c, ', ') from (
        select lower(p.category) as c from public.products p where p.maker_id = m.id and p.status = 'approved'
        group by 1 order by count(*) desc limit 2) x), 'clothes') as makes,
      coalesce((select jsonb_object_agg(t, n) from (
        select t, count(*) as n from public.products p, unnest(p.style_tags) t
        where p.maker_id = m.id and p.status = 'approved' group by t) y), '{}'::jsonb) as tag_counts,
      (select count(*) from public.products p where p.maker_id = m.id and p.status = 'approved'
        and p.occasions && ${occasionTags}::text[])::int as occ,
      coalesce((select json_agg(z) from (
        select p.slug, (select i.public_url from public.product_images i where i.product_id = p.id
          order by i.sort_order limit 1) as "imageUrl"
        from public.products p where p.maker_id = m.id and p.status = 'approved'
        order by p.is_featured desc, p.save_count desc limit 3) z), '[]'::json) as pieces,
      exists (select 1 from public.maker_follows f where f.maker_id = m.id and f.user_id = ${userId}) as following
    from public.makers m
    where m.status = 'approved'
      and (select count(*) from public.products p where p.maker_id = m.id and p.status = 'approved') >= 3`;
  const scored = rows.map((r) => {
    const taste = Object.entries(r.tagCounts).reduce(
      (s, [t, n]) => s + (prefs.tasteTags[t as StyleTag] ?? 0) * Math.sqrt(n),
      0,
    );
    return { r, score: taste + r.occ * 0.75 };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.r.displayName.localeCompare(b.r.displayName))
    .slice(0, limit)
    .map(({ r: { tagCounts: _t, occ: _o, ...m } }) => m);
}

/** "Leaning satin, minimal, evening. Size 10 first · weddings, racing · following 1 maker." */
export async function readBack(userId: string): Promise<string> {
  const prefs = await getPrefs(userId);
  const [f] = await sql()<{ n: number }[]>`
    select count(*)::int as n from public.maker_follows where user_id = ${userId}`;
  const sizes = [...prefs.sizes].sort((a, b) => Number(a) - Number(b));
  const occasions = prefs.occasions
    .map((o) => OCCASIONS.find((x) => x.value === o)?.label.toLowerCase())
    .filter(Boolean);
  const parts = [
    sizes.length ? `Size ${sizes[0]} first` : null,
    occasions.length ? occasions.join(', ') : null,
    f && f.n > 0 ? `following ${f.n} ${f.n === 1 ? 'maker' : 'makers'}` : null,
  ].filter(Boolean);
  return [leaningLine(prefs.tasteTags), parts.length ? `${parts.join(' · ')}.` : null]
    .filter(Boolean)
    .join(' ');
}

export { topTags };
