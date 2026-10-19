import { sql } from '@/lib/db';

/** A maker's part of an order still waiting to go out (paid, being made, or ready). */
export const TO_SHIP = `('paid', 'preparing', 'making', 'ready')`;

export interface StudioShop {
  id: string;
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  shopStatus: string;
  foundingNumber: number | null;
  foundingUntil: Date | null;
  holidayUntil: Date | null;
  timezone: string;
}

export async function getStudioShop(makerId: string): Promise<StudioShop> {
  const [shop] = await sql()<StudioShop[]>`
    select id, slug, display_name, avatar_url, shop_status, founding_number, founding_until, holiday_until, timezone
    from public.makers where id = ${makerId}`;
  return shop!;
}

/** Badge counts for the Studio nav. */
export async function getStudioCounts(makerId: string) {
  const [row] = await sql()<{ toShip: number; needsReply: number }[]>`
    select
      (select count(*) from public.fulfilments f join public.orders o on o.id = f.order_id
        where f.maker_id = ${makerId} and f.status in ${sql().unsafe(TO_SHIP)}
          and o.status in ('paid', 'partially_refunded'))::int as to_ship,
      (select count(*) from public.message_threads t
        where t.maker_id = ${makerId} and t.maker_needs_reply)::int as needs_reply`;
  return row!;
}
