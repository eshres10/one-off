import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withUser } from '@/lib/db';
import { buyer, seller } from './helpers';

afterAll(closeDb);

const me = buyer(0);
const other = buyer(1);
const picked = seller(0);
const notPicked = seller(1);

async function makeRequest(anonymous = true) {
  const [r] = await withUser(
    me,
    (db) => db<{ id: string; number: string }[]>`
    insert into public.custom_requests (buyer_id, status, kind, occasion, words, measurements,
      budget_min, budget_max, postcode, suburb, state, lat, lng, anonymous, sent_at)
    values (${me.id}, 'sent', 'dress', 'wedding_guest', 'A bias-cut slip for a spring wedding, midi length.',
      ${db.json({ bust: 86, waist: 70, hips: 96 })}, 450, 700, '3065', 'Fitzroy', 'VIC', -37.7984, 144.9783,
      ${anonymous}, now())
    returning id, number`,
  );
  await withUser(
    me,
    (db) => db`
    insert into public.custom_request_recipients (request_id, maker_id, reply_by)
    values (${r!.id}, ${picked.makerId}, now() + interval '48 hours')`,
  );
  return r!;
}

describe('Have it made: who sees what (RLS)', () => {
  it('numbers requests OO-C-…', async () => {
    const r = await makeRequest();
    expect(r.number).toMatch(/^OO-C-\d{4,}$/);
  });

  it('a maker who was not picked sees nothing: not the request, not its measurements', async () => {
    const r = await makeRequest();
    const viaView = await withUser(
      notPicked,
      (db) => db`
      select 1 from public.maker_request_view where id = ${r.id}`,
    );
    expect(viaView).toHaveLength(0);
    const direct = await withUser(
      notPicked,
      (db) => db`
      select 1 from public.custom_requests where id = ${r.id}`,
    );
    expect(direct).toHaveLength(0);
  });

  it('a picked maker reads it only through the view: suburb, no postcode, location or name while anonymous', async () => {
    const r = await makeRequest(true);
    const direct = await withUser(
      picked,
      (db) => db`
      select 1 from public.custom_requests where id = ${r.id}`,
    );
    expect(direct).toHaveLength(0);
    const [row] = await withUser(
      picked,
      (db) => db<Record<string, unknown>[]>`
      select * from public.maker_request_view where id = ${r.id}`,
    );
    expect(row).toMatchObject({ suburb: 'Fitzroy', state: 'VIC', buyerFirstName: null });
    expect(row!.measurements).toMatchObject({ bust: 86 });
    for (const hidden of ['postcode', 'lat', 'lng', 'buyerId'])
      expect(row).not.toHaveProperty(hidden);
  });

  it('once that maker is chosen, they see the first name', async () => {
    const r = await makeRequest(true);
    await sql()`update public.custom_request_recipients set status = 'chosen'
      where request_id = ${r.id} and maker_id = ${picked.makerId}`;
    const [row] = await withUser(
      picked,
      (db) => db<{ buyerFirstName: string | null }[]>`
      select buyer_first_name from public.maker_request_view where id = ${r.id}`,
    );
    const [u] = await sql()<
      { displayName: string }[]
    >`select display_name from public.users where id = ${me.id}`;
    expect(row!.buyerFirstName).toBe(u!.displayName.split(' ')[0]);
  });

  it('a buyer who did not ask anonymously is named from the start', async () => {
    const r = await makeRequest(false);
    const [row] = await withUser(
      picked,
      (db) => db<{ buyerFirstName: string | null }[]>`
      select buyer_first_name from public.maker_request_view where id = ${r.id}`,
    );
    expect(row!.buyerFirstName).toBeTruthy();
  });

  it('only a picked maker can quote, and only the buyer (and that maker) can read the quote', async () => {
    const r = await makeRequest();
    const quote = (maker: typeof picked) =>
      withUser(
        maker,
        (db) => db`
        insert into public.custom_quotes (request_id, maker_id, price, ready_by, note, can_make_to_measurements)
        values (${r.id}, ${maker.makerId}, 52000, current_date + 21,
          'Bias-cut silk, fully lined, with a hand-rolled hem.', true)`,
      );
    await expect(quote(notPicked)).rejects.toThrow(/row-level security/);
    await quote(picked);
    const mine = await withUser(
      me,
      (db) => db`select 1 from public.custom_quotes where request_id = ${r.id}`,
    );
    expect(mine).toHaveLength(1);
    const theirs = await withUser(
      other,
      (db) => db`select 1 from public.custom_quotes where request_id = ${r.id}`,
    );
    expect(theirs).toHaveLength(0);
    const otherBuyerRequest = await withUser(
      other,
      (db) => db`
      select 1 from public.custom_requests where id = ${r.id}`,
    );
    expect(otherBuyerRequest).toHaveLength(0);
  });

  it('a quote must confirm the measurements', async () => {
    const r = await makeRequest();
    await expect(
      withUser(
        picked,
        (db) => db`
        insert into public.custom_quotes (request_id, maker_id, price, ready_by, note, can_make_to_measurements)
        values (${r.id}, ${picked.makerId}, 52000, current_date + 21, 'A note long enough to send it.', false)`,
      ),
    ).rejects.toThrow(/check constraint/);
  });
});
