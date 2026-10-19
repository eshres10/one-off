import { createHash, randomBytes } from 'node:crypto';
import { sql } from '@/lib/db';

const DAY = 86_400_000;
const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/**
 * A one-time link token that carries a guest's bag (their cart session) and saved pieces from an
 * in-app browser into Safari or Chrome. Valid 24 hours, single use; only its hash is stored.
 */
export async function createRestoreToken(input: {
  cartSessionId: string | null;
  savedProductIds: string[];
  now?: Date;
}): Promise<string> {
  const now = input.now ?? new Date();
  const token = randomBytes(18).toString('base64url');
  const ids = input.savedProductIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  await sql()`
    insert into public.restore_tokens (token_hash, cart_session_id, saved_product_ids, created_at, expires_at)
    values (${hash(token)}, ${input.cartSessionId}, ${ids}, ${now}, ${new Date(now.getTime() + DAY)})`;
  return token;
}

/** Uses up a token: its cart session and saved pieces, or null if it's unknown, used or expired. */
export async function redeemRestoreToken(
  token: string,
  now = new Date(),
): Promise<{ cartSessionId: string | null; savedProductIds: string[] } | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await sql()<{ cartSessionId: string | null; savedProductIds: string[] }[]>`
    update public.restore_tokens set used_at = ${now}
    where token_hash = ${hash(token)} and used_at is null and expires_at > ${now}
    returning cart_session_id, saved_product_ids`;
  return row ?? null;
}
