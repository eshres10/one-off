import { sql } from '@/lib/db';

/**
 * The shopper tour shows once on desktop after onboarding (customer_prefs exists) until it's
 * finished or skipped. The Studio tour shows once for a maker who claimed or set up their shop.
 */
export async function tourDue(userId: string, kind: 'customer' | 'studio'): Promise<boolean> {
  const [r] = await sql()<{ due: boolean }[]>`
    select case when ${kind} = 'studio' then u.studio_tour_completed_at is null
      else u.tour_completed_at is null and exists (select 1 from public.customer_prefs cp where cp.user_id = u.id)
    end as due
    from public.users u where u.id = ${userId}`;
  return r?.due ?? false;
}
