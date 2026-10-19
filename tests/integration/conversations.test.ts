import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withUser } from '@/lib/db';
import {
  createCommissionRequest,
  onDepositPaid,
  startDepositCheckout,
} from '@/lib/services/commissions';
import {
  getThread,
  inboxCounts,
  ModerationError,
  openProductThread,
  sendMessage,
  sendQuote,
  unreadCount,
} from '@/lib/services/messaging';
import { MAKERS, PRODUCTS, buyer } from './helpers';

afterAll(closeDb);

const makerActor = (m: (typeof MAKERS)[number]) => ({
  id: m.userId,
  role: 'seller' as const,
  makerId: m.id,
  displayName: m.displayName,
  email: m.email,
});

describe('product conversations', () => {
  it('opens one thread per buyer + piece and tracks unread and needs-reply', async () => {
    const product = PRODUCTS.find((p) => p.productType === 'ready_to_ship')!;
    const maker = makerActor(product.maker);
    const b = { ...buyer(6), displayName: 'Test', makerId: null };

    const id = await openProductThread(b, { productId: product.id });
    expect(await openProductThread(b, { productId: product.id })).toBe(id);
    // Empty threads stay out of the inbox.
    const before = await inboxCounts(maker, 'maker');

    await sendMessage(b, { threadId: id, body: 'Does this run small?', imageUrls: [] });
    const [t] = await sql()<{ makerUnread: number; makerNeedsReply: boolean; replyDueAt: Date }[]>`
      select maker_unread, maker_needs_reply, reply_due_at from public.message_threads where id = ${id}`;
    expect(t).toMatchObject({ makerUnread: 1, makerNeedsReply: true });
    const hours = (new Date(t!.replyDueAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(5.9);
    expect(hours).toBeLessThanOrEqual(6);
    expect((await inboxCounts(maker, 'maker')).needsReply).toBe(before.needsReply + 1);

    // The maker opens it (unread clears) and replies (needs-reply clears, buyer gets an unread).
    await getThread(maker, id);
    await sendMessage(maker, { threadId: id, body: 'It runs true to size.', imageUrls: [] });
    const [after] = await sql()<
      { makerUnread: number; buyerUnread: number; makerNeedsReply: boolean }[]
    >`select maker_unread, buyer_unread, maker_needs_reply from public.message_threads where id = ${id}`;
    expect(after).toEqual({ makerUnread: 0, buyerUnread: 1, makerNeedsReply: false });
    expect(await unreadCount(b)).toBeGreaterThanOrEqual(1);
    await getThread(b, id);
    const [read] = await sql()<
      { buyerUnread: number }[]
    >`select buyer_unread from public.message_threads where id = ${id}`;
    expect(read!.buyerUnread).toBe(0);
  });

  it('blocks contact details for both sides, with role-specific wording', async () => {
    const product = PRODUCTS.find((p) => p.productType === 'made_to_order')!;
    const maker = makerActor(product.maker);
    const b = { ...buyer(7), displayName: 'Test', makerId: null };
    const id = await openProductThread(b, { productId: product.id });
    await expect(
      sendMessage(b, { threadId: id, body: 'email me: me@example.com', imageUrls: [] }),
    ).rejects.toThrow(/covered by buyer protection/);
    await expect(
      sendMessage(maker, { threadId: id, body: 'Pay via bank transfer, BSB 123', imageUrls: [] }),
    ).rejects.toThrow(/shop paused/);
    await expect(
      sendMessage(maker, { threadId: id, body: 'call 9876 5432', imageUrls: [] }),
    ).rejects.toBeInstanceOf(ModerationError);
    // The database refuses unflagged contact details even if the app check is bypassed.
    await expect(
      withUser(
        b,
        (db) => db`
        insert into public.messages (thread_id, sender_user_id, body) values (${id}, ${b.id}, 'paypal me')`,
      ),
    ).rejects.toThrow(/can.t be sent/);
  });
});

describe('custom requests', () => {
  it('opens a conversation, takes a quote and records the deposit', async () => {
    const m = MAKERS.find((x) => x.customCommissions)!;
    const maker = makerActor(m);
    const b = { ...buyer(8), displayName: 'Test', makerId: null };
    const requestId = await createCommissionRequest(b, {
      makerId: m.id,
      garmentType: 'Slip dress',
      budgetMin: 20_000,
      budgetMax: 40_000,
      inspirationImageUrls: [],
    });
    const [thread] = await sql()<{ id: string; kind: string }[]>`
      select id, kind from public.message_threads where commission_request_id = ${requestId}`;
    expect(thread?.kind).toBe('custom_request');

    await sendQuote(maker, { threadId: thread!.id, priceCents: 36_000, depositPct: 30, weeks: 3 });
    const [quoteMsg] = await sql()<{ kind: string; quote: { deposit_pct: number } }[]>`
      select kind, quote from public.messages where thread_id = ${thread!.id} and kind = 'quote'`;
    expect(quoteMsg?.quote.deposit_pct).toBe(30);

    const url = await startDepositCheckout(b, requestId);
    expect(url).toContain('/dev/checkout/');
    const [req] = await sql()<
      { status: string; agreedSpec: unknown; stripeDepositSessionId: string }[]
    >`
      select status, agreed_spec, stripe_deposit_session_id from public.commission_requests where id = ${requestId}`;
    expect(req?.status).toBe('accepted');
    expect(req?.agreedSpec).toBeTruthy();

    await onDepositPaid({
      id: req!.stripeDepositSessionId,
      amountTotal: 10_800,
      paymentIntentId: 'pi_test_deposit',
      metadata: { kind: 'commission_deposit', commission_request_id: requestId },
    });
    await onDepositPaid({
      id: req!.stripeDepositSessionId,
      amountTotal: 10_800,
      paymentIntentId: 'pi_test_deposit',
      metadata: { kind: 'commission_deposit', commission_request_id: requestId },
    });
    const system = await sql()<{ body: string }[]>`
      select body from public.messages where thread_id = ${thread!.id} and kind = 'system' and body like 'Deposit%'`;
    expect(system).toHaveLength(1);
    await expect(startDepositCheckout(b, requestId)).rejects.toThrow(/already paid/);
  });
});
