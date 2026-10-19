import { sql } from '@/lib/db';

/**
 * Where a shopper goes after signing in: brand-new shopper accounts start with /welcome; makers
 * claiming or setting up a shop, and everyone else, go where they were heading.
 */
export async function afterSignIn(userId: string, next: string): Promise<string> {
  if (/^\/(claim|sell|studio|admin|welcome)/.test(next)) return next;
  const [r] = await sql()<{ isNew: boolean }[]>`
    select (u.role = 'buyer' and u.created_at > now() - interval '1 day' and cp.user_id is null) as is_new
    from public.users u left join public.customer_prefs cp on cp.user_id = u.id
    where u.id = ${userId}`;
  return r?.isNew ? '/welcome' : next;
}
