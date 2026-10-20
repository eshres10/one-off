import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withUser } from '@/lib/db';
import { EMPTY_STORY, type PieceStory } from '@/lib/listings/story';
import { getProductStory } from '@/lib/queries/story';
import { getPiece, listReusableStories, savePiece } from '@/lib/services/studio-listings';
import { emptySizes, newPiece, type PieceDraft } from '@/lib/studio/pieces';
import { seller } from './helpers';

afterAll(closeDb);

const maker = seller(0);
const other = seller(1);

function draft(title: string, story: PieceStory = EMPTY_STORY): PieceDraft {
  return {
    ...newPiece({
      makerId: maker.makerId,
      name: 'Test',
      foundingUntil: null,
      careDefault: null,
      dispatchDays: 3,
      ratesSummary: '',
      mtoDefaultLead: null,
      shopLive: true,
    }),
    title,
    category: 'dresses',
    description:
      'A test piece with a description long enough to pass the checklist, cut on the bias in silk.',
    priceCents: 25_000,
    images: [
      { url: '/seed/butter-silk-slip.jpg', alt: '' },
      { url: '/seed/navy-satin-slip.jpg', alt: '' },
      { url: '/seed/draped-satin-midi.jpg', alt: '' },
    ],
    sizes: emptySizes().map((s) => (s.size === '10' ? { ...s, stock: 2 } : s)),
    story,
  };
}

const full: PieceStory = {
  quote: 'A slip you could dance in.',
  inspiration: 'My nan’s nightdress.',
  details: ['French seams', 'Hand-rolled hem', 'Pin-tucked bodice'],
  fabric: 'Deadstock silk from a Sydney mill',
  hoursToMake: 14,
  closeups: [{ path: '/seed/navy-satin-slip.jpg', caption: 'French seams inside' }],
};

describe('story of the garment', () => {
  it('a piece with no story publishes, and has no story to show (test 1)', async () => {
    const res = await savePiece(maker, {
      id: null,
      draft: draft('No story slip'),
      intent: 'publish',
    });
    expect(res.status).toBe('approved');
    expect(await getProductStory(res.id)).toBeNull();
    expect(
      await sql()`select 1 from public.product_stories where product_id = ${res.id}`,
    ).toHaveLength(0);
  });

  it('only hours makes a story with only hours (test 2)', async () => {
    const story = { ...EMPTY_STORY, hoursToMake: 6 };
    const res = await savePiece(maker, {
      id: null,
      draft: draft('Hours only slip', story),
      intent: 'publish',
    });
    const page = await getProductStory(res.id);
    expect(page?.story).toEqual({ ...EMPTY_STORY, hoursToMake: 6 });
    // Clearing it removes the row.
    await savePiece(maker, { id: res.id, draft: draft('Hours only slip'), intent: 'draft' });
    expect(await getProductStory(res.id)).toBeNull();
  });

  it('saves with the piece, trimmed, and comes back in the editor', async () => {
    const res = await savePiece(maker, {
      id: null,
      draft: draft('Full story slip', { ...full, quote: '  “A slip you could dance in.”  ' }),
      intent: 'publish',
    });
    const piece = await getPiece(maker, res.id);
    expect(piece?.story).toEqual(full);
  });

  it('reuse copies every field and close-up; editing the copy leaves the original (test 3)', async () => {
    const original = await savePiece(maker, {
      id: null,
      draft: draft('Original slip', full),
      intent: 'publish',
    });
    const choices = await listReusableStories(maker, maker.makerId, null);
    const pick = choices.find((c) => c.productId === original.id)!;
    expect(pick.story).toEqual(full);
    const copy = await savePiece(maker, {
      id: null,
      draft: draft('Copy slip', pick.story),
      intent: 'publish',
    });
    expect((await getPiece(maker, copy.id))?.story).toEqual(full);
    await savePiece(maker, {
      id: copy.id,
      draft: draft('Copy slip', { ...pick.story, hoursToMake: 20, closeups: [] }),
      intent: 'draft',
    });
    expect((await getPiece(maker, copy.id))?.story.hoursToMake).toBe(20);
    expect((await getPiece(maker, original.id))?.story).toEqual(full);
    // Another maker's stories aren't offered.
    expect(await listReusableStories(other, maker.makerId, null)).toEqual([]);
  });

  it('a non-owner can’t insert or update a story (test 4, RLS)', async () => {
    const mine = await savePiece(maker, {
      id: null,
      draft: draft('Guarded slip', full),
      intent: 'publish',
    });
    const bare = await savePiece(maker, { id: null, draft: draft('Bare slip'), intent: 'publish' });
    await expect(
      withUser(
        other,
        (db) => db`
        insert into public.product_stories (product_id, quote) values (${bare.id}, 'Not mine')`,
      ),
    ).rejects.toThrow(/row-level security/);
    const updated = await withUser(
      other,
      (db) => db`
      update public.product_stories set quote = 'Hijacked' where product_id = ${mine.id} returning 1`,
    );
    expect(updated).toHaveLength(0);
    const deleted = await withUser(
      other,
      (db) => db`
      delete from public.product_stories where product_id = ${mine.id} returning 1`,
    );
    expect(deleted).toHaveLength(0);
    expect((await getProductStory(mine.id))?.story.quote).toBe(full.quote);
    // Anyone can read the story of a live piece.
    const read = await withUser(
      other,
      (db) => db`
      select quote from public.product_stories where product_id = ${mine.id}`,
    );
    expect(read).toHaveLength(1);
  });

  it('the database enforces the limits too (test 7)', async () => {
    const res = await savePiece(maker, {
      id: null,
      draft: draft('Limits slip'),
      intent: 'publish',
    });
    const id = res.id;
    const bad = [
      sql()`insert into public.product_stories (product_id, quote) values (${id}, ${'x'.repeat(161)})`,
      sql()`insert into public.product_stories (product_id, inspiration) values (${id}, ${'x'.repeat(1201)})`,
      sql()`insert into public.product_stories (product_id, fabric) values (${id}, ${'x'.repeat(241)})`,
      sql()`insert into public.product_stories (product_id, hours_to_make) values (${id}, 501)`,
      sql()`insert into public.product_stories (product_id, hours_to_make) values (${id}, 0)`,
      sql()`insert into public.product_stories (product_id, details) values (${id}, ${Array.from({ length: 13 }, (_, i) => `d${i}`)})`,
      sql()`insert into public.product_stories (product_id, details) values (${id}, ${['x'.repeat(41)]})`,
      sql()`insert into public.product_stories (product_id, closeups) values (${id}, ${sql().json(Array.from({ length: 4 }, (_, i) => ({ path: `/seed/${i}.jpg`, caption: '' })))})`,
      sql()`insert into public.product_stories (product_id, closeups) values (${id}, ${sql().json([{ path: '/seed/a.jpg', caption: 'x'.repeat(121) }])})`,
    ];
    for (const q of bad) await expect(q).rejects.toThrow(/check constraint/);
    // The service trims rather than failing.
    await savePiece(maker, {
      id,
      draft: draft('Limits slip', {
        quote: 'q'.repeat(300),
        inspiration: 'i'.repeat(2000),
        details: Array.from({ length: 20 }, (_, i) => `Detail ${i} ${'x'.repeat(50)}`),
        fabric: 'f'.repeat(400),
        hoursToMake: 900,
        closeups: [],
      }),
      intent: 'draft',
    });
    const s = (await getProductStory(id))!.story;
    expect(s.quote).toHaveLength(160);
    expect(s.inspiration).toHaveLength(1200);
    expect(s.details).toHaveLength(12);
    expect(s.details.every((d) => d.length <= 40)).toBe(true);
    expect(s.fabric).toHaveLength(240);
    expect(s.hoursToMake).toBe(500);
  });

  it('refuses close-ups linked from elsewhere', async () => {
    await expect(
      savePiece(maker, {
        id: null,
        draft: draft('Linked slip', {
          ...EMPTY_STORY,
          closeups: [{ path: 'https://example.com/x.jpg', caption: '' }],
        }),
        intent: 'draft',
      }),
    ).rejects.toThrow(/upload close-ups/);
  });
});
