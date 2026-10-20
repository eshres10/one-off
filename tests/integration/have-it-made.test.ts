import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withUser } from '@/lib/db';
import { mockStripe } from '@/lib/payments/mock';
import { CUSTOM } from '@/lib/custom/config';
import { EMPTY_BRIEF, type Brief } from '@/lib/custom/brief';
import { findMatches, getBuyerRequest, requestHelp, sendRequest } from '@/lib/services/custom';
import {
  cancelCustomOrder,
  createCustomOrder,
  payFabricAdvance,
  prepareCustomPayment,
  setMilestone,
} from '@/lib/services/custom-orders';
import { customRequestsTick } from '@/lib/services/custom-cron';
import {
  getMakerRequest,
  listMakerRequests,
  passRequest,
  saveCustomSettings,
  sendQuote,
} from '@/lib/services/custom-studio';
import {
  getHelpRequest,
  listHelpRequests,
  sendHelpRequestToMaker,
} from '@/lib/services/help-requests';
import { markDelivered, releaseDueTransfers } from '@/lib/services/payouts';
import { handleStripeEvent } from '@/lib/services/webhook';
import { ADMIN, MAKERS, buyer, seller, TEST_ADDRESS } from './helpers';

afterAll(closeDb);

const halde = MAKERS.findIndex((m) => m.slug === 'halde-studio');
const fern = MAKERS.findIndex((m) => m.slug === 'fern-and-thread');
const lune = MAKERS.findIndex((m) => m.slug === 'lune-studio');
const admin = { id: ADMIN.id, role: 'admin' as const, makerId: null };

const brief = (over: Partial<Brief> = {}): Brief => ({
  ...EMPTY_BRIEF,
  kind: 'dress',
  occasion: 'wedding_guest',
  dateChoice: 'later',
  words: 'Like the butter slip, but floor-length with a low back and fluttery sleeves.',
  fabrics: ['Silk'],
  details: ['Low back'],
  colour: 'Butter',
  fitMode: 'measurements',
  measurements: { bust: 88, waist: 70, hips: 96, height: 168 },
  budget: 1,
  postcode: '3065',
  suburb: 'Fitzroy',
  state: 'VIC',
  ...over,
});

async function pay(buyerActor: ReturnType<typeof buyer>, quoteId: string) {
  const p = await prepareCustomPayment(buyerActor, quoteId, TEST_ADDRESS);
  await mockStripe.succeedPaymentIntent(p.paymentIntentId, 'card');
  const event = mockStripe.event('payment_intent.succeeded', {
    id: p.paymentIntentId,
    object: 'payment_intent',
  });
  await handleStripeEvent(event as never);
  return p;
}

async function quoteFrom(makerIndex: number, requestId: string, price = 560) {
  return sendQuote(seller(makerIndex), {
    requestId,
    priceDollars: price,
    readyBy: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    fittings: 'none',
    fabric: 'Silk satin',
    note: 'I’d cut it on the bias with a cowl back and flutter sleeves.',
    sketchPath: null,
    canMakeToMeasurements: true,
  });
}

describe('Have it made: sending', () => {
  it('matches the three seeded shops and sends to the picked ones with reply_by = sent + 48 h', async () => {
    const b = buyer(6);
    const m = await findMatches(brief());
    expect(m.eligibleCount).toBeGreaterThanOrEqual(3);
    const picked = m.matches.slice(0, 2).map((x) => x.makerId);
    const sent = await sendRequest(b, brief(), picked);
    expect(sent.number).toMatch(/^OO-C-\d+$/);
    const rows = await sql()<{ makerId: string; replyBy: Date; sentAt: Date }[]>`
      select x.maker_id, x.reply_by, r.sent_at from public.custom_request_recipients x
      join public.custom_requests r on r.id = x.request_id where r.id = ${sent.id}`;
    expect(rows.map((r) => r.makerId).sort()).toEqual([...picked].sort());
    for (const r of rows)
      expect(new Date(r.replyBy).getTime() - new Date(r.sentAt).getTime()).toBe(
        CUSTOM.replyHours * 3_600_000,
      );
    const mail = await sql()<{ template: string }[]>`
      select template from public.email_outbox where related_entity_id = ${sent.id}`;
    expect(mail.filter((x) => x.template === 'custom_request_new')).toHaveLength(2);
    // Saved sizes: on by default.
    const [sizes] = await sql()<
      { bustCm: string }[]
    >`select bust_cm from public.buyer_measurements where user_id = ${b.id}`;
    expect(Number(sizes?.bustCm)).toBe(88);
  });

  it('refuses a fourth maker', async () => {
    const b = buyer(7);
    const m = await findMatches(brief());
    const four = [...m.matches.map((x) => x.makerId), '00000000-0000-4000-8000-000000000001'];
    await expect(sendRequest(b, brief(), four)).rejects.toThrow(/up to 3/);
  });

  it('a maker needs the measurements checkbox, and can edit until accepted', async () => {
    const b = buyer(8);
    const m = await findMatches(brief());
    const makerId = MAKERS[halde]!.id;
    expect(m.matches.some((x) => x.makerId === makerId)).toBe(true);
    const sent = await sendRequest(b, brief(), [makerId]);
    await expect(
      sendQuote(seller(halde), {
        requestId: sent.id,
        priceDollars: 500,
        readyBy: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        fittings: 'none',
        fabric: '',
        note: 'A long enough note for the buyer to read.',
        sketchPath: null,
        canMakeToMeasurements: false,
      }),
    ).rejects.toThrow(/measurements/);
    const first = await quoteFrom(halde, sent.id, 500);
    expect(first.updated).toBe(false);
    const again = await quoteFrom(halde, sent.id, 540);
    expect(again.updated).toBe(true);
    const view = await getBuyerRequest(b, sent.number);
    const q = view!.recipients[0]!.quote!;
    expect(q.price).toBe(54000);
    expect(q.editedAt).not.toBeNull();
    // A maker who wasn't picked can't quote.
    await expect(quoteFrom(fern, sent.id)).rejects.toThrow();
    // Pass hides the reason from the buyer.
    const other = await sendRequest(buyer(9), brief(), [MAKERS[fern]!.id]);
    await passRequest(seller(fern), other.id, 'budget');
    const v2 = await getBuyerRequest(buyer(9), other.number);
    expect(v2!.recipients[0]!.status).toBe('passed');
    expect(JSON.stringify(v2)).not.toContain('budget_low');
    expect(JSON.stringify(v2)).not.toContain('"passReason"');
  });
});

describe('Have it made: accepting, the advance and the payout', () => {
  it('accepting pays in full, withdraws the other quotes and tells those makers', async () => {
    const b = buyer(10);
    const sent = await sendRequest(b, brief(), [MAKERS[halde]!.id, MAKERS[lune]!.id]);
    await quoteFrom(halde, sent.id, 560);
    await quoteFrom(lune, sent.id, 640);
    const view = await getBuyerRequest(b, sent.number);
    const haldeQuote = view!.recipients.find((r) => r.makerId === MAKERS[halde]!.id)!.quote!;
    const p = await pay(b, haldeQuote.id);
    const [order] = await sql()<{ status: string; orderType: string; totalCents: number }[]>`
      select status, order_type, total_cents from public.orders where id = ${p.orderId}`;
    expect(order).toMatchObject({ status: 'paid', orderType: 'custom', totalCents: p.totalCents });
    const after = await getBuyerRequest(b, sent.number);
    expect(after!.status).toBe('accepted');
    expect(after!.recipients.find((r) => r.makerId === MAKERS[halde]!.id)!.status).toBe('chosen');
    const luneRow = after!.recipients.find((r) => r.makerId === MAKERS[lune]!.id)!;
    expect(luneRow.status).toBe('not_chosen');
    expect(luneRow.quote!.status).toBe('withdrawn');
    const mail = await sql()<{ template: string; toEmail: string }[]>`
      select template, to_email from public.email_outbox where related_entity_id in (${sent.id}, ${p.orderId})`;
    expect(mail).toContainEqual({ template: 'custom_not_chosen', toEmail: MAKERS[lune]!.email });
    expect(mail).toContainEqual({
      template: 'custom_quote_accepted',
      toEmail: MAKERS[halde]!.email,
    });
    // The chosen maker now sees the first name; through the view only.
    const [seen] = await withUser(
      seller(halde),
      (db) =>
        db<
          { buyerFirstName: string | null }[]
        >`select buyer_first_name from public.maker_request_view where id = ${sent.id}`,
    );
    expect(seen?.buyerFirstName).toBe(MAKERS[halde] ? b.displayName.split(' ')[0] : null);
    // Paying the same quote again is refused.
    await expect(createCustomOrder(b, haldeQuote.id, TEST_ADDRESS)).rejects.toThrow(/already/);
  });

  it('"fabric bought" pays exactly one 30% advance, and delivery pays the rest', async () => {
    const b = buyer(11);
    const sent = await sendRequest(b, brief(), [MAKERS[halde]!.id]);
    await quoteFrom(halde, sent.id, 600);
    const q = (await getBuyerRequest(b, sent.number))!.recipients[0]!.quote!;
    const p = await pay(b, q.id);
    await setMilestone(seller(halde), p.orderId, 'sketch_shared', { note: 'Bias cut, cowl back.' });
    await setMilestone(seller(halde), p.orderId, 'fabric_bought');
    await setMilestone(seller(halde), p.orderId, 'fabric_bought'); // a double click
    await payFabricAdvance(p.orderId);
    const transfers = await sql()<{ n: number; amount: number }[]>`
      select count(*)::int as n, coalesce(sum((data->>'amountCents')::int), 0)::int as amount
      from public.mock_stripe_objects where type = 'transfer' and data->>'transferGroup' = ${p.orderId}`;
    const [o] = await sql()<
      { advance: number; feeBps: number; net: number; fulfilmentId: string }[]
    >`
      select o.fabric_advance_cents as advance, round(f.commission_pct_applied * 100)::int as fee_bps, f.seller_net_cents as net, f.id as fulfilment_id
      from public.orders o join public.fulfilments f on f.order_id = o.id where o.id = ${p.orderId}`;
    const gross = Math.round((60000 * CUSTOM.advancePct) / 100);
    const expected = gross - Math.floor((gross * o!.feeBps + 5000) / 10000);
    expect(transfers[0]).toEqual({ n: 1, amount: expected });
    expect(o!.advance).toBe(expected);
    const mail = await sql()<{ template: string }[]>`
      select template from public.email_outbox where related_entity_id = ${p.orderId} and template = 'custom_milestone'`;
    expect(mail).toHaveLength(2); // sketch, fabric: the double click sent nothing

    // Made → sent → delivered → the final transfer is the net less the advance.
    await setMilestone(seller(halde), p.orderId, 'made');
    await sql()`update public.fulfilments set status = 'shipped', shipped_at = now() where id = ${o!.fulfilmentId}`;
    await markDelivered(o!.fulfilmentId, 'admin', new Date(Date.now() - 10 * 86_400_000));
    await sql()`update public.fulfilments set payout_due_at = now() - interval '1 hour' where id = ${o!.fulfilmentId}`;
    await releaseDueTransfers(new Date());
    const [f] = await sql()<{ transferAmountCents: number; sellerNetCents: number }[]>`
      select transfer_amount_cents, seller_net_cents from public.fulfilments where id = ${o!.fulfilmentId}`;
    expect(f!.transferAmountCents).toBe(f!.sellerNetCents - expected);
    const total = await sql()<{ amount: number }[]>`
      select coalesce(sum((data->>'amountCents')::int), 0)::int as amount
      from public.mock_stripe_objects where type = 'transfer' and data->>'transferGroup' = ${p.orderId}`;
    expect(total[0]!.amount).toBe(f!.sellerNetCents);
  });

  it('cancelling after the advance refunds the buyer in full and recovers the advance from the maker', async () => {
    const b = buyer(12);
    const sent = await sendRequest(b, brief(), [MAKERS[halde]!.id]);
    await quoteFrom(halde, sent.id, 500);
    const q = (await getBuyerRequest(b, sent.number))!.recipients[0]!.quote!;
    const p = await pay(b, q.id);
    await setMilestone(seller(halde), p.orderId, 'fabric_bought');
    const r = await cancelCustomOrder(seller(halde), p.orderId, 'Fabric never arrived');
    expect(r.refundedCents).toBe(p.totalCents);
    expect(r.advanceRecovered).toBeGreaterThan(0);
    const [o] = await sql()<
      { status: string; refundedCents: number }[]
    >`select status, refunded_cents from public.orders where id = ${p.orderId}`;
    expect(o).toEqual({ status: 'refunded', refundedCents: p.totalCents });
    const adj = await sql()<{ amountCents: number; reason: string }[]>`
      select a.amount_cents, a.reason from public.maker_adjustments a join public.fulfilments f on f.id = a.fulfilment_id
      where f.order_id = ${p.orderId} and a.applied_at is null`;
    expect(adj).toHaveLength(1);
    expect(adj[0]!.amountCents).toBe(r.advanceRecovered);
    expect(adj[0]!.reason).toMatch(/fabric advance/);
  });
});

describe('Have it made: help, settings and the clock', () => {
  it('"Ask Off One for help" makes a help request; the admin sends it to a shop, which sees a normal request', async () => {
    const b = buyer(13);
    const h = await requestHelp(b, { brief: brief({ budget: 0 }), note: 'Flexible on the date.' });
    const rows = await listHelpRequests();
    const mine = rows.find((r) => r.number === h.number)!;
    expect(mine.status).toBe('open');
    const mail = await sql()<
      { template: string }[]
    >`select template from public.email_outbox where related_entity_id = ${mine.id}`;
    expect(mail.map((m) => m.template)).toContain('custom_help_request');
    await sendHelpRequestToMaker(admin, mine.id, MAKERS[fern]!.id);
    const detail = await getHelpRequest(mine.id);
    expect(detail!.status).toBe('matched');
    const seen = await listMakerRequests(seller(fern));
    const row = seen.find((r) => r.number === h.number)!;
    expect(row.recipientStatus).toBe('pending');
    expect(row.hoursLeft).toBeGreaterThan(40);
    const full = await getMakerRequest(seller(fern), row.id);
    expect(full!.matchReasons).toEqual(['Picked by the Off One team']);
    expect(full!.measurements).toMatchObject({ bust: 88 });
    // Not sent to another maker: they see nothing.
    expect((await listMakerRequests(seller(lune))).some((r) => r.number === h.number)).toBe(false);
  });

  it('custom work settings gate matching', async () => {
    const s = seller(lune);
    const before = await findMatches(brief());
    expect(before.matches.some((m) => m.makerId === MAKERS[lune]!.id)).toBe(true);
    await saveCustomSettings(s, {
      open: false,
      spotsPerMonth: 4,
      categories: ['Dresses'],
      fabrics: ['Silk'],
      minPrice: 700,
      leadTime: '5+ weeks',
      fittingsInPerson: true,
      fittingRadiusKm: 10,
      postsAustraliaWide: false,
      studioPostcode: '3182',
    });
    const after = await findMatches(brief());
    expect(after.matches.some((m) => m.makerId === MAKERS[lune]!.id)).toBe(false);
    await saveCustomSettings(s, {
      open: true,
      spotsPerMonth: 4,
      categories: ['Dresses', 'Two-piece sets', 'Tailoring'],
      fabrics: ['Silk', 'Wool'],
      minPrice: 700,
      leadTime: '5+ weeks',
      fittingsInPerson: true,
      fittingRadiusKm: 10,
      postsAustraliaWide: false,
      studioPostcode: '3182',
    });
  });

  it('the clock: 48 h expiry with a summary, a 24 h reminder, and quote expiry', async () => {
    const b = buyer(14);
    const sent = await sendRequest(b, brief(), [MAKERS[halde]!.id, MAKERS[fern]!.id]);
    await quoteFrom(halde, sent.id, 500);
    // Pretend 30 hours passed: Fern gets one reminder.
    await sql()`update public.custom_request_recipients set created_at = now() - interval '30 hours' where request_id = ${sent.id}`;
    const t1 = await customRequestsTick(new Date());
    expect(t1.remindersSent).toBe(1);
    expect((await customRequestsTick(new Date())).remindersSent).toBe(0);
    // Then 48 hours: Fern expires, the buyer hears "1 of 2 replied".
    await sql()`update public.custom_request_recipients set reply_by = now() - interval '1 minute' where request_id = ${sent.id}`;
    const t2 = await customRequestsTick(new Date());
    expect(t2.expiredRecipients).toBe(1);
    expect(t2.summariesSent).toBe(1);
    const view = await getBuyerRequest(b, sent.number);
    expect(view!.recipients.find((r) => r.makerId === MAKERS[fern]!.id)!.status).toBe('expired');
    expect(view!.status).toBe('quoted');
    // Six days on: the buyer is warned; after seven the quote expires.
    await sql()`update public.custom_quotes set valid_until = now() + interval '12 hours' where request_id = ${sent.id}`;
    expect((await customRequestsTick(new Date())).expiryWarnings).toBe(1);
    await sql()`update public.custom_quotes set valid_until = now() - interval '1 minute' where request_id = ${sent.id}`;
    expect((await customRequestsTick(new Date())).quotesExpired).toBe(1);
    const mail = await sql()<
      { template: string }[]
    >`select template from public.email_outbox where related_entity_id = ${sent.id}`;
    const names = mail.map((m) => m.template);
    expect(names).toContain('custom_request_reminder');
    expect(names).toContain('custom_replies');
    expect(names).toContain('custom_quote_expiring');
  });
});
