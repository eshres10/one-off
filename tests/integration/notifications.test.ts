import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { resetEnvCache } from '@/lib/env';
import { handleInboundReply } from '@/lib/services/inbound';
import { notifyNewOrder, shipByReminders } from '@/lib/services/notifications';
import { MAKERS, buyAndPay, pickVariant } from './helpers';

const vars = process.env as Record<string, string | undefined>;
const saved = { ...vars };
function setEnv(overrides: Record<string, string>) {
  Object.assign(vars, overrides);
  resetEnvCache();
}
afterEach(() => {
  for (const k of Object.keys(vars)) if (!(k in saved)) delete vars[k];
  Object.assign(vars, saved);
  resetEnvCache();
});
afterAll(closeDb);

const MOBILE = '0412 000 111';

async function sale(skip: number) {
  const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', skip);
  const maker = MAKERS.find((m) => m.slug === product.maker.slug)!;
  await sql()`update public.makers set mobile = ${MOBILE} where id = ${maker.id}`;
  const { orderId } = await buyAndPay([{ productId: product.id, variantId }]);
  const [f] = await sql()<{ id: string; replyToken: string | null }[]>`
    select id, reply_token from public.fulfilments where order_id = ${orderId}`;
  return { orderId, product, variantId, maker, fulfilment: f! };
}

const texts = async (orderNumberLike: string) =>
  sql()<{ body: string; status: string }[]>`
    select body, status from public.notification_log where channel = 'sms' and to_address = '+61412000111'
      and body like ${`%${orderNumberLike}%`}`;

describe('telling makers about a sale', () => {
  it('emails the maker with ship-by, what they get, a deep link and the reply line', async () => {
    setEnv({ INBOUND_EMAIL_DOMAIN: 'reply.test' });
    const { orderId, maker, fulfilment, product } = await sale(10);
    expect(fulfilment.replyToken).toMatch(/^[A-Za-z0-9_-]{6,32}$/);
    const [e] = await sql()<{ subject: string; bodyText: string; bodyHtml: string }[]>`
      select subject, body_text, body_html from public.email_outbox
      where template = 'maker_new_order' and related_entity_id = ${orderId}`;
    expect(e!.subject).toContain(`You made a sale · ${product.title}, size`);
    expect(e!.bodyText).toMatch(/^Ship by /);
    expect(e!.bodyText).toContain('You get A$');
    expect(e!.bodyText).toContain('Or reply to this email with the tracking number.');
    expect(e!.bodyHtml).toContain(`/studio/orders?order=${fulfilment.id}`);
    expect(e!.bodyHtml).toContain('Add tracking &amp; mark shipped');
    expect(maker.email).toBeTruthy();
  });

  it('sends no text while SMS is switched off', async () => {
    const { product } = await sale(11);
    expect(await texts(product.title)).toHaveLength(0);
  });

  it('texts when SMS is on and the maker wants it, and not when they’ve turned it off', async () => {
    setEnv({ SMS_ENABLED: 'true' });
    const a = await sale(12);
    const [t] = await texts(a.product.title);
    expect(t!.body).toMatch(
      /^Off One: You made a sale! .+, size .+, to Fitzroy VIC\. Ship by .+\. Add tracking: http.+\/o\//,
    );

    await sql()`
      insert into public.notification_prefs (user_id, event, email, push, sms)
      values (${a.maker.userId}, 'new_order', true, true, false)
      on conflict (user_id, event) do update set sms = false`;
    await notifyNewOrder(a.fulfilment.id);
    expect(await texts(a.product.title)).toHaveLength(1);
    await sql()`delete from public.notification_prefs where user_id = ${a.maker.userId}`;
  });
});

describe('replying with a tracking number', () => {
  it('marks the order shipped from the maker’s own address only', async () => {
    const { maker, fulfilment } = await sale(14);
    const to = `orders+${fulfilment.replyToken}@reply.test`;
    expect(await handleInboundReply({ to, from: 'someone@else.test', text: '33ABC1234567' })).toBe(
      'not_owner',
    );
    expect(
      await handleInboundReply({ to, from: `Maker <${maker.email}>`, text: 'Posting soon!' }),
    ).toBe('no_tracking');
    expect(
      await handleInboundReply({ to, from: `Maker <${maker.email}>`, text: 'Sent: 33ABC1234567' }),
    ).toBe('shipped');
    const [f] = await sql()<{ status: string; carrier: string; trackingNumber: string }[]>`
      select status, carrier, tracking_number from public.fulfilments where id = ${fulfilment.id}`;
    expect(f).toEqual({ status: 'shipped', carrier: 'auspost', trackingNumber: '33ABC1234567' });
    expect(await handleInboundReply({ to, from: maker.email, text: 'Sent: 33ABC1234567' })).toBe(
      'already',
    );
  });
});

describe('ship-by reminders', () => {
  it('reminds once on the ship-by day', async () => {
    const { fulfilment } = await sale(15);
    await sql()`update public.fulfilments set estimated_dispatch_date = '2026-11-05'
      where id = ${fulfilment.id}`;
    // Midday on the east coast, 10am in Perth: past 8am wherever the maker is.
    const at = new Date('2026-11-05T02:00:00Z');
    await shipByReminders(at);
    await shipByReminders(at);
    const [n] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.email_outbox where template = 'maker_ship_by_reminder'
      and body_text like ${`%${fulfilment.id}%`}`;
    expect(n!.n).toBe(1);
  });
});

describe('low stock', () => {
  it('emails when a size drops to its last one', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 16);
    await sql()`update public.product_variants set stock_quantity = 2 where id = ${variantId}`;
    await buyAndPay([{ productId: product.id, variantId }]);
    const [n] = await sql()<{ n: number }[]>`
      select count(*)::int as n from public.email_outbox where template = 'maker_low_stock'
      and related_entity_id = ${product.id}`;
    expect(n!.n).toBe(1);
  });
});
