import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, withAnon, withUser } from '@/lib/db';
import { loadHomeFeature } from '@/lib/queries/home-feature';
import {
  FIXTURE_MAKER_ID,
  FIXTURE_PIECES,
  installFeaturedFixture,
  pieceId,
  removeFeaturedFixture,
} from '../../scripts/featured-fixture';
import { ADMIN, buyer } from './helpers';

const ids = FIXTURE_PIECES.map((p) => pieceId(p.slug));

describe('homepage featured maker', () => {
  beforeAll(async () => {
    await sql()`delete from public.home_features`;
    await installFeaturedFixture(sql());
  });
  afterAll(async () => {
    await removeFeaturedFixture(sql());
  });

  it('returns the maker and the pieces in the saved order, with their first photo', async () => {
    const f = await loadHomeFeature();
    expect(f?.maker).toMatchObject({
      slug: 'dramalicious',
      name: 'Dramalicious',
      city: 'Melbourne',
      state: 'VIC',
    });
    expect(f?.headline).toBe('Dramalicious');
    expect(f?.blurb).toContain('Satin slips');
    expect(f?.slides.map((s) => s.slug)).toEqual(FIXTURE_PIECES.map((p) => p.slug));
    expect(f?.slides[0]).toMatchObject({
      title: 'Sparkle dress',
      priceCents: 32000,
      src: '/preview/dramalicious/sparkle-dress-1.jpg',
      width: 1200,
      height: 1600,
    });
  });

  it('uses the headline and blurb overrides when set', async () => {
    await sql()`update public.home_features set headline = 'The Dramalicious edit', blurb = 'New in.'
      where maker_id = ${FIXTURE_MAKER_ID}`;
    const f = await loadHomeFeature();
    expect(f?.headline).toBe('The Dramalicious edit');
    expect(f?.blurb).toBe('New in.');
    await sql()`update public.home_features set headline = null, blurb = null where maker_id = ${FIXTURE_MAKER_ID}`;
  });

  it('skips pieces that are no longer approved, and returns null under two pieces', async () => {
    await sql()`update public.products set status = 'draft' where id = ${ids[1]!}`;
    const f = await loadHomeFeature();
    expect(f?.slides.map((s) => s.slug)).not.toContain('trench-coat');
    expect(f?.slides).toHaveLength(7);
    await sql()`update public.products set status = 'draft' where id = any(${ids.slice(2)}::uuid[])`;
    expect(await loadHomeFeature()).toBeNull();
    await sql()`update public.products set status = 'approved' where id = any(${ids}::uuid[])`;
  });

  it('returns null when the feature is inactive, not started or ended', async () => {
    for (const set of [
      sql()`update public.home_features set is_active = false where maker_id = ${FIXTURE_MAKER_ID}`,
      sql()`update public.home_features set is_active = true, starts_at = now() + interval '1 day' where maker_id = ${FIXTURE_MAKER_ID}`,
      sql()`update public.home_features set starts_at = now() - interval '2 days', ends_at = now() - interval '1 day' where maker_id = ${FIXTURE_MAKER_ID}`,
    ]) {
      await set;
      expect(await loadHomeFeature()).toBeNull();
    }
    await sql()`update public.home_features set is_active = true, starts_at = now() - interval '1 minute', ends_at = null where maker_id = ${FIXTURE_MAKER_ID}`;
    expect(await loadHomeFeature()).not.toBeNull();
  });

  it('only shows a live maker', async () => {
    await sql()`update public.makers set shop_status = 'holiday' where id = ${FIXTURE_MAKER_ID}`;
    expect(await loadHomeFeature()).toBeNull();
    await sql()`update public.makers set shop_status = 'live' where id = ${FIXTURE_MAKER_ID}`;
  });

  it('prefers the newest active feature', async () => {
    const [other] = await sql()<
      { id: string }[]
    >`select id from public.makers where id <> ${FIXTURE_MAKER_ID} limit 1`;
    const otherPieces = await sql()<
      { id: string }[]
    >`select id from public.products where maker_id = ${other!.id} limit 3`;
    const [row] = await sql()<{ id: string }[]>`
      insert into public.home_features (maker_id, product_ids, starts_at)
      values (${other!.id}, ${otherPieces.map((p) => p.id)}::uuid[], now())
      returning id`;
    // Seeded demo photos are placeholders, which the hero never uses.
    expect(await loadHomeFeature()).toBeNull();
    await sql()`delete from public.home_features where id = ${row!.id}`;
    expect((await loadHomeFeature())?.maker.slug).toBe('dramalicious');
  });

  it('is readable by the public only while active, and writable only by admins', async () => {
    const anon = await withAnon((db) => db`select id from public.home_features`);
    expect(anon).toHaveLength(1);
    await sql()`update public.home_features set is_active = false where maker_id = ${FIXTURE_MAKER_ID}`;
    expect(await withAnon((db) => db`select id from public.home_features`)).toHaveLength(0);
    await sql()`update public.home_features set is_active = true where maker_id = ${FIXTURE_MAKER_ID}`;
    const row = { makerId: FIXTURE_MAKER_ID };
    await expect(
      withUser(
        buyer(0),
        (db) => db`insert into public.home_features (maker_id) values (${row.makerId})`,
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
    const admin = {
      id: ADMIN.id,
      email: ADMIN.email,
      role: 'admin' as const,
      displayName: ADMIN.name,
      makerId: null,
    };
    const made = await withUser(
      admin,
      (db) =>
        db`insert into public.home_features (maker_id, is_active) values (${row.makerId}, false) returning id`,
    );
    expect(made).toHaveLength(1);
    await sql()`delete from public.home_features where id = ${made[0]!.id}`;
  });
});
