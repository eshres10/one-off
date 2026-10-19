import { sanitizeText } from '@/lib/domain/moderation';

/** "Story of the garment": the optional story a maker writes for a piece. */
export interface PieceStory {
  /** Their line, shown big. */
  quote: string;
  inspiration: string;
  details: string[];
  fabric: string;
  hoursToMake: number | null;
  closeups: Array<{ path: string; caption: string }>;
}

export const STORY_LIMITS = {
  quote: 160,
  inspiration: 1200,
  details: 12,
  detail: 40,
  fabric: 240,
  hoursMin: 1,
  hoursMax: 500,
  closeups: 3,
  caption: 120,
} as const;

export const EMPTY_STORY: PieceStory = {
  quote: '',
  inspiration: '',
  details: [],
  fabric: '',
  hoursToMake: null,
  closeups: [],
};

/** A story counts once any one part is filled in. */
export function hasStory(s: PieceStory | null | undefined): s is PieceStory {
  if (!s) return false;
  return Boolean(
    s.quote.trim() ||
      s.inspiration.trim() ||
      s.details.length ||
      s.fabric.trim() ||
      s.hoursToMake ||
      s.closeups.length,
  );
}

/**
 * How many prompts are answered. Desktop counts five (quote, inspiration, details, fabric, hours);
 * the phone flow has no quote, so it counts four. Close-ups never count.
 */
export function storyPrompts(s: PieceStory, from: 'desktop' | 'phone' = 'desktop'): number {
  const parts = [s.inspiration.trim(), s.details.length > 0, s.fabric.trim(), s.hoursToMake];
  if (from === 'desktop') parts.unshift(s.quote.trim());
  return parts.filter(Boolean).length;
}

/** "Inspiration, the hand finishes and 14 hours of making", leaving out what's empty. */
export function storySubLine(s: PieceStory): string {
  const parts = [
    s.inspiration.trim() || s.quote.trim() ? 'Inspiration' : '',
    s.details.length ? 'the hand finishes' : '',
    s.fabric.trim() && !s.details.length ? 'the fabric' : '',
    s.hoursToMake ? `${s.hoursToMake} hours of making` : '',
  ].filter(Boolean);
  if (!parts.length) return 'Close-ups from the studio';
  const text =
    parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Trims, strips control characters and enforces the limits (the database checks them too). */
export function cleanStory(input: Partial<PieceStory> | null | undefined): PieceStory {
  const s = { ...EMPTY_STORY, ...(input ?? {}) };
  const hours = Number(s.hoursToMake);
  const details: string[] = [];
  for (const d of s.details ?? []) {
    const t = sanitizeText(String(d)).replace(/\s+/g, ' ').slice(0, STORY_LIMITS.detail).trim();
    if (t && !details.some((x) => x.toLowerCase() === t.toLowerCase())) details.push(t);
  }
  return {
    quote: sanitizeText(s.quote ?? '')
      .replace(/^["“”']+|["“”']+$/g, '')
      .slice(0, STORY_LIMITS.quote)
      .trim(),
    inspiration: sanitizeText(s.inspiration ?? '')
      .slice(0, STORY_LIMITS.inspiration)
      .trim(),
    details: details.slice(0, STORY_LIMITS.details),
    fabric: sanitizeText(s.fabric ?? '')
      .slice(0, STORY_LIMITS.fabric)
      .trim(),
    hoursToMake:
      Number.isFinite(hours) && hours >= STORY_LIMITS.hoursMin
        ? Math.min(STORY_LIMITS.hoursMax, Math.round(hours))
        : null,
    closeups: (s.closeups ?? [])
      .filter((c) => c && typeof c.path === 'string' && c.path)
      .slice(0, STORY_LIMITS.closeups)
      .map((c) => ({
        path: c.path.slice(0, 500),
        caption: sanitizeText(c.caption ?? '')
          .slice(0, STORY_LIMITS.caption)
          .trim(),
      })),
  };
}

/** The first ~120 characters at a word break, for the phone's "Read the full story". */
export function storyTeaser(text: string, max = 120): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20)).replace(/[\s,.;:–—-]+$/, '')}…`;
}
