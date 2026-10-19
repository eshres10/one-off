import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { goLiveIfReady, mySellShop, saveLabel } from '@/lib/services/sell';

afterAll(closeDb);

async function newUser() {
  const id = randomUUID();
  const email = `sell-${id.slice(0, 8)}@maker.test`;
  await sql()`insert into auth.users (id, email) values (${id}, ${email})`;
  await sql()`insert into public.users (id, auth_user_id, email, role) values (${id}, ${id}, ${email}, 'buyer')`;
  return { id, email, role: 'buyer' as const, makerId: null };
}

describe('self sign-up shops', () => {
  it('start as a draft and go live only once payouts are on and a piece is published', async () => {
    const user = await newUser();
    const shop = await saveLabel(user, {
      name: 'Test Label',
      suburb: 'Thornbury',
      instagram: '@testlabel',
      makes: ['Slips', 'Dresses'],
      modes: ['ready_to_ship', 'custom'],
    });
    expect(shop.shopStatus).toBe('draft');
    const [u] = await sql()<
      { role: string }[]
    >`select role from public.users where id = ${user.id}`;
    expect(u!.role).toBe('seller');
    const [m] = await sql()<{ selfSignup: boolean; custom: boolean; status: string }[]>`
      select self_signup, custom_commissions_enabled as custom, status from public.makers where id = ${shop.id}`;
    expect(m).toEqual({ selfSignup: true, custom: true, status: 'draft' });

    // A piece published before payouts waits as pending; the shop stays a draft.
    await sql()`
      insert into public.products (maker_id, slug, title, category, price_cents, product_type, status)
      values (${shop.id}, ${`test-${shop.id.slice(0, 8)}`}, 'Test Slip', 'dresses', 29000, 'ready_to_ship', 'pending')`;
    expect(await goLiveIfReady(shop.id)).toBe(false);
    expect((await mySellShop(user))!.shopStatus).toBe('draft');

    // Payouts connected: live, and the waiting piece is published.
    await sql()`update public.makers set stripe_payouts_enabled = true where id = ${shop.id}`;
    expect(await goLiveIfReady(shop.id)).toBe(true);
    const after = await sql()<{ shopStatus: string; status: string; founding: boolean }[]>`
      select m.shop_status, p.status, m.founding_until is not null or m.founding_number is null as founding
      from public.makers m join public.products p on p.maker_id = m.id where m.id = ${shop.id}`;
    expect(after[0]).toEqual({ shopStatus: 'live', status: 'approved', founding: true });
    expect(await goLiveIfReady(shop.id)).toBe(false); // idempotent
  });

  it('a live shop can’t be relabelled through sign-up', async () => {
    const user = await newUser();
    const shop = await saveLabel(user, {
      name: 'Another Label',
      suburb: 'Fitzroy',
      instagram: '',
      makes: ['Tops'],
      modes: ['made_to_order'],
    });
    await sql()`update public.makers set shop_status = 'live' where id = ${shop.id}`;
    await expect(
      saveLabel(user, {
        name: 'Renamed',
        suburb: 'Fitzroy',
        instagram: '',
        makes: ['Tops'],
        modes: ['made_to_order'],
      }),
    ).rejects.toThrow(/already set up/);
  });
});
