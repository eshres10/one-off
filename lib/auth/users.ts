import { sql } from '@/lib/db';
import { audit } from '@/lib/audit';

/** Ensures a public.users row exists for an auth user (first sign-in). New users are buyers. */
export async function ensureAppUser(
  authUserId: string,
  email: string,
  displayName?: string | null,
) {
  await sql()`
    insert into public.users (id, auth_user_id, email, display_name, role)
    values (${authUserId}, ${authUserId}, ${email}, ${displayName ?? null}, 'buyer')
    on conflict (id) do nothing`;
}

/**
 * Links guest orders to the account with the same (verified) email so they appear under
 * "Orders" after the buyer signs up.
 */
export async function claimGuestOrders(userId: string, email: string) {
  const rows = await sql()`
    update public.orders set buyer_user_id = ${userId}
    where buyer_user_id is null and lower(buyer_email) = lower(${email}) and status <> 'pending'
    returning id`;
  if (rows.length)
    await audit('orders.claimed', { type: 'user', id: userId }, { count: rows.length }, userId);
}
