/**
 * The buyer's brief as the "Have it made" screens hold it, with every choice list and the rules
 * for moving on. Pure: shared by the client flow, the server and the tests.
 */
import { BUDGET_BANDS, CUSTOM, CUSTOM_KINDS, type CustomKind } from './config';

export const OCCASIONS = [
  { value: 'wedding_guest', label: 'Wedding guest' },
  { value: 'my_wedding', label: 'My wedding' },
  { value: 'races', label: 'Races' },
  { value: 'formal', label: 'Formal' },
  { value: 'event', label: 'Event' },
  { value: 'birthday', label: 'Birthday' },
  { value: 'work', label: 'Work' },
  { value: 'everyday', label: 'Everyday' },
  { value: 'other', label: 'Something else' },
] as const;
export type Occasion = (typeof OCCASIONS)[number]['value'];

export const FABRIC_CHIPS = [
  'Silk',
  'Satin',
  'Linen',
  'Cotton',
  'Lace',
  'Wool',
  'Not sure',
] as const;
export const DETAIL_CHIPS = [
  'Sleeves',
  'Low back',
  'Lined',
  'Pockets',
  'Slit',
  'Cowl neck',
  'Adjustable straps',
  'Hand finishes',
] as const;

/** The 23 swatches, white to black. */
export const COLOURS = [
  ['White', '#FBFAF7'],
  ['Ivory', '#F1ECE2'],
  ['Butter', '#EFE3A8'],
  ['Mustard', '#C99A2E'],
  ['Camel', '#B48A5F'],
  ['Rust', '#A4502C'],
  ['Terracotta', '#C46B4E'],
  ['Red', '#B3261E'],
  ['Blush', '#EBC7C2'],
  ['Pink', '#D9779A'],
  ['Lilac', '#B9A7CF'],
  ['Plum', '#5B2A4E'],
  ['Wine', '#5A1E24'],
  ['Sky', '#A9C7DE'],
  ['Cobalt', '#2C4FA3'],
  ['Navy', '#26324F'],
  ['Teal', '#2E6B6A'],
  ['Emerald', '#1F6B4A'],
  ['Sage', '#B9C2B5'],
  ['Olive', '#6B6B3A'],
  ['Chocolate', '#4A3226'],
  ['Grey', '#9A9792'],
  ['Black', '#111111'],
] as const;

export const MAKERS_CHOICE = 'makers_choice';

/** Print tiles, drawn with CSS backgrounds. */
export const PATTERNS = [
  { value: 'plain', name: 'Plain', bg: 'linear-gradient(135deg, #F1ECE2, #E2DED7)' },
  {
    value: 'leopard',
    name: 'Leopard',
    bg: 'radial-gradient(circle at 30% 40%, #7A5230 0 3px, #2A1D12 3px 4.6px, transparent 5px) 0 0 / 23px 19px, radial-gradient(circle at 70% 60%, #8A5E36 0 2.4px, #2A1D12 2.4px 4px, transparent 4.4px) 0 0 / 17px 21px, radial-gradient(circle, #2A1D12 0 1.5px, transparent 2px) 0 0 / 13px 11px, #D7AE76',
  },
  {
    value: 'zebra',
    name: 'Zebra',
    bg: 'repeating-linear-gradient(118deg, #111111 0 3px, #F4F1EA 3px 7px, #111111 7px 8px, #F4F1EA 8px 12px, #111111 12px 16px, #F4F1EA 16px 21px)',
  },
  {
    value: 'polka_dot',
    name: 'Polka dot',
    bg: 'radial-gradient(circle, #111111 0 2.5px, transparent 3px) 0 0 / 11px 11px, #F6F4F0',
  },
  {
    value: 'stripe',
    name: 'Stripe',
    bg: 'repeating-linear-gradient(90deg, #26324F 0 4px, #F6F4F0 4px 9px)',
  },
  {
    value: 'gingham',
    name: 'Gingham',
    bg: 'repeating-linear-gradient(0deg, rgba(179,38,30,0.45) 0 5px, transparent 5px 10px), repeating-linear-gradient(90deg, rgba(179,38,30,0.45) 0 5px, #FFFFFF 5px 10px)',
  },
  {
    value: 'floral',
    name: 'Floral',
    bg: 'radial-gradient(circle, #E9C46A 0 1.5px, #E6A0B0 1.5px 4px, transparent 4.5px) 0 0 / 14px 14px, radial-gradient(circle, #8FB08C 0 2px, transparent 2.5px) 7px 7px / 14px 14px, #2F3E46',
  },
  {
    value: 'check',
    name: 'Check',
    bg: 'repeating-linear-gradient(0deg, rgba(31,107,74,0.55) 0 3px, transparent 3px 8px, rgba(17,17,17,0.5) 8px 9px, transparent 9px 14px), repeating-linear-gradient(90deg, rgba(31,107,74,0.55) 0 3px, transparent 3px 8px, rgba(179,38,30,0.5) 8px 9px, transparent 9px 14px), #EFE6D2',
  },
  {
    value: 'snake',
    name: 'Snake',
    bg: 'radial-gradient(ellipse 6px 4px at 50% 50%, #CFC4AE 0 60%, #6F6455 62% 70%, transparent 72%) 0 0 / 10px 8px, radial-gradient(ellipse 6px 4px at 50% 50%, #CFC4AE 0 60%, #6F6455 62% 70%, transparent 72%) 5px 4px / 10px 8px, #8D806B',
  },
  {
    value: 'abstract',
    name: 'Abstract',
    bg: 'conic-gradient(from 40deg at 30% 40%, #C46B4E, #EFE3A8, #2E6B6A, #26324F, #C46B4E)',
  },
  {
    value: 'lace',
    name: 'Lace',
    bg: 'radial-gradient(circle, transparent 0 3px, #FBFAF7 3px 4px, transparent 4.5px) 0 0 / 10px 10px, #E8E1D6',
  },
  {
    value: 'surprise',
    name: 'Surprise me',
    bg: 'linear-gradient(135deg, #F6F4F0 0 48%, #111111 48% 52%, #F6F4F0 52%)',
  },
] as const;

/** The 8 measurements, in cm, in the order the grid shows them. */
export const MEASURE_FIELDS = [
  { key: 'bust', label: 'Bust', min: 50, max: 200 },
  { key: 'waist', label: 'Waist', min: 40, max: 200 },
  { key: 'hips', label: 'Hips', min: 50, max: 220 },
  { key: 'height', label: 'Height', min: 100, max: 230 },
  { key: 'shoulder', label: 'Shoulder', min: 20, max: 80 },
  { key: 'arm', label: 'Arm', min: 30, max: 100 },
  { key: 'nape_waist', label: 'Nape–waist', min: 20, max: 80 },
  { key: 'waist_floor', label: 'Waist–floor', min: 50, max: 160 },
] as const;
export type MeasureKey = (typeof MEASURE_FIELDS)[number]['key'];
export type Measurements = Partial<Record<MeasureKey, number>>;

/** "Good to know" on the budget step, per kind. */
export const PRICE_GUIDE: Record<CustomKind, { hours: string; from: number; to: number }> = {
  dress: { hours: '15–30 hours', from: 450, to: 900 },
  one_piece: { hours: '12–25 hours', from: 400, to: 800 },
  suit: { hours: '30–50 hours', from: 900, to: 1800 },
  bridal: { hours: '40–80 hours', from: 1200, to: 3500 },
  top_or_skirt: { hours: '6–15 hours', from: 250, to: 500 },
  other: { hours: '10–30 hours', from: 350, to: 900 },
};

export const PASS_REASONS = [
  { value: 'booked', label: 'Fully booked' },
  { value: 'not_my_thing', label: 'Not something I make' },
  { value: 'budget', label: 'Budget is too low for this' },
  { value: 'date', label: 'Can’t make their date' },
] as const;

export const FITTING_OPTIONS = [
  { value: 'none', label: 'No fitting needed', short: 'No fitting' },
  { value: 'studio_one', label: 'One studio fitting', short: 'One fitting at the studio' },
  { value: 'studio_two', label: 'Two studio fittings', short: 'Two fittings, at the studio' },
  { value: 'video', label: 'Video fitting', short: 'A video fitting' },
] as const;
export type Fitting = (typeof FITTING_OPTIONS)[number]['value'];

export const WORDS_MIN = 20;
export const INSPIRATION_MAX = 6;

export type FitMode = 'saved' | 'measurements' | 'fitting';
export type Reach = 'both' | 'near';
export type DateChoice = 'soon' | 'later' | 'custom' | 'flexible';

export interface Brief {
  kind: CustomKind | null;
  occasion: Occasion | null;
  occasionOther: string;
  dateChoice: DateChoice;
  /** YYYY-MM-DD when dateChoice is custom. */
  customDate: string;
  inspiration: string[];
  link: string;
  words: string;
  fabrics: string[];
  details: string[];
  /** A swatch name, 'custom:#RRGGBB', 'makers_choice' or null. */
  colour: string | null;
  pattern: string;
  fitMode: FitMode | null;
  measurements: Measurements;
  saveMeasurements: boolean;
  budget: number;
  postcode: string;
  suburb: string;
  state: string;
  reach: Reach;
  anonymous: boolean;
  sourceListingId: string | null;
}

export const EMPTY_BRIEF: Brief = {
  kind: null,
  occasion: null,
  occasionOther: '',
  dateChoice: 'later',
  customDate: '',
  inspiration: [],
  link: '',
  words: '',
  fabrics: [],
  details: [],
  colour: null,
  pattern: 'plain',
  fitMode: null,
  measurements: {},
  saveMeasurements: true,
  budget: 1,
  postcode: '',
  suburb: '',
  state: '',
  reach: 'both',
  anonymous: true,
  sourceListingId: null,
};

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** "28 Nov" (UTC, so a YYYY-MM-DD is shown as itself everywhere). */
export const fmtDay = (iso: string | Date) =>
  new Date(typeof iso === 'string' ? `${iso.slice(0, 10)}T00:00:00Z` : iso).toLocaleDateString(
    'en-AU',
    { day: 'numeric', month: 'short', timeZone: 'UTC' },
  );

/** "Sat 28 Nov". */
export const fmtDayLong = (iso: string | Date) =>
  new Date(typeof iso === 'string' ? `${iso.slice(0, 10)}T00:00:00Z` : iso).toLocaleDateString(
    'en-AU',
    { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' },
  );

/** The two date shortcuts: about 3½ and 5½ weeks out, on a Saturday. */
export function dateShortcuts(today = new Date()) {
  const sat = (weeks: number) => {
    const d = addDays(today, weeks * 7);
    const shift = (6 - d.getUTCDay() + 7) % 7;
    return isoDay(addDays(d, shift));
  };
  return { soon: sat(3), later: sat(5) };
}

/** The needed-by date for a brief, or null when flexible. */
export function neededBy(b: Brief, today = new Date()): string | null {
  const s = dateShortcuts(today);
  if (b.dateChoice === 'flexible') return null;
  if (b.dateChoice === 'custom') return b.customDate || null;
  return s[b.dateChoice];
}

/** Weeks or days until a date, for the hint line. */
export function weeksAway(iso: string, today = new Date()): string {
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - today.getTime()) / DAY);
  if (days <= 0) return '';
  if (days < 14) return `${days} days`;
  const w = Math.round((days / 7) * 2) / 2;
  return `${w} weeks`;
}

export function dateNote(b: Brief, today = new Date()): string {
  const by = neededBy(b, today);
  if (b.dateChoice === 'flexible') return 'No rush. Every maker who fits can be asked.';
  if (b.dateChoice === 'custom' && !by) return 'Pick the date you need it in your hands.';
  const days = Math.round((Date.parse(`${by}T00:00:00Z`) - today.getTime()) / DAY);
  if (b.dateChoice === 'custom')
    return days < 21
      ? `That’s ${weeksAway(by!, today)} away. Tight, so fewer makers can do it in time.`
      : `That’s ${weeksAway(by!, today)} away. Plenty of time for most makers.`;
  return b.dateChoice === 'soon'
    ? 'Tight but possible. Fewer makers can do it in time.'
    : 'Plenty of time. Most makers need 3–5 weeks for a custom dress.';
}

export const STEP_COUNT = 7;

/** Whether the buyer can move on from a step (1–7). */
export function stepReady(step: number, b: Brief): boolean {
  switch (step) {
    case 1:
      return b.kind !== null;
    case 2:
      return (
        b.occasion !== null &&
        (b.occasion !== 'other' || b.occasionOther.trim().length > 0) &&
        (b.dateChoice !== 'custom' || /^\d{4}-\d{2}-\d{2}$/.test(b.customDate))
      );
    case 3:
      return b.words.trim().length >= WORDS_MIN;
    case 4:
      return true;
    case 5:
      return (
        b.fitMode === 'saved' ||
        b.fitMode === 'fitting' ||
        (b.fitMode === 'measurements' &&
          ['bust', 'waist', 'hips'].every((k) => measurementOk(k as MeasureKey, b.measurements)))
      );
    case 6:
      return b.budget >= 0 && b.budget < BUDGET_BANDS.length;
    case 7:
      return /^\d{4}$/.test(b.postcode) && b.suburb.length > 0;
    default:
      return true;
  }
}

export function measurementOk(key: MeasureKey, m: Measurements): boolean {
  const f = MEASURE_FIELDS.find((x) => x.key === key)!;
  const v = m[key];
  return typeof v === 'number' && Number.isFinite(v) && v >= f.min && v <= f.max;
}

export const kindLabel = (kind: string | null) =>
  CUSTOM_KINDS.find((k) => k.value === kind)?.label ?? 'Piece';

/** "dresses", "tops and skirts": what the finding screen says a maker makes. */
export function kindPlural(kind: string | null): string {
  switch (kind) {
    case 'dress':
      return 'dresses';
    case 'one_piece':
      return 'one-pieces';
    case 'suit':
      return 'suits';
    case 'bridal':
      return 'bridal pieces';
    case 'top_or_skirt':
      return 'tops and skirts';
    default:
      return 'pieces like this';
  }
}

export const occasionLabel = (b: Pick<Brief, 'occasion' | 'occasionOther'>) =>
  b.occasion === 'other'
    ? b.occasionOther.trim() || 'Something else'
    : (OCCASIONS.find((o) => o.value === b.occasion)?.label ?? '');

export function colourLabel(colour: string | null): string {
  if (!colour) return '—';
  if (colour === MAKERS_CHOICE) return 'Maker’s choice';
  if (colour.startsWith('custom:')) return `Your colour · ${colour.slice(7).toUpperCase()}`;
  return colour;
}

/** The hex behind a stored colour, for a swatch. Null for maker's choice. */
export function colourHex(colour: string | null): string | null {
  if (!colour || colour === MAKERS_CHOICE) return null;
  if (colour.startsWith('custom:')) return colour.slice(7);
  return COLOURS.find(([n]) => n === colour)?.[1] ?? null;
}

export const patternName = (value: string) =>
  PATTERNS.find((p) => p.value === value)?.name ?? 'Plain';

export const budgetLabel = (i: number) => BUDGET_BANDS[i]?.label ?? '';

/** "Custom silk dress", for order lines and titles. */
export function pieceTitle(b: Pick<Brief, 'kind' | 'fabrics'>): string {
  const fabric = b.fabrics.find((f) => f.toLowerCase() !== 'not sure');
  const kind = kindLabel(b.kind).toLowerCase();
  return `Custom ${fabric ? `${fabric.toLowerCase()} ` : ''}${kind === 'something else' ? 'piece' : kind}`;
}

/** The "Your brief" card and the maker's facts list. */
export function briefRows(b: Brief, today = new Date()): Array<[string, string]> {
  const by = neededBy(b, today);
  return [
    ['Making', b.kind ? kindLabel(b.kind) : '—'],
    ['For', b.occasion ? `${occasionLabel(b)} · ${by ? `by ${fmtDay(by)}` : 'flexible'}` : '—'],
    ['Fabric', b.fabrics.join(', ') || 'Maker suggests'],
    ['Details', b.details.join(', ') || '—'],
    [
      'Colour',
      colourLabel(b.colour) + (b.pattern !== 'plain' ? ` · ${patternName(b.pattern)}` : ''),
    ],
    [
      'Fit',
      b.fitMode === 'measurements'
        ? `${Object.keys(b.measurements).length} measurements`
        : b.fitMode === 'saved'
          ? 'Saved sizes'
          : b.fitMode === 'fitting'
            ? 'In-person fitting'
            : '—',
    ],
    ['Budget', budgetLabel(b.budget)],
    [
      'Where',
      b.suburb
        ? `${b.suburb}, ${b.state} · ${b.reach === 'both' ? 'posted or nearby' : `within ${CUSTOM.cityRadiusKm} km`}`
        : '—',
    ],
    ['Shown as', b.anonymous ? 'Anonymous' : 'Your name'],
  ];
}

export const DRAFT_KEY = 'oo.have-it-made.draft';

/** Draft in this browser (survives sign-in). Storage can be missing or blocked. */
export function readDraft(): { brief: Brief; step: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { brief?: Partial<Brief>; step?: number };
    if (!d.brief) return null;
    return { brief: { ...EMPTY_BRIEF, ...d.brief }, step: Number(d.step) || 0 };
  } catch {
    return null;
  }
}

export function writeDraft(brief: Brief, step: number) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ brief, step, at: Date.now() }));
  } catch {
    // Private mode or storage off: the brief lives in memory only.
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

/** What's missing on a step, in the words the screens use. */
export function stepMessage(step: number): string {
  return step === 3
    ? `Tell the makers a little more: at least ${WORDS_MIN} characters.`
    : step === 5
      ? 'Add your bust, waist and hips so makers can check the fit.'
      : step === 7
        ? 'Add your postcode so we can find makers near you.'
        : 'Finish the brief first.';
}

/** The first step that isn't ready, or null when the whole brief is. */
export function firstIncompleteStep(b: Brief): number | null {
  for (let step = 1; step <= 7; step++) if (!stepReady(step, b)) return step;
  return null;
}
