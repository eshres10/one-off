import { sql } from '@/lib/db';

export interface SetupProgress {
  agreement: boolean;
  payouts: boolean;
  shipping: boolean;
  piece: boolean;
  done: number;
  total: number;
}

/**
 * The four things an approved shop does before it goes live: sign the Seller Agreement, connect
 * payouts, set shipping and publish a first piece.
 */
export async function setupProgress(makerId: string): Promise<SetupProgress> {
  const [row] = await sql()<Omit<SetupProgress, 'done' | 'total'>[]>`
    select
      exists (select 1 from public.seller_agreements a where a.maker_id = m.id) as agreement,
      m.stripe_charges_enabled as payouts,
      exists (select 1 from public.maker_shipping_rates r where r.maker_id = m.id and r.enabled) as shipping,
      exists (select 1 from public.products p where p.maker_id = m.id and p.status = 'approved') as piece
    from public.makers m where m.id = ${makerId}`;
  const p = row ?? { agreement: false, payouts: false, shipping: false, piece: false };
  const done = [p.agreement, p.payouts, p.shipping, p.piece].filter(Boolean).length;
  return { ...p, done, total: 4 };
}
