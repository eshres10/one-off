import type { EditorialTileData } from '@/components/product/ProductCard';

/** Editorial tiles inserted into product grids (images are local placeholders). */
export const FEED_EDITORIAL: EditorialTileData[] = [
  {
    kicker: 'The edit',
    title: 'Wedding guest, but not boring',
    cta: 'Shop the edit',
    href: '/collections/wedding-guest-but-not-boring',
    imageUrl: '/seed/editorial/race-day.svg',
  },
  {
    kicker: 'Made to order',
    title: 'Cut to your measurements',
    cta: 'How it works',
    href: '/help/how-it-works',
    imageUrl: '/seed/editorial/made-to-order.svg',
  },
  {
    kicker: 'One of one',
    title: 'There is only one. Then it’s gone.',
    cta: 'Shop one-of-ones',
    href: '/collections/one-of-one-pieces',
    imageUrl: '/seed/editorial/studio.svg',
  },
];
