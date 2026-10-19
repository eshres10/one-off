import { EMPTY_STORY, type PieceStory } from '@/lib/listings/story';
import { TERMS } from './terms';

export const PIECE_CATEGORIES = [
  { value: 'dresses', label: 'Dresses' },
  { value: 'slips', label: 'Slips' },
  { value: 'sets', label: 'Sets' },
  { value: 'tops', label: 'Tops' },
  { value: 'skirts', label: 'Skirts' },
  { value: 'tailoring', label: 'Tailoring' },
  { value: 'outerwear', label: 'Outerwear' },
] as const;

export const PIECE_OCCASIONS = [
  'Evening',
  'Wedding guest',
  'Races',
  'Party',
  'Work',
  'Everyday',
  'Holiday',
  'Bridal',
] as const;

export const SALE_TYPES = [
  {
    value: 'ready_to_ship',
    label: 'Ready to ship',
    blurb: 'Made and waiting. You set the stock for each size.',
  },
  {
    value: 'made_to_order',
    label: 'Made to order',
    blurb: 'You make it after it sells. Choose the sizes you offer.',
  },
  {
    value: 'one_of_one',
    label: 'One of one',
    blurb: 'There is only this one, in one size.',
  },
] as const;
export type SaleType = (typeof SALE_TYPES)[number]['value'];

export interface PieceSize {
  size: string;
  stock: number;
  offered: boolean;
}

export interface PieceDraft {
  title: string;
  category: string;
  description: string;
  fabric: string;
  care: string;
  occasions: string[];
  /** Up to four from the style vocabulary (lib/taste/tags.ts). */
  styleTags: string[];
  colours: string[];
  saleType: SaleType;
  mtoLead: string | null;
  mtoCapacity: number | null;
  sizes: PieceSize[];
  priceCents: number | null;
  acceptsCustom: boolean;
  images: Array<{ url: string; alt: string }>;
  measurements: Array<{ name: string; valueCm: number }>;
  /** "Story of the garment": optional, never needed to publish. */
  story: PieceStory;
}

export const MIN_PHOTOS = 3;
export const MIN_DESCRIPTION = 80;
export const MAX_PHOTOS = 8;

export function emptySizes(): PieceSize[] {
  return TERMS.sizes.map((size) => ({ size, stock: 0, offered: false }));
}

/** Whether a size is available to buy for this sale type. */
export function sizeAvailable(s: PieceSize, saleType: SaleType): boolean {
  if (s.size === 'Custom' && saleType !== 'made_to_order') return false;
  return saleType === 'ready_to_ship' ? s.stock > 0 : s.offered;
}

export interface ChecklistResult {
  items: Array<{ key: string; label: string; done: boolean }>;
  passed: number;
  ready: boolean;
}

/** "Ready to publish · n/5": the five things a piece needs before it can go live. */
export function publishChecklist(p: PieceDraft): ChecklistResult {
  const items = [
    { key: 'photos', label: `At least ${MIN_PHOTOS} photos`, done: p.images.length >= MIN_PHOTOS },
    {
      key: 'basics',
      label: 'Name and category',
      done: p.title.trim().length >= 3 && Boolean(p.category),
    },
    {
      key: 'description',
      label: `Description of ${MIN_DESCRIPTION}+ characters`,
      done: p.description.trim().length >= MIN_DESCRIPTION,
    },
    { key: 'price', label: 'A price', done: (p.priceCents ?? 0) > 0 },
    {
      key: 'sizes',
      label:
        p.saleType === 'ready_to_ship' ? 'At least one size in stock' : 'At least one size offered',
      done: p.sizes.some((s) => sizeAvailable(s, p.saleType)),
    },
  ];
  const passed = items.filter((i) => i.done).length;
  return { items, passed, ready: passed === items.length };
}

export interface EditorShop {
  makerId: string;
  name: string;
  foundingUntil: string | null;
  careDefault: string | null;
  dispatchDays: number;
  ratesSummary: string;
  mtoDefaultLead: string | null;
  shopLive: boolean;
}

export interface EditorPiece extends PieceDraft {
  id: string | null;
  slug: string | null;
  status: string;
  listedByAdmin: boolean;
}

/** A blank piece for the editor, with the shop's defaults filled in. */
export function newPiece(shop: EditorShop): EditorPiece {
  return {
    id: null,
    slug: null,
    status: 'draft',
    listedByAdmin: false,
    title: '',
    category: '',
    description: '',
    fabric: '',
    care: shop.careDefault ?? '',
    occasions: [],
    styleTags: [],
    colours: [],
    saleType: 'ready_to_ship',
    mtoLead: shop.mtoDefaultLead ?? TERMS.mtoLeadOptions[1],
    mtoCapacity: 3,
    sizes: emptySizes(),
    priceCents: null,
    acceptsCustom: false,
    images: [],
    measurements: [],
    story: EMPTY_STORY,
  };
}
