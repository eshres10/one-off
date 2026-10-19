import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { writeLocalClaimPhoto } from '@/lib/claim-photos';
import {
  createClaim,
  escalateOverdueClaims,
  getClaim,
  resolveClaim,
  respondToClaim,
} from '@/lib/services/claims';
import { ADMIN, buyAndPay, buyer, pickVariant } from './helpers';

afterAll(closeDb);

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1]);
const DAY = 24 * 60 * 60 * 1000;

async function photoFor(userId: string) {
  const path = `${userId}/${randomUUID()}.jpg`;
  await writeLocalClaimPhoto(path, JPEG);
  return path;
}

const admin = { id: ADMIN.id, role: 'admin' as const, makerId: null };

describe('fault claims', () => {
  const b = buyer(2);
  const other = buyer(3);
  let orderItemId = '';
  let makerActor = { id: '', role: 'seller' as const, makerId: '' as string | null };
  let deliveredAt = new Date();

  beforeAll(async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 3);
    const { orderId } = await buyAndPay([{ productId: product.id, variantId }], b.email, b.id);
    const [item] = await sql()<{ id: string; makerId: string; userId: string }[]>`
      select oi.id, oi.maker_id, m.user_id from public.order_items oi join public.makers m on m.id = oi.maker_id
      where oi.order_id = ${orderId}`;
    orderItemId = item!.id;
    makerActor = { id: item!.userId, role: 'seller', makerId: item!.makerId };
    deliveredAt = new Date(Date.now() - 2 * DAY);
    await sql()`update public.order_items set fulfilment_status = 'delivered', delivered_at = ${deliveredAt}
                where id = ${orderItemId}`;
  });

  it('rejects reports after the 7-day window and points the buyer to support', async () => {
    const late = new Date(deliveredAt.getTime() + 8 * DAY);
    await expect(
      createClaim(
        b,
        {
          orderItemId,
          reason: 'faulty',
          outcome: 'refund',
          details: 'The side seam split on first wear.',
          photos: [await photoFor(b.id)],
        },
        late,
      ),
    ).rejects.toThrow(/contact us/i);
  });

  it('refuses photos uploaded by someone else', async () => {
    await expect(
      createClaim(b, {
        orderItemId,
        reason: 'faulty',
        outcome: 'refund',
        details: 'The side seam split on first wear.',
        photos: [await photoFor(other.id)],
      }),
    ).rejects.toThrow(/photos is invalid/);
  });

  let claimId = '';
  it('files a claim with photos inside the window and notifies maker, support and buyer', async () => {
    const before = await sql()<
      { count: number }[]
    >`select count(*)::int as count from public.email_outbox`;
    ({ claimId } = await createClaim(b, {
      orderItemId,
      reason: 'faulty',
      outcome: 'refund',
      details: 'The side seam split on first wear, about 5cm.',
      photos: [await photoFor(b.id), await photoFor(b.id)],
    }));
    const claim = await getClaim(b, claimId);
    expect(claim?.status).toBe('open');
    expect(claim?.photos).toHaveLength(2);
    expect(claim!.respondBy.getTime()).toBeGreaterThan(Date.now() + DAY);
    const templates = await sql()<{ template: string }[]>`
      select template from public.email_outbox order by created_at desc limit ${before[0]!.count + 10}`;
    const sent = templates.map((t) => t.template);
    expect(sent).toEqual(
      expect.arrayContaining(['claim_received', 'claim_new_seller', 'claim_new_support']),
    );
  });

  it('allows only one active claim per piece', async () => {
    await expect(
      createClaim(b, {
        orderItemId,
        reason: 'damaged',
        outcome: 'repair',
        details: 'Also a mark on the hem near the back.',
        photos: [await photoFor(b.id)],
      }),
    ).rejects.toThrow(/already reported/);
  });

  it('is visible to the buyer, the maker and admins only', async () => {
    expect(await getClaim(b, claimId)).not.toBeNull();
    expect(await getClaim(makerActor, claimId)).not.toBeNull();
    expect(await getClaim(admin, claimId)).not.toBeNull();
    expect(await getClaim(other, claimId)).toBeNull();
    const [otherMaker] = await sql()<{ id: string; userId: string }[]>`
      select id, user_id from public.makers where id <> ${makerActor.makerId} limit 1`;
    expect(
      await getClaim({ id: otherMaker!.userId, role: 'seller', makerId: otherMaker!.id }, claimId),
    ).toBeNull();
  });

  it('escalates when the maker has not responded within 2 business days', async () => {
    const claim = (await getClaim(admin, claimId))!;
    expect(await escalateOverdueClaims(new Date(claim.respondBy.getTime() - 60_000))).toBe(0);
    expect(await escalateOverdueClaims(new Date(claim.respondBy.getTime() + 60_000))).toBe(1);
    const after = (await getClaim(admin, claimId))!;
    expect(after.status).toBe('escalated');
    expect(after.escalatedAt).not.toBeNull();
    const [mail] = await sql()<{ template: string }[]>`
      select template from public.email_outbox where related_entity_id = ${claimId} order by created_at desc limit 1`;
    expect(mail?.template).toBe('claim_escalated');
  });

  it('lets the maker reply, but only One Off can close a claim without a remedy', async () => {
    await respondToClaim(makerActor, claimId, {
      proposal: 'repair',
      message: 'So sorry — I’ll restitch the seam this week.',
    });
    expect((await getClaim(b, claimId))?.sellerResponse).toMatch(/restitch/);
    await expect(
      resolveClaim(makerActor, claimId, { resolution: 'reject', note: 'Wear and tear only.' }),
    ).rejects.toThrow(/Only One Off/);
  });

  it('refunds through Stripe when an admin resolves with a refund', async () => {
    await resolveClaim(admin, claimId, {
      resolution: 'refund',
      refundCents: 2000,
      note: 'Partial refund agreed.',
    });
    const claim = (await getClaim(b, claimId))!;
    expect(claim.status).toBe('resolved_refund');
    expect(claim.refundCents).toBe(2000);
    const [item] = await sql()<{ refundedCents: number }[]>`
      select refunded_cents from public.order_items where id = ${orderItemId}`;
    expect(item!.refundedCents).toBe(2000);
    const [refund] = await sql()<{ reason: string }[]>`
      select reason from public.refunds where order_item_id = ${orderItemId} order by created_at desc limit 1`;
    expect(refund!.reason).toBe(`claim:${claimId}`);
  });
});
