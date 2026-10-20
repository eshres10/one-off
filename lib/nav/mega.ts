/**
 * Desktop mega menu content (≥1024px). Edit links and tiles here; the components only lay it out.
 * Links point at /discover with the matching filters unless noted. Two kinds of content are filled
 * in from the database when the header renders: maker columns (`source`) and maker tiles (`maker`).
 */

import { SITE } from '@/lib/site/config';

export type MegaKey = 'new' | 'occasions' | 'makers';

export interface MegaLink {
  label: string;
  href: string;
}

export interface MegaColumn {
  title: string;
  links?: MegaLink[];
  /** Filled from Supabase: the featured makers, or the most recently approved ones. */
  source?: 'featured-makers' | 'new-makers';
}

export interface MegaTile {
  title: string;
  cta: string;
  href: string;
  image: string;
  /** Resolved at render time so the tile always names a real, live maker. */
  maker?: 'newest' | 'featured';
}

export interface MegaPanel {
  key: MegaKey;
  label: string;
  /** Where the trigger goes on smaller screens (no panel below 1024px). */
  href: string;
  columns: MegaColumn[];
  tiles: MegaTile[];
}

const d = (query: string) => `/discover?${query}`;

export const MEGA: MegaPanel[] = [
  {
    key: 'new',
    label: 'New in',
    href: d('sort=new'),
    columns: [
      {
        title: 'Shop new',
        links: [
          { label: 'All new arrivals', href: d('sort=new') },
          { label: 'Ready to ship', href: d('avail=rts&sort=new') },
          { label: 'Made to order', href: d('avail=mto&sort=new') },
          { label: 'One of one', href: d('avail=ooo&sort=new') },
          { label: 'Under A$300', href: d('cat=under-300&sort=new') },
        ],
      },
      {
        title: 'By category',
        links: [
          { label: 'Dresses', href: d('cat=dresses') },
          { label: 'Slips', href: d('cat=slips') },
          { label: 'Sets & two-pieces', href: d('cat=sets') },
          { label: 'Tailoring', href: d('cat=tailoring') },
          { label: 'Outerwear', href: d('cat=outerwear') },
        ],
      },
      {
        title: 'Edits',
        links: [
          { label: 'The Melbourne Cup edit', href: d('edit=melbourne-cup') },
          { label: 'Wedding guest', href: d('edit=wedding-guest') },
          { label: 'Summer linen', href: d('edit=summer-linen') },
          { label: 'Party season', href: d('edit=party-season') },
        ],
      },
    ],
    tiles: [
      {
        title: 'Most popular this week',
        cta: 'Shop now',
        href: d('sort=popular'),
        image: '/seed/tangerine-bias-maxi.jpg',
      },
      {
        title: 'Just joined',
        cta: 'Meet the maker',
        href: '/makers',
        image: '/seed/embroidered-ruffle-dress.jpg',
        maker: 'newest',
      },
    ],
  },
  {
    key: 'occasions',
    label: 'Occasions',
    href: d('cat=occasion'),
    columns: [
      {
        title: 'Events',
        links: [
          { label: 'Spring racing', href: d('edit=spring-racing') },
          { label: 'Weddings', href: d('edit=wedding-guest') },
          { label: 'Black tie', href: d('edit=black-tie') },
          { label: 'Garden party', href: d('edit=garden-party') },
          { label: 'Bridal', href: d('edit=bridal') },
        ],
      },
      {
        title: 'Season',
        links: [
          { label: 'Summer', href: d('edit=summer') },
          { label: 'Holiday', href: d('edit=holiday') },
          { label: 'Work', href: d('edit=work') },
          { label: 'Everyday', href: d('edit=everyday') },
        ],
      },
      {
        title: 'Made for you',
        links: [
          { label: 'Request a custom piece', href: '/custom' },
          { label: 'How made-to-order works', href: '/how-it-works' },
          { label: 'Book a fitting', href: '/pop-ups#fittings' },
        ],
      },
    ],
    tiles: [
      {
        title: 'Race day, done differently',
        cta: 'Shop the Cup edit',
        href: d('edit=melbourne-cup'),
        image: '/seed/draped-satin-midi.jpg',
      },
      {
        title: 'The wedding guest edit',
        cta: 'Shop the edit',
        href: d('edit=wedding-guest'),
        image: '/seed/lace-trim-maxi-dress.jpg',
      },
    ],
  },
  {
    key: 'makers',
    label: 'Makers',
    href: '/makers',
    columns: [
      { title: 'Featured', source: 'featured-makers' },
      { title: 'New makers', source: 'new-makers' },
      {
        // Discover's place filter matches a maker's suburb or city.
        title: 'By city',
        links: SITE.cities.map((c) => ({
          label: c,
          href: d(`suburb=${encodeURIComponent(c)}`),
        })),
      },
    ],
    tiles: [
      {
        title: 'Inside the studio',
        cta: 'Visit the studio',
        href: '/makers',
        image: '/seed/banner-velvet-sofa.jpg',
        maker: 'featured',
      },
      {
        title: 'Sell on Off One',
        cta: 'Apply to sell',
        href: '/sell/apply',
        image: '/seed/hero-linen-suit.jpg',
      },
    ],
  },
];

export interface MakerLink {
  slug: string;
  displayName: string;
  coverUrl: string | null;
}

/** Fills database-backed columns and maker tiles. */
export function resolveMega(featured: MakerLink[], newest: MakerLink[]): MegaPanel[] {
  const toLinks = (list: MakerLink[]) =>
    list.map((m) => ({ label: m.displayName, href: `/makers/${m.slug}` }));
  return MEGA.map((panel) => ({
    ...panel,
    columns: panel.columns.map((c) =>
      c.source === 'featured-makers'
        ? { ...c, links: [...toLinks(featured), { label: 'All makers', href: '/makers' }] }
        : c.source === 'new-makers'
          ? { ...c, links: toLinks(newest) }
          : c,
    ),
    tiles: panel.tiles.map((t) => {
      const m = t.maker === 'newest' ? newest[0] : t.maker === 'featured' ? featured[0] : null;
      if (!m) return t;
      return {
        ...t,
        title: t.maker === 'newest' ? `Just joined: ${m.displayName}` : `Inside ${m.displayName}`,
        href: `/makers/${m.slug}`,
        image: m.coverUrl && !m.coverUrl.endsWith('.svg') ? m.coverUrl : t.image,
      };
    }),
  }));
}
