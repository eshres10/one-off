/**
 * The last few pieces this browser looked at, kept in localStorage for the offline screen.
 * Every read and write is wrapped: storage can be blocked or full, and that must never break a page.
 */
export interface RecentPiece {
  slug: string;
  title: string;
  imageUrl: string | null;
}

const KEY = 'oo:recently-viewed';
const MAX = 6;

export function readRecent(): RecentPiece[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((p): p is RecentPiece => !!p && typeof p.slug === 'string').slice(0, MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberPiece(piece: RecentPiece) {
  try {
    const next = [piece, ...readRecent().filter((p) => p.slug !== piece.slug)].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: nothing to remember.
  }
}
