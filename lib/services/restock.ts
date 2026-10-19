import { sql } from '@/lib/db';
import { audit } from '@/lib/audit';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { UserError } from './errors';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * "Notify me if {size} comes back". One waiting alert per person per size: asking twice is fine
 * and changes nothing. Only for sizes that are actually sold out.
 */
export async function requestRestockAlert(input: {
  variantId: string;
  userId: string | null;
  email: string | null;
}): Promise<{ created: boolean }> {
  const email = (input.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new UserError('Add a valid email address.');
  const [v] = await sql()<
    { productId: string; size: string; stock: number; productType: string }[]
  >`
    select v.product_id, v.size, v.stock_quantity as stock, p.product_type
    from public.product_variants v join public.products p on p.id = v.product_id
    where v.id = ${input.variantId} and p.status = 'approved' and v.is_active`;
  if (!v) throw new UserError('That size isn’t available.');
  if (v.stock > 0) throw new UserError('Good news: that size is in stock now.');
  if (v.productType === 'one_of_one') throw new UserError('One-of-ones aren’t restocked.');
  const rows = await sql()<{ id: string }[]>`
    insert into public.restock_alerts (product_id, variant_id, size, user_id, email)
    values (${v.productId}, ${input.variantId}, ${v.size}, ${input.userId}, ${email})
    on conflict (variant_id, lower(email)) where notified_at is null do nothing
    returning id`;
  if (rows.length)
    await audit(
      'restock_alert.created',
      { type: 'product', id: v.productId },
      { size: v.size },
      input.userId,
    );
  return { created: rows.length > 0 };
}

/**
 * Emails everyone waiting on a size that's back in stock, once each. Runs after a maker saves
 * stock and from the daily cron, so nothing waits on either.
 */
export async function sendRestockAlerts(productId?: string): Promise<number> {
  const due = await sql()<
    {
      id: string;
      email: string;
      productId: string;
      slug: string;
      title: string;
      size: string;
      makerName: string;
    }[]
  >`
    update public.restock_alerts a set notified_at = now()
    from public.product_variants v, public.products p, public.makers m
    where a.notified_at is null and v.id = a.variant_id and p.id = a.product_id and m.id = p.maker_id
      and v.stock_quantity > 0 and v.is_active and p.status = 'approved'
      ${productId ? sql()`and a.product_id = ${productId}` : sql()``}
    returning a.id, a.email, p.id as product_id, p.slug, p.title, a.size, m.display_name as maker_name`;
  for (const a of due) await sendEmail(emails.restockAlert(a.email, a));
  return due.length;
}
