import { randomUUID } from 'node:crypto';
import { audit } from '@/lib/audit';
import { sql } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { createLocalAuthUser, findAuthUserIdByEmail, signMagicToken } from './local';
import { ensureAppUser } from './users';

/**
 * A sign-in link for an email, without a browser session (webhooks, cron): Supabase generates
 * the magic link; the local driver signs its own. Never a password.
 */
export async function signInLinkFor(email: string, next: string): Promise<string> {
  if (env().AUTH_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('./supabase');
    const { data, error } = await supabaseAdmin().auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${env().APP_URL}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error || !data.properties?.action_link)
      throw new Error(error?.message ?? 'No sign-in link');
    return data.properties.action_link;
  }
  const authId = await findAuthUserIdByEmail(email);
  if (!authId) throw new Error('No account for that email');
  return `${env().APP_URL}/auth/magic?token=${await signMagicToken(authId)}&next=${encodeURIComponent(next)}`;
}

/** Creates (or finds) the auth user and app user for an email. Returns the user id. */
async function accountFor(
  email: string,
  name: string | null,
): Promise<{ userId: string; created: boolean }> {
  const [existing] = await sql()<{ id: string }[]>`
    select id from public.users where lower(email) = lower(${email})`;
  if (existing) return { userId: existing.id, created: false };
  let authId: string;
  if (env().AUTH_DRIVER === 'supabase') {
    const { supabaseAdmin } = await import('./supabase');
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: name ? { name } : undefined,
    });
    if (error || !data.user) throw new Error(error?.message ?? 'Could not create the account');
    authId = data.user.id;
  } else {
    authId =
      (await findAuthUserIdByEmail(email)) ?? (await createLocalAuthUser(email, randomUUID()));
  }
  await ensureAppUser(authId, email, name);
  return { userId: authId, created: true };
}

/**
 * "Save my details for next time": after a guest pays, their account is created with the order
 * email, the order, address and saved card are attached, and a sign-in link is emailed.
 */
export async function createAccountIfSaved(orderId: string): Promise<boolean> {
  const [o] = await sql()<
    {
      saveDetails: boolean;
      buyerUserId: string | null;
      buyerEmail: string;
      buyerName: string | null;
      buyerPhone: string | null;
      shippingAddress: Record<string, unknown> | null;
      stripeCustomerId: string | null;
      orderNumber: string;
    }[]
  >`
    select save_details, buyer_user_id, buyer_email, buyer_name, buyer_phone, shipping_address, stripe_customer_id, order_number
    from public.orders where id = ${orderId}`;
  if (!o || !o.saveDetails || o.buyerUserId || !o.buyerEmail.includes('@')) return false;
  const { userId, created } = await accountFor(o.buyerEmail, o.buyerName);
  await sql()`update public.orders set buyer_user_id = ${userId}, account_created = ${created} where id = ${orderId}`;
  const firstName = (o.buyerName ?? '').trim().split(/\s+/)[0] || null;
  const s = (o.shippingAddress ?? {}) as Record<string, string | undefined>;
  const address = o.shippingAddress
    ? [
        {
          id: randomUUID(),
          label: 'Home',
          isDefault: true,
          name: s.name ?? o.buyerName ?? '',
          line1: s.line1 ?? '',
          line2: s.line2 ?? '',
          suburb: s.suburb ?? s.city ?? '',
          state: s.state ?? '',
          postcode: s.postcode ?? s.postal_code ?? '',
          phone: o.buyerPhone,
        },
      ]
    : [];
  await sql()`
    insert into public.customer_prefs (user_id, first_name, addresses)
    values (${userId}, ${firstName}, ${sql().json(address as never)})
    on conflict (user_id) do update set
      first_name = coalesce(public.customer_prefs.first_name, excluded.first_name),
      addresses = case when jsonb_array_length(public.customer_prefs.addresses) = 0 then excluded.addresses
        else public.customer_prefs.addresses end`;
  if (o.stripeCustomerId)
    await sql()`update public.users set stripe_customer_id = coalesce(stripe_customer_id, ${o.stripeCustomerId}) where id = ${userId}`;
  if (!created) return false;
  await audit('account.created_at_checkout', { type: 'user', id: userId }, { orderId }, userId);
  const link = await signInLinkFor(o.buyerEmail, `/account/orders/${o.orderNumber}`);
  await sendEmail(
    emails.accountReady(o.buyerEmail, { firstName, link, orderNumber: o.orderNumber }),
  );
  return true;
}
