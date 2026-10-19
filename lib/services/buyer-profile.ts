import { randomUUID } from 'node:crypto';
import { withUser, type Db } from '@/lib/db';
import type { SessionUser } from '@/lib/auth/session';
import { payments } from '@/lib/payments';
import type { SavedCard } from '@/lib/payments/types';
import { sanitizeText } from '@/lib/domain/moderation';
import { addressProblem, cleanAddress, type CheckoutAddress } from './checkout';
import { UserError } from './errors';
import { buyerPrefs, saveBuyerPrefs, type BuyerNotify } from './notifications';

type Actor = Pick<SessionUser, 'id' | 'role'>;

/** A saved address, in the checkout shape (suburb / postcode). */
export interface SavedAddress extends CheckoutAddress {
  id: string;
  label: string;
  isDefault: boolean;
  phone?: string | null;
}

const MAX_ADDRESSES = 10;

async function readAddresses(db: Db, userId: string): Promise<SavedAddress[]> {
  const [row] = await db<{ addresses: SavedAddress[] }[]>`
    select addresses from public.customer_prefs where user_id = ${userId}`;
  return row?.addresses ?? [];
}

async function writeAddresses(db: Db, userId: string, list: SavedAddress[]) {
  // Exactly one default whenever there are any.
  if (list.length && !list.some((a) => a.isDefault)) list[0]!.isDefault = true;
  await db`
    insert into public.customer_prefs (user_id, addresses) values (${userId}, ${db.json(list as never)})
    on conflict (user_id) do update set addresses = excluded.addresses`;
}

export async function listAddresses(user: Actor): Promise<SavedAddress[]> {
  const list = await withUser(user, (db) => readAddresses(db, user.id));
  return [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

/** Adds (no id) or edits an address. Checked the same way as at checkout. */
export async function saveAddress(
  user: Actor,
  input: Partial<CheckoutAddress> & { id?: string; label?: string; makeDefault?: boolean },
): Promise<void> {
  const clean = cleanAddress(input);
  const problem = addressProblem(clean);
  if (problem) throw new UserError(problem);
  const label =
    sanitizeText(input.label ?? '')
      .trim()
      .slice(0, 40) || 'Home';
  await withUser(user, async (db) => {
    const list = await readAddresses(db, user.id);
    const existing = input.id ? list.find((a) => a.id === input.id) : undefined;
    if (input.id && !existing) throw new UserError('That address was removed.');
    if (!existing && list.length >= MAX_ADDRESSES)
      throw new UserError(`You can save up to ${MAX_ADDRESSES} addresses.`);
    const next: SavedAddress = {
      ...(existing ?? { id: randomUUID(), isDefault: list.length === 0 }),
      ...clean!,
      label,
    };
    let out = existing ? list.map((a) => (a.id === next.id ? next : a)) : [...list, next];
    if (input.makeDefault) out = out.map((a) => ({ ...a, isDefault: a.id === next.id }));
    await writeAddresses(db, user.id, out);
  });
}

export async function makeDefaultAddress(user: Actor, id: string): Promise<void> {
  await withUser(user, async (db) => {
    const list = await readAddresses(db, user.id);
    if (!list.some((a) => a.id === id)) throw new UserError('That address was removed.');
    await writeAddresses(
      db,
      user.id,
      list.map((a) => ({ ...a, isDefault: a.id === id })),
    );
  });
}

export async function removeAddress(user: Actor, id: string): Promise<void> {
  await withUser(user, async (db) => {
    const list = await readAddresses(db, user.id);
    await writeAddresses(
      db,
      user.id,
      list.filter((a) => a.id !== id),
    );
  });
}

async function customerId(user: Actor): Promise<string | null> {
  const [row] = await withUser(
    user,
    (db) => db<{ stripeCustomerId: string | null }[]>`
      select stripe_customer_id from public.users where id = ${user.id}`,
  );
  return row?.stripeCustomerId ?? null;
}

/** Cards saved on the buyer's Stripe Customer. Empty when there's no customer or Stripe is down. */
export async function listSavedCards(user: Actor): Promise<SavedCard[]> {
  const id = await customerId(user);
  if (!id) return [];
  try {
    return await payments().listCards(id);
  } catch {
    return [];
  }
}

/** Removes a card, but only one that's on this buyer's own Stripe Customer. */
export async function removeSavedCard(user: Actor, paymentMethodId: string): Promise<void> {
  const cards = await listSavedCards(user);
  if (!cards.some((c) => c.id === paymentMethodId))
    throw new UserError('That card was already removed.');
  await payments().detachPaymentMethod(paymentMethodId);
}

export async function getBuyerPrefs(user: Actor) {
  return buyerPrefs(user.id);
}

export async function setBuyerPrefs(user: Actor, prefs: Record<BuyerNotify, boolean>) {
  await withUser(user, (db) => saveBuyerPrefs(db, user.id, prefs));
}
