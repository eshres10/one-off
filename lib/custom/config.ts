/**
 * "Have it made": the choices in the brief and the rules the matcher uses. Change them here.
 */

export const CUSTOM_CATEGORIES = [
  'Dresses',
  'Slips',
  'Bridal',
  'Two-piece sets',
  'Tops',
  'Skirts',
  'Tailoring',
  'Outerwear',
] as const;
export type CustomCategory = (typeof CUSTOM_CATEGORIES)[number];

export const CUSTOM_KINDS = [
  { value: 'dress', label: 'Dress', categories: ['Dresses', 'Slips'] },
  { value: 'one_piece', label: 'One-piece', categories: ['Two-piece sets', 'Dresses'] },
  { value: 'suit', label: 'Suit', categories: ['Tailoring', 'Two-piece sets'] },
  { value: 'bridal', label: 'Bridal', categories: ['Bridal'] },
  { value: 'top_or_skirt', label: 'Top or skirt', categories: ['Tops', 'Skirts'] },
  // "Something else" matches any category.
  { value: 'other', label: 'Something else', categories: [...CUSTOM_CATEGORIES] },
] as const satisfies ReadonlyArray<{
  value: string;
  label: string;
  categories: readonly CustomCategory[];
}>;
export type CustomKind = (typeof CUSTOM_KINDS)[number]['value'];

/** A$ (whole dollars). The last band has no top. */
export const BUDGET_BANDS = [
  { label: 'A$300–450', min: 300, max: 450 },
  { label: 'A$450–700', min: 450, max: 700 },
  { label: 'A$700–1k', min: 700, max: 1000 },
  { label: 'A$1k+', min: 1000, max: null },
] as const;

/** Usual time to make, as maker settings chips → weeks range [lower, upper). */
export const LEAD_TIME_CHOICES = [
  { label: '1–2 weeks', lower: 1, upper: 2 },
  { label: '2–3 weeks', lower: 2, upper: 3 },
  { label: '3–4 weeks', lower: 3, upper: 4 },
  { label: '5+ weeks', lower: 5, upper: 8 },
] as const;

export const CUSTOM = {
  maxMakers: 3,
  replyHours: 48,
  quoteValidDays: 7,
  results: 5,
  /** "My city" as a fitting radius. */
  cityRadiusKm: 30,
  /** The maker gets this share of the item price when they mark the fabric bought. */
  advancePct: 30,
  /** Score weights (each part is 0–1 before weighting). */
  weights: {
    fabric: 0.25,
    distance: 0.2,
    replySpeed: 0.15,
    rating: 0.2,
    spots: 0.05,
    sourceListing: 0.15,
  },
} as const;

export const kindCategories = (kind: string): readonly string[] =>
  CUSTOM_KINDS.find((k) => k.value === kind)?.categories ?? CUSTOM_CATEGORIES;
