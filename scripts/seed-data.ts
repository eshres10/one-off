/**
 * Deterministic seed definitions shared by the image generator and the database seeder.
 * Everything is derived from fixed lists and a seeded PRNG, so repeated runs produce identical
 * rows and ids (which makes `npm run db:seed` idempotent).
 */
import { createHash } from 'node:crypto';

export type ProductType = 'ready_to_ship' | 'made_to_order' | 'one_of_one';
export type Shape = 'dress' | 'slip' | 'maxi' | 'skirt' | 'top' | 'set' | 'jacket';
export type Pattern = 'solid' | 'stripes' | 'dots' | 'gingham' | 'floral' | 'patchwork' | 'pleats';

const NAMESPACE = 'atelier-locale-seed-v1';

/** Name-based UUID (v5-style, SHA-1) so seeded ids are stable across runs. */
export function seedId(name: string): string {
  const h = createHash('sha1').update(`${NAMESPACE}:${name}`).digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Mulberry32 PRNG. */
export function rng(seed: string) {
  let a = createHash('sha1').update(seed).digest().readUInt32LE(0);
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    chance: (p: number) => next() < p,
  };
}

export const PASSWORD = 'password123';

export const COLOURS: Record<string, string> = {
  Ivory: '#EFE6D6',
  Black: '#24211E',
  Sage: '#9FAE8A',
  Terracotta: '#C2694A',
  Cobalt: '#2F51A0',
  Blush: '#E5B3AC',
  Butter: '#EDD48A',
  Chocolate: '#5A3A2A',
  Emerald: '#2E6A4E',
  Lilac: '#B6A3D1',
  Rust: '#A3552D',
  Navy: '#1F2A44',
  Scarlet: '#A8322D',
  Oat: '#D8C8AE',
  Olive: '#6C6A3A',
  Tangerine: '#D9733A',
  Wine: '#6B1E2A',
};

export const BACKDROPS = [
  '#EDE6DC',
  '#E4DCD1',
  '#F1ECE4',
  '#DCD3C7',
  '#E9E1D8',
  '#D9CFC2',
  '#EFE9E2',
];

export interface MakerSeed {
  key: string;
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  email: string;
  tagline: string;
  city: 'Melbourne' | 'Sydney' | 'Brisbane' | 'Adelaide';
  state: 'VIC' | 'NSW' | 'QLD' | 'SA';
  suburb: string;
  story: string;
  process: string;
  materials: string;
  sizingNotes: string;
  leadTimeDays: number;
  responseTimeHours: number;
  dispatchDays: number;
  shippingStandardCents: number;
  freeShippingOverCents: number | null;
  customCommissions: boolean;
  focus: Shape[];
  palette: string[];
  accent: string;
  /** Days since the maker was approved; under 60 shows them in the "New makers" rail. */
  joinedDaysAgo: number;
  /** Supplied portrait in public/seed (placeholder until the maker uploads their own). */
  portrait?: string;
}

const MAKER_DEFS: Array<Omit<MakerSeed, 'id' | 'userId' | 'email' | 'key'>> = [
  {
    slug: 'halde-studio',
    displayName: 'Halde Studio',
    tagline: 'Bias-cut silk slips, cut one at a time in Collingwood.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Collingwood',
    story:
      'Halde started with a single slip pattern and a bolt of navy satin. Five years on, every piece is still cut on the bias by hand, one at a time.',
    process: 'Drafted, cut and sewn in our Collingwood studio in runs of six per size.',
    materials: 'Silk satin and crepe from Melbourne mill end-of-rolls.',
    sizingNotes: 'Bias cut skims the body; take your usual AU size. Between sizes, size up.',
    leadTimeDays: 14,
    responseTimeHours: 3,
    dispatchDays: 2,
    shippingStandardCents: 1200,
    freeShippingOverCents: 40000,
    customCommissions: true,
    focus: ['slip', 'dress', 'maxi'],
    palette: ['Navy', 'Butter', 'Black', 'Ivory'],
    accent: '#1F2A44',
    joinedDaysAgo: 240,
    portrait: '/seed/maker-halde-studio.jpg',
  },
  {
    slug: 'mara-kovac',
    displayName: 'Mara Kovač',
    tagline: 'Satin sets and halter tops in jewel tones.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Brunswick',
    story:
      'Mara trained in costume before opening her Brunswick studio. Her sets are made to be split up and worn a dozen ways.',
    process: 'Every set is made to order in Brunswick, so we only cut what is ordered.',
    materials: 'Heavy satin and silk crepe, sourced from Australian wholesalers.',
    sizingNotes: 'Halter tops tie to fit; trousers have an elasticated back waist.',
    leadTimeDays: 18,
    responseTimeHours: 5,
    dispatchDays: 3,
    shippingStandardCents: 1200,
    freeShippingOverCents: 40000,
    customCommissions: true,
    focus: ['set', 'top', 'slip'],
    palette: ['Wine', 'Emerald', 'Chocolate', 'Black'],
    accent: '#6B1E2A',
    joinedDaysAgo: 200,
    portrait: '/seed/maker-mara-kovac.jpg',
  },
  {
    slug: 'ottilie-ree',
    displayName: 'Ottilie Ree',
    tagline: 'Romantic lace-trimmed dresses for long lunches and weddings.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Northcote',
    story: 'Ottilie makes the dresses she could never find: floaty, feminine and finished by hand.',
    process: 'Pieces are cut in Northcote and finished with hand-sewn lace trims.',
    materials: 'Cotton voile, silk and vintage lace trims.',
    sizingNotes: 'Relaxed through the body with adjustable straps.',
    leadTimeDays: 16,
    responseTimeHours: 6,
    dispatchDays: 3,
    shippingStandardCents: 1200,
    freeShippingOverCents: 35000,
    customCommissions: false,
    focus: ['dress', 'maxi', 'slip'],
    palette: ['Ivory', 'Blush', 'Butter', 'Sage'],
    accent: '#E5B3AC',
    joinedDaysAgo: 170,
    portrait: '/seed/maker-ottilie-ree.jpg',
  },
  {
    slug: 'wren-label',
    displayName: 'Wren Label',
    tagline: 'Evening satin with an open back.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Footscray',
    story:
      'Wren Label is two sisters in a Footscray warehouse making the eveningwear they wanted to wear out.',
    process: 'Small runs, cut and sewn in Footscray.',
    materials: 'Recycled satin and deadstock crepe.',
    sizingNotes: 'Fitted through the hip; size up if between sizes.',
    leadTimeDays: 12,
    responseTimeHours: 4,
    dispatchDays: 2,
    shippingStandardCents: 1000,
    freeShippingOverCents: 30000,
    customCommissions: false,
    focus: ['slip', 'set', 'dress'],
    palette: ['Black', 'Navy', 'Scarlet', 'Ivory'],
    accent: '#24211E',
    joinedDaysAgo: 140,
    portrait: '/seed/maker-wren-label.jpg',
  },
  {
    slug: 'sundry-atelier',
    displayName: 'Sundry Atelier',
    tagline: 'Hand-crocheted one-of-ones from reclaimed yarn.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Fitzroy',
    story:
      'Sundry Atelier hand-crochets every piece from reclaimed cotton yarn. No two are the same.',
    process: 'Each piece is crocheted by hand over two to three weeks.',
    materials: 'Reclaimed cotton yarn and vintage lace.',
    sizingNotes: 'Stretchy crochet; each listing shows the exact measurements.',
    leadTimeDays: 21,
    responseTimeHours: 8,
    dispatchDays: 3,
    shippingStandardCents: 1200,
    freeShippingOverCents: null,
    customCommissions: false,
    focus: ['maxi', 'top', 'dress'],
    palette: ['Oat', 'Ivory', 'Blush', 'Rust'],
    accent: '#D8C8AE',
    joinedDaysAgo: 110,
  },
  {
    slug: 'atelier-noor',
    displayName: 'Atelier Noor',
    tagline: 'Embroidered occasionwear, made to your measurements.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Carlton',
    story:
      'Atelier Noor opened in Carlton this spring, bringing hand embroidery to made-to-measure occasionwear.',
    process: 'Every piece is made to order and embroidered by hand in Carlton.',
    materials: 'Cotton organza, silk and hand embroidery threads.',
    sizingNotes: 'Made to your measurements; we confirm fit before cutting.',
    leadTimeDays: 21,
    responseTimeHours: 4,
    dispatchDays: 3,
    shippingStandardCents: 1200,
    freeShippingOverCents: 45000,
    customCommissions: true,
    focus: ['dress', 'maxi', 'dress'],
    palette: ['Ivory', 'Butter', 'Sage', 'Blush'],
    accent: '#EFE6D6',
    joinedDaysAgo: 12,
  },
  {
    slug: 'fern-and-thread',
    displayName: 'Fern & Thread',
    tagline: 'Tiered ruffle dresses from deadstock cotton.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Fitzroy',
    story:
      'Fern & Thread rescues deadstock cotton from Melbourne mills and turns it into tiered dresses.',
    process: 'Cut and sewn in Fitzroy, often as one-off pieces when a roll runs out.',
    materials: 'Deadstock cotton and linen.',
    sizingNotes: 'Relaxed fit with an elasticated waist.',
    leadTimeDays: 14,
    responseTimeHours: 6,
    dispatchDays: 3,
    shippingStandardCents: 1000,
    freeShippingOverCents: 30000,
    customCommissions: false,
    focus: ['dress', 'skirt', 'top'],
    palette: ['Olive', 'Rust', 'Oat', 'Sage'],
    accent: '#6C6A3A',
    joinedDaysAgo: 20,
  },
  {
    slug: 'lune-studio',
    displayName: 'Lune Studio',
    tagline: 'Bias maxis in sunset colours.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'St Kilda',
    story:
      'Lune Studio is a St Kilda label making bias-cut maxis inspired by late summer evenings by the water.',
    process: 'Ready to ship from our St Kilda studio, cut in small runs.',
    materials: 'Silk-feel recycled satin.',
    sizingNotes: 'Bias cut; take your usual size.',
    leadTimeDays: 10,
    responseTimeHours: 3,
    dispatchDays: 2,
    shippingStandardCents: 1000,
    freeShippingOverCents: 30000,
    customCommissions: false,
    focus: ['maxi', 'slip', 'dress'],
    palette: ['Tangerine', 'Butter', 'Blush', 'Navy'],
    accent: '#D9733A',
    joinedDaysAgo: 31,
  },
  {
    slug: 'studio-ines',
    displayName: 'Studio Ines',
    tagline: 'Draped satin midis for the races and beyond.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Richmond',
    story:
      'Studio Ines drapes every pattern on the stand before it is cut, so the satin falls just so.',
    process: 'Made to order in Richmond.',
    materials: 'Heavy satin and crepe-back satin.',
    sizingNotes: 'Draped fit; we can adjust the length to your height.',
    leadTimeDays: 18,
    responseTimeHours: 5,
    dispatchDays: 3,
    shippingStandardCents: 1200,
    freeShippingOverCents: 40000,
    customCommissions: true,
    focus: ['dress', 'skirt', 'set'],
    palette: ['Chocolate', 'Black', 'Emerald', 'Wine'],
    accent: '#5A3A2A',
    joinedDaysAgo: 42,
  },
  {
    slug: 'pia-marchetti',
    displayName: 'Pia Marchetti',
    tagline: 'Corsetry-inspired minis and tops.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Thornbury',
    story: 'Pia Marchetti brings corsetry details to everyday dresses, cut and boned in Thornbury.',
    process: 'Ready to ship from Thornbury in small runs.',
    materials: 'Cotton drill, denim and satin with spiral steel boning.',
    sizingNotes: 'Structured bodice; the lace-up front adjusts the fit.',
    leadTimeDays: 12,
    responseTimeHours: 7,
    dispatchDays: 2,
    shippingStandardCents: 1000,
    freeShippingOverCents: 30000,
    customCommissions: false,
    focus: ['dress', 'top', 'skirt'],
    palette: ['Navy', 'Black', 'Ivory', 'Scarlet'],
    accent: '#2F51A0',
    joinedDaysAgo: 55,
  },
];

export const MAKERS: MakerSeed[] = MAKER_DEFS.map((m) => ({
  ...m,
  key: m.slug,
  id: seedId(`maker:${m.slug}`),
  userId: seedId(`user:maker:${m.slug}`),
  email: `studio@${m.slug}.test`,
}));

const CATEGORY_BY_SHAPE: Record<Shape, string> = {
  dress: 'dresses',
  slip: 'dresses',
  maxi: 'occasionwear',
  skirt: 'skirts',
  top: 'tops',
  set: 'sets',
  jacket: 'outerwear',
};

const STYLE_NAMES: Record<Shape, string[]> = {
  dress: [
    'Midi Dress',
    'Puff-Sleeve Dress',
    'Wrap Dress',
    'Smock Dress',
    'Shirt Dress',
    'Corset Dress',
  ],
  slip: ['Bias Slip Dress', 'Cowl Slip', 'Camisole Dress', 'Column Slip'],
  maxi: ['Gown', 'Maxi Dress', 'Tiered Maxi', 'Halter Gown', 'Column Gown'],
  skirt: ['Pleated Midi Skirt', 'Bias Skirt', 'Wrap Skirt', 'Tiered Skirt', 'Box-Pleat Skirt'],
  top: ['Blouse', 'Tie-Front Top', 'Bustier Top', 'Smock Top'],
  set: ['Two-Piece Set', 'Patchwork Set', 'Co-ord'],
  jacket: ['Chore Jacket', 'Quilted Jacket', 'Cropped Jacket', 'Patchwork Jacket'],
};

const FIRST_NAMES = [
  'Marguerite',
  'Odette',
  'Sorrento',
  'Ines',
  'Clementine',
  'Juniper',
  'Vivienne',
  'Matilda',
  'Rosalind',
  'Saffron',
  'Delphine',
  'Wattle',
  'Banksia',
  'Coralie',
  'Lune',
  'Hazel',
  'Magnolia',
  'Petra',
  'Gwendolyn',
  'Elsie',
  'Isadora',
  'Ottoline',
  'Bellamy',
  'Freya',
  'Pippa',
  'Coco',
  'Avalon',
  'Mirabel',
  'Noor',
  'Thea',
  'Ada',
  'Iris',
];

export const SIZES = ['6', '8', '10', '12', '14', '16', '18'];
export const MTO_SIZES = ['6', '8', '10', '12', '14', '16', '18', '20', '22'];

export interface ProductSeed {
  id: string;
  slug: string;
  maker: MakerSeed;
  title: string;
  description: string;
  category: string;
  shape: Shape;
  pattern: Pattern;
  productType: ProductType;
  priceCents: number;
  colours: string[];
  tags: string[];
  fabric: string;
  care: string;
  modelHeightCm: number;
  modelSizeWorn: string;
  leadTimeDays: number | null;
  madeToOrderOptions: string | null;
  isFeatured: boolean;
  createdDaysAgo: number;
  variants: Array<{ id: string; size: string; colour: string; stock: number; sku: string }>;
  measurements: Array<{ name: string; valueCm: number }>;
  images: Array<{
    path: string;
    url: string;
    alt: string;
    view: number;
    width: number;
    height: number;
  }>;
  occasions: string[];
}

/**
 * The twelve photographed pieces (public/seed/<slug>.jpg). Each takes a fixed slot in its maker's
 * range; the other generated pieces keep their drawn placeholder images.
 */
interface HeroSeed {
  slug: string;
  title: string;
  maker: string;
  slot: number;
  shape: Shape;
  category?: string;
  productType: ProductType;
  priceCents: number;
  colour: string;
  occasions: string[];
  alt: string;
  /** Leaves only two in stock, so Saved shows an "Only 2 left" alert. */
  lowStock?: boolean;
}

export const HEROES: HeroSeed[] = [
  {
    slug: 'navy-satin-slip',
    title: 'Navy Satin Slip',
    maker: 'halde-studio',
    slot: 0,
    shape: 'slip',
    productType: 'ready_to_ship',
    priceCents: 26000,
    colour: 'Navy',
    occasions: ['evening', 'wedding guest'],
    alt: 'Model in a navy satin cowl-neck slip dress that falls below the knee',
  },
  {
    slug: 'butter-silk-slip',
    title: 'Butter Silk Slip',
    maker: 'halde-studio',
    slot: 1,
    shape: 'slip',
    productType: 'ready_to_ship',
    priceCents: 24000,
    colour: 'Butter',
    occasions: ['evening'],
    alt: 'Model in a butter-yellow V-neck silk slip dress',
  },
  {
    slug: 'wine-satin-halter-set',
    title: 'Wine Satin Halter Set',
    maker: 'mara-kovac',
    slot: 0,
    shape: 'set',
    productType: 'made_to_order',
    priceCents: 34000,
    colour: 'Wine',
    occasions: ['evening'],
    alt: 'Model walking in a wine satin cowl halter top and matching wide-leg trousers',
  },
  {
    slug: 'lace-trim-maxi-dress',
    title: 'Lace Trim Maxi Dress',
    maker: 'ottilie-ree',
    slot: 0,
    shape: 'maxi',
    productType: 'made_to_order',
    priceCents: 42000,
    colour: 'Sage',
    occasions: ['wedding guest'],
    alt: 'Model seated in a sage satin maxi dress with lace trim',
  },
  {
    slug: 'lace-strap-slip-dress',
    title: 'Lace Panel Slip Maxi',
    maker: 'ottilie-ree',
    slot: 1,
    shape: 'slip',
    productType: 'ready_to_ship',
    priceCents: 28000,
    colour: 'Chocolate',
    occasions: ['wedding guest'],
    alt: 'Model in a sheer chocolate-brown maxi slip with a cream lace panel down one side',
  },
  {
    slug: 'satin-open-back-jumpsuit',
    title: 'Satin Open-Back Jumpsuit',
    maker: 'wren-label',
    slot: 0,
    shape: 'set',
    category: 'jumpsuits',
    productType: 'ready_to_ship',
    priceCents: 32000,
    colour: 'Ivory',
    occasions: ['evening'],
    alt: 'Model in a champagne satin jumpsuit with fine straps and wide legs',
  },
  {
    slug: 'crochet-lace-maxi',
    title: 'Crochet Lace Maxi',
    maker: 'sundry-atelier',
    slot: 0,
    shape: 'maxi',
    productType: 'one_of_one',
    priceCents: 38000,
    colour: 'Blush',
    occasions: ['wedding guest'],
    alt: 'Model in a blush hand-crocheted lace maxi with a handkerchief hem',
  },
  {
    slug: 'embroidered-ruffle-dress',
    title: 'Embroidered Ruffle Dress',
    maker: 'atelier-noor',
    slot: 0,
    shape: 'dress',
    productType: 'made_to_order',
    priceCents: 36000,
    colour: 'Olive',
    occasions: ['wedding guest'],
    alt: 'Model walking in a sheer olive maxi dress with ruffled tiers and flutter sleeves',
  },
  {
    slug: 'tiered-ruffle-dress',
    title: 'Tiered Ruffle Dress',
    maker: 'fern-and-thread',
    slot: 0,
    shape: 'dress',
    productType: 'one_of_one',
    priceCents: 27000,
    colour: 'Ivory',
    occasions: [],
    alt: 'Model in a white tiered maxi dress with a sweetheart bodice',
  },
  {
    slug: 'tangerine-bias-maxi',
    title: 'Tangerine Bias Maxi',
    maker: 'lune-studio',
    slot: 0,
    shape: 'maxi',
    productType: 'ready_to_ship',
    priceCents: 31000,
    colour: 'Tangerine',
    occasions: ['wedding guest', 'evening'],
    alt: 'Model on a boat in a tangerine bias-cut satin maxi dress',
  },
  {
    slug: 'draped-satin-midi',
    title: 'Draped Satin Midi',
    maker: 'studio-ines',
    slot: 0,
    shape: 'dress',
    productType: 'made_to_order',
    priceCents: 29000,
    colour: 'Chocolate',
    occasions: ['races'],
    alt: 'Model leaning on a stone wall in a chocolate satin midi with a draped cowl neck',
  },
  {
    slug: 'corset-front-mini',
    title: 'Corset-Front Mini',
    maker: 'pia-marchetti',
    slot: 0,
    shape: 'dress',
    productType: 'ready_to_ship',
    priceCents: 22000,
    colour: 'Navy',
    occasions: [],
    alt: 'Model in a dark denim mini dress with a lace-up corset front',
    lowStock: true,
  },
];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const VIEW_ALT = [
  (t: string, c: string) => `${t} in ${c.toLowerCase()}, front view on a plain studio backdrop`,
  (t: string, c: string) => `${t} in ${c.toLowerCase()}, back view showing the closure and drape`,
  (t: string, c: string) =>
    `Close-up of the ${c.toLowerCase()} fabric texture and stitching on the ${t}`,
  (t: string, c: string) => `${t} in ${c.toLowerCase()} styled under a studio arch`,
  (t: string, c: string) => `${t} in ${c.toLowerCase()} laid flat to show the full silhouette`,
];

function buildProducts(): ProductSeed[] {
  const r = rng('products');
  // Exact mix before the photographed pieces take their slots: 24 ready-to-ship, 26 made-to-order,
  // 10 one-of-one, spread across the ten makers.
  const types: ProductType[] = [
    ...Array<ProductType>(10).fill('one_of_one'),
    ...Array<ProductType>(26).fill('made_to_order'),
    ...Array<ProductType>(24).fill('ready_to_ship'),
  ];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [types[i], types[j]] = [types[j]!, types[i]!];
  }
  // Upcycling labels lean one-of-one.
  const swapToOoo = (makerIdx: number, slot: number) => {
    const idx = makerIdx * 6 + slot;
    const other = types.findIndex(
      (t, k) => t === 'one_of_one' && Math.floor(k / 6) !== 4 && Math.floor(k / 6) !== 6,
    );
    if (types[idx] !== 'one_of_one' && other >= 0)
      [types[idx], types[other]] = [types[other]!, types[idx]!];
  };
  // Sundry Atelier and Fern & Thread work from reclaimed materials.
  [0, 1, 2].forEach((s) => swapToOoo(4, s));
  [0, 1, 2].forEach((s) => swapToOoo(6, s));

  const used = new Set<string>();
  const products: ProductSeed[] = [];
  MAKERS.forEach((maker, makerIdx) => {
    for (let k = 0; k < 6; k++) {
      const idx = makerIdx * 6 + k;
      const hero = HEROES.find((h) => h.maker === maker.slug && h.slot === k);
      const productType = hero?.productType ?? types[idx]!;
      const shape = hero?.shape ?? maker.focus[k % maker.focus.length]!;
      let title = hero?.title ?? '';
      for (let attempt = 0; !hero && attempt < 50; attempt++) {
        title = `${r.pick(FIRST_NAMES)} ${r.pick(STYLE_NAMES[shape])}`;
        if (!used.has(title)) break;
      }
      used.add(title);
      const slug = hero?.slug ?? slugify(title);
      const isUpcycled = productType === 'one_of_one';
      const pattern: Pattern = isUpcycled
        ? 'patchwork'
        : shape === 'skirt' && r.chance(0.5)
          ? 'pleats'
          : r.pick(['solid', 'solid', 'solid', 'stripes', 'dots', 'gingham', 'floral'] as const);
      const colour = hero?.colour ?? maker.palette[k % maker.palette.length]!;
      const secondColour =
        r.chance(0.3) && !isUpcycled && !hero
          ? maker.palette[(k + 1) % maker.palette.length]!
          : null;
      const colours = secondColour ? [colour, secondColour] : [colour];

      // Most pieces sit in the A$150–A$500 band; a handful sit just outside it.
      let priceCents = r.int(30, 99) * 500; // 150..495
      if (idx % 23 === 7) priceCents = 12900;
      if (idx % 29 === 11) priceCents = 58000;
      if (shape === 'top') priceCents = Math.min(priceCents, 22000);
      if (hero) priceCents = hero.priceCents;

      const leadTimeDays =
        productType === 'made_to_order' ? maker.leadTimeDays + r.int(-3, 7) : null;
      const sizes =
        productType === 'one_of_one'
          ? [r.pick(['8', '10', '12', '14'])]
          : productType === 'made_to_order'
            ? MTO_SIZES
            : SIZES;

      const variants: ProductSeed['variants'] = [];
      for (const c of colours) {
        sizes.forEach((size, si) => {
          let stock: number;
          if (productType === 'one_of_one') stock = idx % 5 === 0 ? 0 : 1;
          else if (productType === 'made_to_order') stock = 20;
          else stock = r.chance(0.15) ? 0 : r.chance(0.25) ? r.int(1, 2) : r.int(3, 8);
          if (hero?.lowStock) stock = si === 2 ? 2 : 0;
          variants.push({
            id: seedId(`variant:${slug}:${c}:${size}`),
            size,
            colour: c,
            stock,
            sku: `${maker.slug.slice(0, 4).toUpperCase()}-${idx.toString().padStart(3, '0')}-${c.slice(0, 3).toUpperCase()}-${size}-${si}`,
          });
        });
      }

      const base = { dress: 92, slip: 90, maxi: 92, skirt: 0, top: 94, set: 94, jacket: 102 }[
        shape
      ];
      const measurements: ProductSeed['measurements'] = [];
      if (base) measurements.push({ name: 'Bust', valueCm: base });
      measurements.push({ name: 'Waist', valueCm: shape === 'jacket' ? 98 : r.int(70, 78) });
      measurements.push({ name: 'Hips', valueCm: r.int(96, 112) });
      measurements.push({
        name: shape === 'skirt' ? 'Skirt length' : 'Length (shoulder to hem)',
        valueCm:
          { dress: 118, slip: 112, maxi: 142, skirt: 78, top: 58, set: 60, jacket: 64 }[shape] +
          r.int(-6, 6),
      });

      const fabric = r.pick([
        '100% deadstock silk',
        '100% European linen',
        '55% linen, 45% organic cotton',
        '100% recycled polyester satin',
        '100% organic cotton poplin',
        '70% Tencel, 30% linen',
        'Reclaimed cotton and linen patchwork',
        '100% South Australian merino wool',
      ]);
      const createdDaysAgo = (idx * 7) % 45;
      const typeTag =
        productType === 'made_to_order'
          ? 'made-to-order'
          : productType === 'one_of_one'
            ? 'one-of-one'
            : 'ready-to-ship';
      const tags = [
        CATEGORY_BY_SHAPE[shape],
        typeTag,
        maker.city.toLowerCase(),
        ...(shape === 'maxi' || shape === 'slip' || r.chance(0.3) ? ['wedding-guest'] : []),
        ...(isUpcycled ? ['upcycled'] : []),
        ...(pattern !== 'solid' ? [pattern] : []),
      ];
      const lede =
        productType === 'one_of_one'
          ? `A true one-of-one: ${title} is pieced from salvaged textiles, so there will never be another exactly like it.`
          : productType === 'made_to_order'
            ? `${title} is cut and sewn to order in ${maker.suburb}, ${maker.city}, in your size.`
            : `${title} is ready to ship from ${maker.suburb}, ${maker.city}.`;
      const description = `${lede}\n\n${maker.materials} ${maker.process}\n\nFeatures: fully lined bodice, invisible side zip, ${
        shape === 'skirt' ? 'two deep side-seam pockets' : 'side-seam pockets'
      }, French seams throughout.`;

      const images = hero
        ? [
            {
              path: `seed/${slug}.jpg`,
              url: `/seed/${slug}.jpg`,
              alt: hero.alt,
              view: 0,
              width: 933,
              height: 1400,
            },
          ]
        : VIEW_ALT.map((alt, view) => ({
            path: `seed/products/${slug}-${view + 1}.svg`,
            url: `/seed/products/${slug}-${view + 1}.svg`,
            alt: alt(title, colour),
            view,
            width: 800,
            height: 1000,
          }));
      const occasions =
        hero?.occasions ?? (tags.includes('wedding-guest') ? ['wedding guest'] : []);

      products.push({
        id: seedId(`product:${slug}`),
        slug,
        maker,
        title,
        description,
        category: hero?.category ?? CATEGORY_BY_SHAPE[shape],
        shape,
        pattern,
        productType,
        priceCents,
        colours,
        tags,
        fabric,
        care:
          fabric.includes('silk') || fabric.includes('satin')
            ? 'Hand wash cold or dry clean. Hang to dry. Cool iron on reverse.'
            : fabric.includes('wool')
              ? 'Dry clean or gentle wool wash. Dry flat.'
              : 'Cold gentle machine wash. Line dry in shade. Warm iron.',
        modelHeightCm: r.int(165, 178),
        modelSizeWorn: productType === 'one_of_one' ? sizes[0]! : r.pick(['8', '10']),
        leadTimeDays,
        madeToOrderOptions:
          productType === 'made_to_order'
            ? 'Made in AU 6–22. Length can be adjusted ±5cm at no charge — add a note after checkout or ask the maker.'
            : null,
        isFeatured: Boolean(hero) || idx % 9 === 0,
        createdDaysAgo: hero ? Math.min(createdDaysAgo, 5) : createdDaysAgo,
        occasions,
        variants,
        measurements,
        images,
      });
    }
  });
  return products;
}

export const PRODUCTS: ProductSeed[] = buildProducts();

export interface CollectionSeed {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  heroProductSlug: string;
  match: (p: ProductSeed) => boolean;
}

const COLLECTION_DEFS: Array<Omit<CollectionSeed, 'id' | 'heroProductSlug'>> = [
  {
    slug: 'statement-dresses',
    title: 'Statement dresses',
    subtitle: 'Colour, volume and nerve.',
    description:
      'Dresses that do the talking — sculptural sleeves, saturated colour and silhouettes you won’t see twice at the party.',
    match: (p) => p.category === 'dresses' || p.shape === 'maxi',
  },
  {
    slug: 'wedding-guest-but-not-boring',
    title: 'Wedding guest, but not boring',
    subtitle: 'For the ceremony, the reception and the dance floor.',
    description: 'Occasion pieces that respect the dress code and ignore the clichés.',
    match: (p) => p.tags.includes('wedding-guest'),
  },
  {
    slug: 'melbourne-made',
    title: 'Melbourne made',
    subtitle: 'From Brunswick, Fitzroy and Collingwood studios.',
    description: 'Pieces cut and sewn by independent makers in Melbourne’s inner north.',
    match: (p) => p.maker.city === 'Melbourne',
  },
  {
    slug: 'one-of-one-pieces',
    title: 'One-of-one pieces',
    subtitle: 'There is only one. Then it’s gone.',
    description:
      'Upcycled and reworked garments made from salvaged textiles. Each is completely unique.',
    match: (p) => p.productType === 'one_of_one',
  },
  {
    slug: 'made-to-order',
    title: 'Made to order',
    subtitle: 'Cut in your size, just for you.',
    description:
      'No overproduction. These pieces are made after you order, usually within two to four weeks.',
    match: (p) => p.productType === 'made_to_order',
  },
  {
    slug: 'skirts-with-swing',
    title: 'Skirts with swing',
    subtitle: 'Pleats, bias cuts and pockets.',
    description: 'Midi skirts built to move — from knife pleats to fluid bias-cut silk.',
    match: (p) => p.category === 'skirts',
  },
];

export const COLLECTIONS: CollectionSeed[] = COLLECTION_DEFS.map((c) => {
  const first = PRODUCTS.find(c.match);
  return {
    ...c,
    id: seedId(`collection:${c.slug}`),
    heroProductSlug: first?.slug ?? PRODUCTS[0]!.slug,
  };
});

export interface BuyerSeed {
  id: string;
  email: string;
  name: string;
}

const BUYER_NAMES = [
  'Ava Nguyen',
  'Charlotte Smith',
  'Mia Kowalski',
  'Isla Brown',
  'Grace Patel',
  'Zara Williams',
  'Ruby Chen',
  'Harper Jones',
  'Sienna Taylor',
  'Chloe Martin',
  'Lily Anderson',
  'Evie Wilson',
  'Olivia Rossi',
  'Matilda Kelly',
  'Hannah Murphy',
  'Leah Thompson',
  'Amelia Walker',
  'Sophie White',
  'Ella Harris',
  'Willow Clarke',
];

export const BUYERS: BuyerSeed[] = BUYER_NAMES.map((name, i) => ({
  id: seedId(`user:buyer:${i}`),
  email: `${name.split(' ')[0]!.toLowerCase()}@buyer.test`,
  name,
}));

export const ADMIN = {
  id: seedId('user:admin'),
  email: 'admin@oneoff.test',
  name: 'Platform Admin',
};
