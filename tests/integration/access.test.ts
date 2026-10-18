import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withUser } from '@/lib/db';
import { getSellerOrders } from '@/lib/queries/seller';
import { getBuyerOrders } from '@/lib/queries/account';
import { archiveListing } from '@/lib/services/listings';
import { MAKERS, buyer, seller } from './helpers';

afterAll(closeDb);

describe('row level security: sellers', () => {
  const a = seller(0);
  const b = seller(1);

  it('a seller cannot see another seller’s orders', async () => {
    const mine = await getSellerOrders(a);
    expect(mine.length).toBeGreaterThan(0);
    const leaked = await withUser(
      a,
      (db) => db`select id from public.fulfilments where maker_id = ${b.makerId}`,
    );
    expect(leaked).toHaveLength(0);
    const items = await withUser(
      a,
      (db) => db`select id from public.order_items where maker_id = ${b.makerId}`,
    );
    expect(items).toHaveLength(0);
    const ids = new Set(mine.map((o) => o.id));
    const theirs = await sql()<
      { id: string }[]
    >`select id from public.fulfilments where maker_id = ${b.makerId}`;
    expect(theirs.some((t) => ids.has(t.id))).toBe(false);
  });

  it('a seller cannot see or modify another seller’s unpublished products', async () => {
    const [draft] = await sql()<{ id: string }[]>`
      insert into public.products (maker_id, slug, title, category, price_cents, product_type, status)
      values (${b.makerId}, ${'rls-draft-' + Date.now()}, 'Secret draft', 'dresses', 20000, 'ready_to_ship', 'draft') returning id`;
    const seen = await withUser(
      a,
      (db) => db`select id from public.products where id = ${draft!.id}`,
    );
    expect(seen).toHaveLength(0);
    const updated = await withUser(
      a,
      (db) =>
        db`update public.products set title = 'hacked' where maker_id = ${b.makerId} returning id`,
    );
    expect(updated).toHaveLength(0);
    await expect(archiveListing(a, draft!.id)).rejects.toThrow(/not found/i);
    // The owner can.
    const own = await withUser(
      b,
      (db) => db`select id from public.products where id = ${draft!.id}`,
    );
    expect(own).toHaveLength(1);
  });

  it('a seller cannot approve their own listing or change platform-managed fields', async () => {
    const [p] = await sql()<
      { id: string }[]
    >`select id from public.products where maker_id = ${a.makerId} and status = 'approved' and not is_featured limit 1`;
    await expect(
      withUser(a, (db) => db`update public.products set is_featured = true where id = ${p!.id}`),
    ).rejects.toThrow();
    const [draft] = await sql()<{ id: string }[]>`
      insert into public.products (maker_id, slug, title, category, price_cents, product_type, status)
      values (${a.makerId}, ${'self-approve-' + Date.now()}, 'Self approve', 'dresses', 20000, 'ready_to_ship', 'pending') returning id`;
    await expect(
      withUser(
        a,
        (db) => db`update public.products set status = 'approved' where id = ${draft!.id}`,
      ),
    ).rejects.toThrow(/admins/);
    await expect(
      withUser(
        a,
        (db) =>
          db`update public.makers set rating = 1, completed_orders = 999 where id = ${MAKERS[0]!.id}`,
      ),
    ).rejects.toThrow();
  });

  it('a seller cannot read other sellers’ message threads', async () => {
    const theirs = await withUser(
      a,
      (db) => db`select id from public.message_threads where maker_id = ${b.makerId}`,
    );
    expect(theirs).toHaveLength(0);
  });
});

describe('row level security: buyers', () => {
  it('a buyer only sees their own orders, saved items, measurements and messages', async () => {
    const ava = buyer(0);
    const other = buyer(1);
    const orders = await getBuyerOrders(ava);
    expect(orders.length).toBeGreaterThan(0);
    const leaked = await withUser(
      ava,
      (db) => db`select id from public.orders where buyer_user_id = ${other.id}`,
    );
    expect(leaked).toHaveLength(0);
    const saved = await withUser(
      ava,
      (db) => db`select id from public.saved_items where user_id = ${other.id}`,
    );
    expect(saved).toHaveLength(0);
    const threads = await withUser(
      ava,
      (db) => db`select id from public.message_threads where buyer_user_id = ${other.id}`,
    );
    expect(threads).toHaveLength(0);
    const measurements = await withUser(
      ava,
      (db) => db`select id from public.buyer_measurements where user_id <> ${ava.id}`,
    );
    expect(measurements).toHaveLength(0);
    const ops = await withUser(ava, (db) => db`select id from public.email_outbox`);
    expect(ops).toHaveLength(0);
  });

  it('anonymous visitors only see approved catalogue rows', async () => {
    const { withAnon } = await import('@/lib/db');
    const rows = await withAnon(
      (db) => db<{ status: string }[]>`select distinct status from public.products`,
    );
    expect(rows.map((r) => r.status)).toEqual(['approved']);
    const users = await withAnon((db) => db`select id from public.users`);
    expect(users).toHaveLength(0);
  });
});
