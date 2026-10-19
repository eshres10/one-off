/**
 * Curated edits: a name, the words that define it (any of them matches, searched across name,
 * maker, category, tags and occasion) and the card that promotes it in the Discover feed.
 */
export interface Edit {
  slug: string;
  title: string;
  terms: string[];
  image: string;
  /** Shown as a card in the feed. */
  card?: boolean;
}

export const EDITS: Edit[] = [
  {
    slug: 'wedding-guest',
    title: 'The wedding guest edit',
    terms: ['wedding', 'guest', 'garden'],
    image: '/seed/lace-trim-maxi-dress.jpg',
    card: true,
  },
  {
    slug: 'melbourne-cup',
    title: 'Race day, done differently',
    terms: ['races', 'racing', 'cup'],
    image: '/seed/draped-satin-midi.jpg',
    card: true,
  },
  {
    slug: 'quiet-tailoring',
    title: 'Quiet tailoring',
    terms: ['blazer', 'suit', 'trouser', 'tailor', 'jacket'],
    image: '/seed/hero-linen-suit.jpg',
    card: true,
  },
  {
    slug: 'spring-racing',
    title: 'Spring racing',
    terms: ['races', 'racing', 'cup'],
    image: '/seed/draped-satin-midi.jpg',
  },
  {
    slug: 'summer-linen',
    title: 'Summer linen',
    terms: ['linen', 'cotton'],
    image: '/seed/lace-trim-maxi-dress.jpg',
  },
  {
    slug: 'party-season',
    title: 'Party season',
    terms: ['evening', 'party', 'satin', 'sequin'],
    image: '/seed/wine-satin-halter-set.jpg',
  },
  {
    slug: 'black-tie',
    title: 'Black tie',
    terms: ['evening', 'gown', 'maxi'],
    image: '/seed/navy-satin-slip.jpg',
  },
  {
    slug: 'garden-party',
    title: 'Garden party',
    terms: ['garden', 'floral', 'tiered', 'ruffle'],
    image: '/seed/tiered-ruffle-dress.jpg',
  },
  {
    slug: 'bridal',
    title: 'Bridal',
    terms: ['bridal', 'ivory', 'white'],
    image: '/seed/crochet-lace-maxi.jpg',
  },
  {
    slug: 'summer',
    title: 'Summer',
    terms: ['linen', 'cotton', 'slip', 'sundress'],
    image: '/seed/butter-silk-slip.jpg',
  },
  {
    slug: 'holiday',
    title: 'Holiday',
    terms: ['maxi', 'linen', 'resort'],
    image: '/seed/tangerine-bias-maxi.jpg',
  },
  {
    slug: 'work',
    title: 'Work',
    terms: ['blazer', 'trouser', 'shirt', 'skirt'],
    image: '/seed/hero-linen-suit.jpg',
  },
  {
    slug: 'everyday',
    title: 'Everyday',
    terms: ['cotton', 'linen', 'top', 'skirt'],
    image: '/seed/corset-front-mini.jpg',
  },
];

export const editBySlug = (slug: string | undefined) => EDITS.find((e) => e.slug === slug);
