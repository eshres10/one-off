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
}

const MAKER_DEFS: Array<Omit<MakerSeed, 'id' | 'userId' | 'email' | 'key'>> = [
  {
    slug: 'marlowe-atelier',
    displayName: 'Marlowe Atelier',
    tagline: 'Sculptural statement dresses, cut by hand in Brunswick.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Brunswick',
    story:
      'Marlowe began on a kitchen table in 2019 with one pattern and a roll of deadstock silk. Today it is still one designer and one machinist, making dresses that feel like an event.',
    process:
      'Every piece is drafted, cut and sewn in our Brunswick studio. We work in small batches of six to ten per size.',
    materials:
      'Deadstock silks and Italian cottons sourced from Melbourne mills’ end-of-roll stock.',
    sizingNotes:
      'True to AU sizing with a fitted bodice. Between sizes? Size up and we can take in the side seams.',
    leadTimeDays: 14,
    responseTimeHours: 4,
    dispatchDays: 2,
    shippingStandardCents: 1200,
    freeShippingOverCents: 40000,
    customCommissions: true,
    focus: ['dress', 'maxi', 'dress'],
    palette: ['Scarlet', 'Cobalt', 'Black', 'Butter'],
    accent: '#A8322D',
  },
  {
    slug: 'fitzroy-thread-co',
    displayName: 'Fitzroy Thread Co',
    tagline: 'Upcycled one-of-one pieces from vintage linens.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Fitzroy',
    story:
      'We rescue tablecloths, quilts and vintage linens from op shops across Victoria and give them a second life as wearable patchwork.',
    process: 'Each garment is pieced from three to nine salvaged textiles, so no two are alike.',
    materials: '100% reclaimed natural fibres — linen, cotton and the occasional wool blanket.',
    sizingNotes:
      'Relaxed fits with generous ease. Full garment measurements are listed on every piece.',
    leadTimeDays: 21,
    responseTimeHours: 12,
    dispatchDays: 3,
    shippingStandardCents: 1000,
    freeShippingOverCents: null,
    customCommissions: true,
    focus: ['set', 'jacket', 'skirt'],
    palette: ['Oat', 'Rust', 'Sage', 'Ivory'],
    accent: '#A3552D',
  },
  {
    slug: 'wren-and-sable',
    displayName: 'Wren & Sable',
    tagline: 'Occasionwear for people who hate occasionwear.',
    city: 'Melbourne',
    state: 'VIC',
    suburb: 'Collingwood',
    story:
      'Wren & Sable designs wedding-guest and race-day pieces that you’ll actually wear again — strong colour, clean lines, pockets.',
    process: 'Made to order in our Collingwood workroom so we only cut what is bought.',
    materials: 'Recycled satins, heavyweight crepe and certified organic cotton linings.',
    sizingNotes: 'Made to your size from AU 6 to 22. Add notes at checkout for length adjustments.',
    leadTimeDays: 18,
    responseTimeHours: 6,
    dispatchDays: 2,
    shippingStandardCents: 1200,
    freeShippingOverCents: 35000,
    customCommissions: false,
    focus: ['dress', 'slip', 'maxi'],
    palette: ['Emerald', 'Lilac', 'Butter', 'Navy'],
    accent: '#2E6A4E',
  },
  {
    slug: 'saltbush-studio',
    displayName: 'Saltbush Studio',
    tagline: 'Linen made for long Sydney summers.',
    city: 'Sydney',
    state: 'NSW',
    suburb: 'Marrickville',
    story:
      'Saltbush is a two-person studio making breathable linen pieces designed around heat, sea air and bare feet.',
    process: 'Garment-washed in small batches for softness, then finished by hand.',
    materials: 'European flax linen and linen-cotton blends, naturally dyed in house.',
    sizingNotes: 'Relaxed, slightly oversized. Size down for a closer fit.',
    leadTimeDays: 10,
    responseTimeHours: 8,
    dispatchDays: 2,
    shippingStandardCents: 1100,
    freeShippingOverCents: 30000,
    customCommissions: false,
    focus: ['dress', 'set', 'skirt'],
    palette: ['Sage', 'Oat', 'Ivory', 'Terracotta'],
    accent: '#9FAE8A',
  },
  {
    slug: 'bondi-bias',
    displayName: 'Bondi Bias',
    tagline: 'Bias-cut slips and skirts that move like water.',
    city: 'Sydney',
    state: 'NSW',
    suburb: 'Bondi',
    story:
      'Founded by a former bridal cutter, Bondi Bias makes fluid bias-cut pieces in limited runs.',
    process: 'Hand-cut on the bias and hung for 48 hours before hemming so the drape settles.',
    materials: 'Sand-washed silk and recycled satin.',
    sizingNotes: 'Bias cut stretches gently; take your hip measurement as your guide.',
    leadTimeDays: 12,
    responseTimeHours: 3,
    dispatchDays: 1,
    shippingStandardCents: 1200,
    freeShippingOverCents: 40000,
    customCommissions: true,
    focus: ['slip', 'skirt', 'slip'],
    palette: ['Blush', 'Chocolate', 'Black', 'Ivory'],
    accent: '#E5B3AC',
  },
  {
    slug: 'paddington-pleat',
    displayName: 'Paddington Pleat',
    tagline: 'Pleated skirts with a point of view.',
    city: 'Sydney',
    state: 'NSW',
    suburb: 'Paddington',
    story:
      'Paddington Pleat makes skirts built to last decades — knife pleats, box pleats and generous pockets.',
    process:
      'Pleats are set by a third-generation pleating house in Sydney, then finished in our studio.',
    materials: 'Wool blends, recycled polyester crepe and organic cotton drill.',
    sizingNotes: 'Waist-led sizing. Each listing includes waist and length by size.',
    leadTimeDays: 15,
    responseTimeHours: 10,
    dispatchDays: 2,
    shippingStandardCents: 1000,
    freeShippingOverCents: null,
    customCommissions: false,
    focus: ['skirt', 'skirt', 'set'],
    palette: ['Navy', 'Olive', 'Butter', 'Scarlet'],
    accent: '#1F2A44',
  },
  {
    slug: 'jacaranda-house',
    displayName: 'Jacaranda House',
    tagline: 'Hand-printed florals from a Queenslander verandah.',
    city: 'Brisbane',
    state: 'QLD',
    suburb: 'Paddington',
    story:
      'Every Jacaranda House print starts as a gouache painting of something growing in our backyard.',
    process: 'Screen-printed by hand in Brisbane in runs of 20 metres or less.',
    materials: 'Organic cotton voile and linen, printed with water-based inks.',
    sizingNotes: 'Fitted through the bust, relaxed through the waist.',
    leadTimeDays: 16,
    responseTimeHours: 12,
    dispatchDays: 3,
    shippingStandardCents: 1300,
    freeShippingOverCents: 35000,
    customCommissions: true,
    focus: ['dress', 'maxi', 'top'],
    palette: ['Lilac', 'Ivory', 'Cobalt', 'Blush'],
    accent: '#B6A3D1',
  },
  {
    slug: 'rivercity-remade',
    displayName: 'Rivercity Remade',
    tagline: 'One-of-one reworked vintage.',
    city: 'Brisbane',
    state: 'QLD',
    suburb: 'West End',
    story:
      'We take tired vintage dresses and denim and rebuild them into new silhouettes, one at a time.',
    process:
      'Deconstructed, re-cut and re-sewn by hand. Each piece is photographed on our studio model.',
    materials: 'Vintage and deadstock fabrics only.',
    sizingNotes: 'Each piece is unique — check the garment measurements carefully.',
    leadTimeDays: 20,
    responseTimeHours: 18,
    dispatchDays: 3,
    shippingStandardCents: 1000,
    freeShippingOverCents: null,
    customCommissions: false,
    focus: ['jacket', 'dress', 'set'],
    palette: ['Navy', 'Rust', 'Oat', 'Olive'],
    accent: '#6C6A3A',
  },
  {
    slug: 'fig-and-fern',
    displayName: 'Fig & Fern',
    tagline: 'Soft tailoring and everyday occasion dresses.',
    city: 'Brisbane',
    state: 'QLD',
    suburb: 'New Farm',
    story:
      'Fig & Fern makes considered pieces for the in-between: dinners, christenings, gallery openings.',
    process: 'Small-batch production with a Brisbane makers’ collective.',
    materials: 'Tencel, organic cotton sateen and linen blends.',
    sizingNotes: 'True to size. Most styles have adjustable ties.',
    leadTimeDays: 14,
    responseTimeHours: 6,
    dispatchDays: 2,
    shippingStandardCents: 1200,
    freeShippingOverCents: 30000,
    customCommissions: false,
    focus: ['dress', 'top', 'skirt'],
    palette: ['Olive', 'Butter', 'Chocolate', 'Ivory'],
    accent: '#5A3A2A',
  },
  {
    slug: 'hills-and-hem',
    displayName: 'Hills & Hem',
    tagline: 'Wool and linen pieces from the Adelaide Hills.',
    city: 'Adelaide',
    state: 'SA',
    suburb: 'Stirling',
    story:
      'Hills & Hem works with South Australian wool growers to make warm, structured pieces for cooler evenings.',
    process: 'Cut and sewn in the Hills; knitted trims made by a local co-op.',
    materials: 'South Australian merino, linen and organic cotton.',
    sizingNotes: 'Structured fits. Shoulders are the key measurement for jackets.',
    leadTimeDays: 21,
    responseTimeHours: 24,
    dispatchDays: 3,
    shippingStandardCents: 1400,
    freeShippingOverCents: null,
    customCommissions: true,
    focus: ['jacket', 'skirt', 'dress'],
    palette: ['Oat', 'Chocolate', 'Olive', 'Navy'],
    accent: '#5A3A2A',
  },
  {
    slug: 'norwood-noir',
    displayName: 'Norwood Noir',
    tagline: 'Evening dresses in shades of black.',
    city: 'Adelaide',
    state: 'SA',
    suburb: 'Norwood',
    story:
      'Norwood Noir makes dramatic, minimal eveningwear — mostly black, occasionally midnight.',
    process: 'Draped on the stand, then patterned and made to order.',
    materials: 'Recycled satin, matte crepe and organza.',
    sizingNotes: 'Made to measure available on request. Standard sizes AU 6–20.',
    leadTimeDays: 24,
    responseTimeHours: 8,
    dispatchDays: 2,
    shippingStandardCents: 1200,
    freeShippingOverCents: 45000,
    customCommissions: true,
    focus: ['maxi', 'slip', 'dress'],
    palette: ['Black', 'Navy', 'Chocolate', 'Scarlet'],
    accent: '#24211E',
  },
  {
    slug: 'sorrel-made',
    displayName: 'Sorrel Made',
    tagline: 'Colourful, easy dresses with deep pockets.',
    city: 'Adelaide',
    state: 'SA',
    suburb: 'Unley',
    story:
      'Sorrel Made is a one-woman label making joyful, easy-wearing dresses in bold block colours.',
    process: 'Every dress is sewn start to finish by one person — me.',
    materials: 'Cotton poplin, linen and deadstock rayon.',
    sizingNotes: 'Roomy fit with elastic back waist; size down if between sizes.',
    leadTimeDays: 12,
    responseTimeHours: 5,
    dispatchDays: 2,
    shippingStandardCents: 1000,
    freeShippingOverCents: 25000,
    customCommissions: false,
    focus: ['dress', 'dress', 'top'],
    palette: ['Terracotta', 'Cobalt', 'Butter', 'Emerald'],
    accent: '#C2694A',
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
  images: Array<{ path: string; url: string; alt: string; view: number }>;
}

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
  // Exact mix: 28 ready-to-ship, 32 made-to-order, 12 one-of-one, spread across makers.
  const types: ProductType[] = [
    ...Array<ProductType>(12).fill('one_of_one'),
    ...Array<ProductType>(32).fill('made_to_order'),
    ...Array<ProductType>(28).fill('ready_to_ship'),
  ];
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(r.next() * (i + 1));
    [types[i], types[j]] = [types[j]!, types[i]!];
  }
  // Upcycling labels lean one-of-one.
  const swapToOoo = (makerIdx: number, slot: number) => {
    const idx = makerIdx * 6 + slot;
    const other = types.findIndex(
      (t, k) => t === 'one_of_one' && Math.floor(k / 6) !== 1 && Math.floor(k / 6) !== 7,
    );
    if (types[idx] !== 'one_of_one' && other >= 0)
      [types[idx], types[other]] = [types[other]!, types[idx]!];
  };
  [0, 1, 2].forEach((s) => swapToOoo(1, s));
  [0, 1, 2].forEach((s) => swapToOoo(7, s));

  const used = new Set<string>();
  const products: ProductSeed[] = [];
  MAKERS.forEach((maker, makerIdx) => {
    for (let k = 0; k < 6; k++) {
      const idx = makerIdx * 6 + k;
      const productType = types[idx]!;
      const shape = maker.focus[k % maker.focus.length]!;
      let title = '';
      for (let attempt = 0; attempt < 50; attempt++) {
        title = `${r.pick(FIRST_NAMES)} ${r.pick(STYLE_NAMES[shape])}`;
        if (!used.has(title)) break;
      }
      used.add(title);
      const slug = slugify(title);
      const isUpcycled = productType === 'one_of_one';
      const pattern: Pattern = isUpcycled
        ? 'patchwork'
        : shape === 'skirt' && r.chance(0.5)
          ? 'pleats'
          : r.pick(['solid', 'solid', 'solid', 'stripes', 'dots', 'gingham', 'floral'] as const);
      const colour = maker.palette[k % maker.palette.length]!;
      const secondColour =
        r.chance(0.3) && !isUpcycled ? maker.palette[(k + 1) % maker.palette.length]! : null;
      const colours = secondColour ? [colour, secondColour] : [colour];

      // Most pieces sit in the A$150–A$500 band; a handful sit just outside it.
      let priceCents = r.int(30, 99) * 500; // 150..495
      if (idx % 23 === 7) priceCents = 12900;
      if (idx % 29 === 11) priceCents = 58000;
      if (shape === 'top') priceCents = Math.min(priceCents, 22000);

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

      const images = VIEW_ALT.map((alt, view) => ({
        path: `seed/products/${slug}-${view + 1}.svg`,
        url: `/seed/products/${slug}-${view + 1}.svg`,
        alt: alt(title, colour),
        view,
      }));

      products.push({
        id: seedId(`product:${slug}`),
        slug,
        maker,
        title,
        description,
        category: CATEGORY_BY_SHAPE[shape],
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
        isFeatured: idx % 9 === 0,
        createdDaysAgo,
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
  email: 'admin@atelierlocale.test',
  name: 'Platform Admin',
};
