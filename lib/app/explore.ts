/** Explore: the category tiles, "Shop by" pills and trending searches. Edit freely. */
export const EXPLORE_TILES = [
  { label: 'Dresses', href: '/explore?q=dress', image: '/seed/embroidered-ruffle-dress.jpg' },
  { label: 'Slips', href: '/explore?q=slip', image: '/seed/navy-satin-slip.jpg' },
  { label: 'Sets', href: '/explore?q=set', image: '/seed/wine-satin-halter-set.jpg' },
  { label: 'Occasion', href: '/explore?q=occasion', image: '/seed/tangerine-bias-maxi.jpg' },
  {
    label: 'Made to order',
    href: '/explore?filter=made_to_order',
    image: '/seed/lace-trim-maxi-dress.jpg',
  },
  { label: 'One of one', href: '/explore?filter=one_of_one', image: '/seed/crochet-lace-maxi.jpg' },
] as const;

export const SHOP_BY = [
  { label: 'New in', href: '/discover?sort=new' },
  { label: 'Under A$300', href: '/explore?filter=under_300' },
  { label: 'Ready to ship', href: '/explore?filter=ready_to_ship' },
  { label: 'Makers', href: '/makers' },
  { label: 'Occasions', href: '/discover?cat=occasion' },
] as const;

export const TRENDING = ['Satin slip', 'Linen set', 'Halter', 'Wedding guest', 'Bias cut', 'Wool'];
