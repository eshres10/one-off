import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { PREVIEW_ONLY_TAG } from '@/lib/domain/preview';
import { addToCart } from '@/lib/services/cart';
import { getCardsByIds } from '@/lib/queries/catalog';
import { pickVariant } from './helpers';

afterAll(closeDb);

describe('preview-only sample listings', () => {
  it('are labelled in the feed and can never be added to a bag', async () => {
    const { product, variantId } = await pickVariant((p) => p.productType === 'ready_to_ship', 6);
    await sql()`update public.products set tags = array_append(tags, ${PREVIEW_ONLY_TAG}) where id = ${product.id}`;
    try {
      const [card] = await getCardsByIds([product.id]);
      expect(card?.previewOnly).toBe(true);
      await expect(
        addToCart({
          sessionId: randomUUID(),
          userId: null,
          productId: product.id,
          variantId,
          quantity: 1,
        }),
      ).rejects.toThrow(/Preview only/);
    } finally {
      await sql()`update public.products set tags = array_remove(tags, ${PREVIEW_ONLY_TAG}) where id = ${product.id}`;
    }
  });
});
