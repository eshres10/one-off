/**
 * The style vocabulary pieces are tagged with (makers pick up to four in the listing editor).
 * The database checks tags against the same list (0010_onboarding.sql).
 */
export const STYLE_GROUPS = {
  fabric: ['Satin', 'Linen', 'Cotton', 'Lace & crochet', 'Knit'],
  colour: ['Neutrals', 'Soft colour', 'Bold colour', 'Earthy', 'Monochrome'],
  mood: ['Minimal', 'Romantic', 'Statement', 'Tailoring', 'Evening', 'Holiday'],
} as const;

export type StyleGroup = keyof typeof STYLE_GROUPS;
export type StyleTag = (typeof STYLE_GROUPS)[StyleGroup][number];

export const STYLE_TAGS: readonly StyleTag[] = [
  ...STYLE_GROUPS.fabric,
  ...STYLE_GROUPS.colour,
  ...STYLE_GROUPS.mood,
];
export const MAX_STYLE_TAGS = 4;

export const isStyleTag = (t: string): t is StyleTag =>
  (STYLE_TAGS as readonly string[]).includes(t);

export function groupOf(tag: StyleTag): StyleGroup {
  return (Object.keys(STYLE_GROUPS) as StyleGroup[]).find((g) =>
    (STYLE_GROUPS[g] as readonly string[]).includes(tag),
  )!;
}

export type TasteWeights = Partial<Record<StyleTag, number>>;

/** The strongest tags first, ignoring anything that has faded to nothing. */
export function topTags(weights: TasteWeights, n = 3): StyleTag[] {
  return (Object.entries(weights) as Array<[StyleTag, number]>)
    .filter(([t, w]) => isStyleTag(t) && w > 0.05)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([t]) => t);
}

/**
 * The taste a set of picks implies: +1 for each picked piece's tags, plus +0.5 for the tags its
 * maker uses most often (beyond the piece's own).
 */
export function tasteFromPicks(
  picks: Array<{ tags: string[]; makerCommonTags: string[] }>,
): TasteWeights {
  const out: TasteWeights = {};
  const add = (t: string, w: number) => {
    if (isStyleTag(t)) out[t] = Math.round(((out[t] ?? 0) + w) * 1000) / 1000;
  };
  for (const p of picks) {
    for (const t of p.tags) add(t, 1);
    for (const t of p.makerCommonTags) if (!p.tags.includes(t)) add(t, 0.5);
  }
  return out;
}

/** "Leaning satin, minimal, evening." */
export function leaningLine(weights: TasteWeights): string | null {
  const top = topTags(weights, 3);
  return top.length ? `Leaning ${top.map((t) => t.toLowerCase()).join(', ')}.` : null;
}

export const OCCASIONS = [
  { value: 'weddings', label: 'Weddings', image: '/seed/lace-trim-maxi-dress.jpg' },
  { value: 'racing', label: 'Racing', image: '/seed/tangerine-bias-maxi.jpg' },
  { value: 'everyday', label: 'Everyday', image: '/seed/embroidered-ruffle-dress.jpg' },
  { value: 'black-tie', label: 'Black tie', image: '/seed/wine-satin-halter-set.jpg' },
  { value: 'holiday', label: 'Holiday', image: '/seed/crochet-lace-maxi.jpg' },
  { value: 'work', label: 'Work', image: '/seed/hero-linen-suit.jpg' },
] as const;
export type Occasion = (typeof OCCASIONS)[number]['value'];

export const HEIGHT_BANDS = [
  { value: 'under-165', label: 'Under 165 cm' },
  { value: '165-175', label: '165–175 cm' },
  { value: 'over-175', label: 'Over 175 cm' },
] as const;

export const ONBOARDING_SIZES = ['6', '8', '10', '12', '14', '16', '18', '20'] as const;
