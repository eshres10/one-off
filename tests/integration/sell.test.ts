import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { goLiveIfReady, mySellShop } from '@/lib/services/sell';

afterAll(closeDb);

async function newUser() {
  const id = randomUUID();
  const email = `sell-${id.slice(0, 8)}@maker.test`;
  await sql()`insert into auth.users (id, email) values (${id}, ${email})`;
  await sql()`insert into public.users (id, auth_user_id, email, role) values (${id}, ${id}, ${email}, 'buyer')`;
  return { id, email, role: 'buyer' as const, makerId: null };
}

async function newShop(status: string) {
  const user = await newUser();
  const [m] = await sql()<{ id: string }[]>`
    insert into public.makers (user_id, slug, display_name, status, shop_status, self_signup, source, spot_checks_left)
    values (${user.id}, ${`apply-${user.id.slice(0, 8)}`}, 'Test Label', 'draft', ${status}, true, 'application',
      ${status === 'approved' ? 3 : 0})
    returning id`;
  return { user, makerId: m!.id };
}

const addPiece = async (makerId: string, n: number, status = 'approved') =>
  sql()`
    insert into public.products (maker_id, slug, title, category, price_cents, product_type, status)
    values (${makerId}, ${`piece-${makerId.slice(0, 8)}-${n}`}, ${`Piece ${n}`}, 'dresses', 29000, 'ready_to_ship',
      ${status}::product_status)`;

describe('applied shops', () => {
  it('never go live before approval, even with payouts and a piece', async () => {
    const { makerId } = await newShop('applied');
    await sql()`update public.makers set stripe_charges_enabled = true where id = ${makerId}`;
    await addPiece(makerId, 1, 'draft');
    expect(await goLiveIfReady(makerId)).toBe(false);
    const [m] = await sql()<{ shopStatus: string; status: string }[]>`
      select shop_status, status from public.makers where id = ${makerId}`;
    expect(m).toEqual({ shopStatus: 'applied', status: 'draft' });
  });

  it('go live once approved, payouts are connected and the first piece is published', async () => {
    const { user, makerId } = await newShop('approved');
    await addPiece(makerId, 1);
    // Published but payouts not connected yet: still approved, not visible to buyers.
    expect(await goLiveIfReady(makerId)).toBe(false);
    expect((await mySellShop(user))!.shopStatus).toBe('approved');

    await sql()`update public.makers set stripe_charges_enabled = true where id = ${makerId}`;
    expect(await goLiveIfReady(makerId)).toBe(true);
    const [m] = await sql()<{ shopStatus: string; status: string }[]>`
      select shop_status, status from public.makers where id = ${makerId}`;
    expect(m).toEqual({ shopStatus: 'live', status: 'approved' });
    expect(await goLiveIfReady(makerId)).toBe(false); // idempotent
  });

  it('flag the first three pieces of a newly approved shop for a spot check', async () => {
    const { makerId } = await newShop('approved');
    for (const n of [1, 2, 3, 4]) await addPiece(makerId, n);
    const rows = await sql()<{ title: string; spotCheck: boolean }[]>`
      select title, spot_check from public.products where maker_id = ${makerId} order by title`;
    expect(rows.map((r) => r.spotCheck)).toEqual([true, true, true, false]);
  });
});
