/**
 * Discover state lives in the URL so feeds are shareable and Back works:
 *   ?q=&cat=&size=10,12&avail=mto&max=300&colour=navy&sort=popular&edit=&suburb=
 * Pure helpers shared by the page, the API and the client.
 */
import { editBySlug } from './edits';

export const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'dresses', label: 'Dresses' },
  { value: 'slips', label: 'Slips' },
  { value: 'sets', label: 'Sets' },
  { value: 'occasion', label: 'Occasion' },
  { value: 'mto', label: 'Made to order' },
  { value: 'ooo', label: 'One of one' },
  { value: 'satin', label: 'Satin' },
  { value: 'linen', label: 'Linen & cotton' },
  { value: 'tailoring', label: 'Tailoring' },
  { value: 'under-300', label: 'Under A$300' },
  { value: 'makers', label: 'Makers' },
] as const;
/** Also reachable from the menu, though not a chip. */
const EXTRA_CATS = ['outerwear'] as const;

export const SIZES = ['6', '8', '10', '12', '14', '16'] as const;
export const AVAILABILITY = [
  { value: 'rts', label: 'Ready to ship', productType: 'ready_to_ship' },
  { value: 'mto', label: 'Made to order', productType: 'made_to_order' },
  { value: 'ooo', label: 'One of one', productType: 'one_of_one' },
] as const;
export const COLOURS = [
  { value: 'black', label: 'Black', hex: '#111111' },
  { value: 'ivory', label: 'Ivory', hex: '#EFE6D6' },
  { value: 'navy', label: 'Navy', hex: '#1F2A44' },
  { value: 'wine', label: 'Wine', hex: '#6B1E2A' },
  { value: 'sage', label: 'Sage', hex: '#9FAE8A' },
  { value: 'butter', label: 'Butter', hex: '#EDD48A' },
  { value: 'chocolate', label: 'Chocolate', hex: '#5A3A2A' },
  { value: 'blush', label: 'Blush', hex: '#E5B3AC' },
  { value: 'olive', label: 'Olive', hex: '#6C6A3A' },
] as const;
export const SORTS = [
  { value: 'relevant', label: 'Relevant' },
  { value: 'new', label: 'New' },
  { value: 'popular', label: 'Popular' },
  { value: 'price-asc', label: 'Price low–high' },
  { value: 'price-desc', label: 'Price high–low' },
] as const;
export const PRICE = { min: 100, max: 600, step: 20 } as const;

export type Category = (typeof CATEGORIES)[number]['value'] | (typeof EXTRA_CATS)[number];
export type Sort = (typeof SORTS)[number]['value'];

export interface DiscoverParams {
  q: string;
  cat: Category;
  size: string[];
  avail: string[];
  max: number | null;
  colour: string[];
  sort: Sort;
  edit: string | null;
  suburb: string | null;
}

export const EMPTY: DiscoverParams = {
  q: '',
  cat: 'all',
  size: [],
  avail: [],
  max: null,
  colour: [],
  sort: 'relevant',
  edit: null,
  suburb: null,
};

type Raw = Record<string, string | string[] | undefined> | URLSearchParams;

function get(raw: Raw, key: string): string | undefined {
  if (raw instanceof URLSearchParams) return raw.get(key) ?? undefined;
  const v = raw[key];
  return Array.isArray(v) ? v[0] : v;
}

const list = (v: string | undefined, allowed: readonly string[]) =>
  Array.from(new Set((v ?? '').split(',').filter((x) => allowed.includes(x))));

export function parseDiscover(raw: Raw): DiscoverParams {
  const cat = get(raw, 'cat');
  const sort = get(raw, 'sort');
  const max = Number(get(raw, 'max'));
  const edit = get(raw, 'edit');
  const suburb = get(raw, 'suburb')?.trim();
  return {
    q: (get(raw, 'q') ?? '').trim().slice(0, 80),
    cat: ([...CATEGORIES.map((c) => c.value), ...EXTRA_CATS] as string[]).includes(cat ?? '')
      ? (cat as Category)
      : 'all',
    size: list(get(raw, 'size'), SIZES),
    avail: list(
      get(raw, 'avail'),
      AVAILABILITY.map((a) => a.value),
    ),
    max:
      Number.isFinite(max) && max >= PRICE.min && max <= PRICE.max
        ? Math.round(max / PRICE.step) * PRICE.step
        : null,
    colour: list(
      get(raw, 'colour'),
      COLOURS.map((c) => c.value),
    ),
    sort: (SORTS.map((s) => s.value) as string[]).includes(sort ?? '')
      ? (sort as Sort)
      : 'relevant',
    edit: editBySlug(edit) ? edit! : null,
    suburb: suburb && /^[\p{L} '-]{2,40}$/u.test(suburb) ? suburb : null,
  };
}

export function toQuery(p: DiscoverParams): string {
  const s = new URLSearchParams();
  if (p.q) s.set('q', p.q);
  if (p.cat !== 'all') s.set('cat', p.cat);
  if (p.size.length) s.set('size', p.size.join(','));
  if (p.avail.length) s.set('avail', p.avail.join(','));
  if (p.max !== null) s.set('max', String(p.max));
  if (p.colour.length) s.set('colour', p.colour.join(','));
  if (p.sort !== 'relevant') s.set('sort', p.sort);
  if (p.edit) s.set('edit', p.edit);
  if (p.suburb) s.set('suburb', p.suburb);
  return s.toString();
}

export const discoverHref = (p: DiscoverParams) => {
  const q = toQuery(p);
  return q ? `/discover?${q}` : '/discover';
};

/** Filters set in the Filters panel (the badge on the button). */
export function panelFilterCount(p: DiscoverParams): number {
  return (
    p.size.length +
    p.avail.length +
    p.colour.length +
    (p.max !== null ? 1 : 0) +
    (p.sort !== 'relevant' ? 1 : 0)
  );
}

/** Anything that narrows the feed to pieces only (no edit or maker cards). */
export function isNarrowed(p: DiscoverParams): boolean {
  return Boolean(
    p.q ||
      p.cat !== 'all' ||
      p.size.length ||
      p.avail.length ||
      p.max !== null ||
      p.colour.length ||
      p.edit ||
      p.suburb,
  );
}

export interface Pill {
  key: string;
  label: string;
  without: DiscoverParams;
}

/** Removable pills for active filters. */
export function activePills(p: DiscoverParams): Pill[] {
  const pills: Pill[] = [];
  for (const s of p.size)
    pills.push({
      key: `size-${s}`,
      label: `Size ${s}`,
      without: { ...p, size: p.size.filter((x) => x !== s) },
    });
  for (const a of p.avail)
    pills.push({
      key: `avail-${a}`,
      label: AVAILABILITY.find((x) => x.value === a)!.label,
      without: { ...p, avail: p.avail.filter((x) => x !== a) },
    });
  if (p.max !== null)
    pills.push({ key: 'max', label: `Under A$${p.max}`, without: { ...p, max: null } });
  for (const c of p.colour)
    pills.push({
      key: `colour-${c}`,
      label: COLOURS.find((x) => x.value === c)!.label,
      without: { ...p, colour: p.colour.filter((x) => x !== c) },
    });
  if (p.edit)
    pills.push({ key: 'edit', label: editBySlug(p.edit)!.title, without: { ...p, edit: null } });
  if (p.suburb) pills.push({ key: 'suburb', label: p.suburb, without: { ...p, suburb: null } });
  if (p.sort !== 'relevant')
    pills.push({
      key: 'sort',
      label: `Sort: ${SORTS.find((s) => s.value === p.sort)!.label}`,
      without: { ...p, sort: 'relevant' },
    });
  return pills;
}

export function clearFilters(p: DiscoverParams): DiscoverParams {
  return { ...EMPTY, q: p.q, cat: p.cat };
}

/**
 * Every single thing narrowing the feed that could be taken away (not the sort), for "A little
 * too specific": the page counts each one's results and suggests the best.
 */
export function narrowingFilters(p: DiscoverParams): Pill[] {
  const out = activePills(p).filter((x) => x.key !== 'sort');
  if (p.cat !== 'all' && p.cat !== 'makers')
    out.push({
      key: 'cat',
      label: CATEGORIES.find((c) => c.value === p.cat)?.label ?? p.cat,
      without: { ...p, cat: 'all' },
    });
  if (p.q) out.push({ key: 'q', label: `“${p.q}”`, without: { ...p, q: '' } });
  return out;
}

/** "navy dresses", "size 10 made to order": what's left once one filter is taken away. */
export function describeFilters(p: DiscoverParams): string {
  const parts = [
    ...p.colour.map((c) => COLOURS.find((x) => x.value === c)?.label.toLowerCase() ?? c),
    ...p.size.map((s) => `size ${s}`),
    ...p.avail.map((a) => AVAILABILITY.find((x) => x.value === a)?.label.toLowerCase() ?? a),
    p.cat !== 'all' && p.cat !== 'makers'
      ? (CATEGORIES.find((c) => c.value === p.cat)?.label.toLowerCase() ?? p.cat)
      : '',
    p.max !== null ? `under A$${p.max}` : '',
  ].filter(Boolean);
  return parts.slice(0, 3).join(' ');
}
