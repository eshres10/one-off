import { getMaker, getProduct } from '@/lib/queries/catalog';
import { formatPrice } from '@/lib/domain/money';
import { cardVersion, type ShareCard } from './card';

const KIND: Record<string, string> = {
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
  ready_to_ship: 'Ready to ship',
};

const place = (city: string | null | undefined, state: string | null | undefined) =>
  [city, state].filter(Boolean).join(' ');

/** What a product's share card shows, and a version that changes with photo, name or price. */
export async function productCard(
  slug: string,
): Promise<{ card: ShareCard; version: string } | null> {
  const p = await getProduct(slug);
  if (!p) return null;
  const stock = p.variants.reduce((s, v) => s + Math.max(0, v.stockQuantity), 0);
  const sold = p.productType === 'one_of_one' && stock === 0;
  const card: ShareCard = {
    photoUrl: p.images[0]?.url ?? null,
    title: p.title,
    line: [p.maker.displayName, place(p.maker.city, p.maker.state)].filter(Boolean).join(' · '),
    detail: sold ? null : formatPrice(p.priceCents),
    kind: KIND[p.productType] ?? null,
    sold,
  };
  return { card, version: cardVersion([card.photoUrl, card.title, p.priceCents, sold]) };
}

/** A maker's share card: cover photo, name, craft · city state, and how many pieces. */
export async function makerCard(
  slug: string,
): Promise<{ card: ShareCard; version: string } | null> {
  const data = await getMaker(slug);
  if (!data) return null;
  const { maker, products } = data;
  const craft = maker.tags?.[0]
    ? maker.tags[0].charAt(0).toUpperCase() + maker.tags[0].slice(1)
    : null;
  const card: ShareCard = {
    photoUrl: maker.coverUrl ?? products[0]?.imageUrl ?? null,
    title: maker.displayName,
    line: [craft, place(maker.city, maker.state)].filter(Boolean).join(' · '),
    detail: `${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`,
    kind: 'Independent maker',
  };
  return { card, version: cardVersion([card.photoUrl, card.title, products.length]) };
}
