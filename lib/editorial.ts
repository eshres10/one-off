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

/** Homepage hero. An editorial placement (slot `home_hero`) can override the image and link. */
export const HERO = {
  eyebrow: 'Melbourne-made · Straight from the maker',
  title: 'Bespoke pieces made just for you',
  imageUrl: '/seed/hero-linen-suit.jpg',
  href: '/?tab=new',
};

/** Banner behind a maker's profile header until they upload their own cover. */
export const DEFAULT_MAKER_BANNER = '/seed/banner-velvet-sofa.jpg';
