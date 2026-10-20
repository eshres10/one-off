import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withUser } from '@/lib/db';
import { submitReview } from '@/lib/services/reviews';
import { ModerationError, sendMessage, startProductThread } from '@/lib/services/messaging';
import { updateFulfilment } from '@/lib/services/fulfilment';
import { MAKERS, PRODUCTS, buyAndPay, buyer, pickVariant, seller } from './helpers';

afterAll(closeDb);

describe('reviews', () => {
  it('a buyer cannot review an undelivered order', async () => {
    const b = buyer(2);
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 8);
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }], b.email, b.id);
    const [item] = await sql()<
      { id: string; fulfilmentId: string }[]
    >`select id, fulfilment_id from public.order_items where order_id = ${orderId}`;

    await expect(
      submitReview(b, { orderItemId: item!.id, rating: 5, body: 'Lovely dress, great fit!' }),
    ).rejects.toThrow(/delivered/);
    // Even bypassing the service, the database refuses it.
    await expect(
      withUser(
        b,
        (
          db,
        ) => db`insert into public.reviews (order_item_id, buyer_user_id, maker_id, product_id, rating, body)
        values (${item!.id}, ${b.id}, ${product.maker.id}, ${product.id}, 5, 'Sneaky early review')`,
      ),
    ).rejects.toThrow(/delivered/);

    // After the maker ships and delivers, the review is accepted — once.
    const s = { id: product.maker.userId, role: 'seller' as const, makerId: product.maker.id };
    await updateFulfilment(s, {
      action: 'shipped',
      fulfilmentId: item!.fulfilmentId,
      carrier: 'Australia Post',
      trackingNumber: 'AP123456',
    });
    await updateFulfilment(s, { action: 'delivered', fulfilmentId: item!.fulfilmentId });
    await expect(
      submitReview(b, { orderItemId: item!.id, rating: 5, body: 'Lovely dress, great fit!' }),
    ).resolves.toBeTruthy();
    await expect(
      submitReview(b, { orderItemId: item!.id, rating: 4, body: 'Trying to review twice' }),
    ).rejects.toThrow(/already/);
  });

  it('another user cannot review someone else’s delivered item', async () => {
    const [item] = await sql()<{ id: string }[]>`
      select oi.id from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.fulfilment_status = 'delivered' and o.buyer_user_id = ${buyer(0).id}
        and not exists (select 1 from public.reviews r where r.order_item_id = oi.id) limit 1`;
    if (!item) return;
    await expect(
      submitReview(buyer(5), { orderItemId: item.id, rating: 1, body: 'Not my order at all' }),
    ).rejects.toThrow(/Only the buyer/);
  });
});

describe('ask the maker', () => {
  it('creates a product-context thread and blocks off-platform contact', async () => {
    const b = buyer(4);
    const product = PRODUCTS.find((p) => p.productType === 'made_to_order')!;
    const threadId = await startProductThread(b, {
      productId: product.id,
      body: 'What size should I get?',
      imageUrls: [],
    });
    const [t] = await sql()<
      { context: { productTitle: string; imageUrl: string } }[]
    >`select context from public.message_threads where id = ${threadId}`;
    expect(t!.context.productTitle).toBe(product.title);
    expect(t!.context.imageUrl).toBeTruthy();

    await expect(
      sendMessage(b, { threadId, body: 'Just PayID me at 0412 345 678', imageUrls: [] }),
    ).rejects.toBeInstanceOf(ModerationError);
    const flagged =
      await sql()`select id from public.messages where thread_id = ${threadId} and is_flagged`;
    expect(flagged).toHaveLength(1);

    // A different buyer can't post into this thread.
    await expect(
      sendMessage(buyer(6), { threadId, body: 'Hello?', imageUrls: [] }),
    ).rejects.toThrow();
  });
});
