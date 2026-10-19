import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { getDiscoverPage } from '@/lib/queries/discover';
import { parseDiscover } from '@/lib/discover/params';
import { bumpTaste, pickerPieces, setPick, suggestedMakers } from '@/lib/services/taste';
import { STYLE_GROUPS, tasteFromPicks, topTags } from '@/lib/taste/tags';
import { buyer } from './helpers';

afterAll(closeDb);

describe('taste profile', () => {
  it('builds from picks: +1 per tag, +0.5 for the maker’s common tags', () => {
    const w = tasteFromPicks([
      { tags: ['Satin', 'Minimal'], makerCommonTags: ['Satin', 'Evening'] },
      { tags: ['Satin', 'Neutrals'], makerCommonTags: [] },
    ]);
    expect(w).toEqual({ Satin: 2, Minimal: 1, Evening: 0.5, Neutrals: 1 });
    expect(topTags(w, 2)).toEqual(['Satin', 'Minimal']);
  });

  it('picks are saved, mirrored in Saved, and fill taste_tags', async () => {
    const u = buyer(5);
    await sql()`delete from public.customer_prefs where user_id = ${u.id}`;
    const pieces = await pickerPieces(u.id);
    expect(pieces).toHaveLength(12);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(12);
    // Variety: every mood and colour group appears where the catalogue has one.
    for (const tag of [...STYLE_GROUPS.mood, ...STYLE_GROUPS.colour]) {
      const [any] =
        await sql()`select 1 from public.products where status = 'approved' and ${tag} = any(style_tags)`;
      if (any)
        expect(
          pieces.some((p) => p.tags.includes(tag)),
          tag,
        ).toBe(true);
    }
    for (const p of pieces.slice(0, 5)) await setPick(u, p.id, true);
    const [prefs] = await sql()<{ tasteTags: Record<string, number>; picks: number }[]>`
      select taste_tags, cardinality(taste_picks) as picks from public.customer_prefs where user_id = ${u.id}`;
    expect(prefs!.picks).toBe(5);
    expect(Object.keys(prefs!.tasteTags).length).toBeGreaterThan(0);
    const [saved] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.saved_items where user_id = ${u.id}
      and product_id = any(${pieces.slice(0, 5).map((p) => p.id)}::uuid[])`;
    expect(saved!.n).toBe(5);
    // "Show me different pieces" never repeats.
    const more = await pickerPieces(
      u.id,
      pieces.map((p) => p.id),
    );
    expect(more.some((p) => pieces.some((q) => q.id === p.id))).toBe(false);
    expect((await suggestedMakers(u.id, 4)).length).toBeGreaterThanOrEqual(3);
  });

  it('later behaviour adds weight (saves +1, bag +2, purchase +3)', async () => {
    const u = buyer(6);
    await sql()`delete from public.customer_prefs where user_id = ${u.id}`;
    const [p] = await sql()<{ id: string; tags: string[] }[]>`
      select id, style_tags as tags from public.products where cardinality(style_tags) > 0 limit 1`;
    await bumpTaste(u.id, p!.id, 1);
    await bumpTaste(u.id, p!.id, 2);
    const [row] = await sql()<{ t: Record<string, number> }[]>`
      select taste_tags as t from public.customer_prefs where user_id = ${u.id}`;
    for (const tag of p!.tags) expect(row!.t[tag]).toBeCloseTo(3, 1);
  });
});

describe('Relevant ranking', () => {
  it('ranks satin and minimal pieces higher for a satin + minimal shopper', async () => {
    const u = buyer(7);
    await sql()`
      insert into public.customer_prefs (user_id, taste_tags) values (${u.id}, '{"Satin": 5, "Minimal": 5}')
      on conflict (user_id) do update set taste_tags = excluded.taste_tags`;
    const params = parseDiscover(new URLSearchParams());
    const mine = (await getDiscoverPage(params, null, u.id)).items.filter(
      (i) => i.kind === 'piece',
    );
    const anon = (await getDiscoverPage(params, null, null)).items.filter(
      (i) => i.kind === 'piece',
    );
    const tagsOf = async (ids: string[]) =>
      sql()<
        { id: string; tags: string[] }[]
      >`select id, style_tags as tags from public.products where id = any(${ids}::uuid[])`;
    const score = async (items: Array<{ id: string }>) => {
      const rows = await tagsOf(items.slice(0, 12).map((i) => i.id));
      return rows.filter((r) => r.tags.includes('Satin') || r.tags.includes('Minimal')).length;
    };
    expect(await score(mine)).toBeGreaterThan(await score(anon));
  });
});
