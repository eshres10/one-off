import { BUDGET_BANDS, CUSTOM, kindCategories } from './config';

/** What the matcher needs from a buyer's brief. */
export interface MatchBrief {
  kind: string;
  /** Null means flexible. */
  neededBy: Date | null;
  fabrics: string[];
  details: string[];
  budgetMin: number | null;
  /** Null means no top (A$1k+). */
  budgetMax: number | null;
  fitMode: 'saved' | 'measurements' | 'fitting' | null;
  reach: 'both' | 'near';
  lat: number | null;
  lng: number | null;
  /** The maker of the piece they started from, if any. */
  sourceMakerId?: string | null;
}

/** A maker who takes custom work, with what the matcher reads about them. */
export interface MatchCandidate {
  makerId: string;
  name: string;
  slug: string;
  suburb: string | null;
  avatarUrl: string | null;
  rating: number;
  reviewCount: number;
  replyHours: number;
  /** Shop approved and live (or on holiday). */
  active: boolean;
  holidayFrom: Date | null;
  holidayUntil: Date | null;
  open: boolean;
  spotsLeft: number;
  categories: string[];
  fabrics: string[];
  minPrice: number;
  leadWeeks: [number, number];
  fittingsInPerson: boolean;
  fittingRadiusKm: number | null;
  postsAustraliaWide: boolean;
  lat: number | null;
  lng: number | null;
}

export interface Match {
  makerId: string;
  name: string;
  slug: string;
  suburb: string | null;
  avatarUrl: string | null;
  rating: number;
  reviewCount: number;
  distanceKm: number | null;
  score: number;
  reasons: string[];
  readyBy: Date;
  /** A near miss: everything fits except the budget or the date. */
  warning: string | null;
}

export interface WidenOption {
  kind: 'budget' | 'date' | 'reach';
  label: string;
  count: number;
  brief: MatchBrief;
}

const DAY = 86_400_000;
const startOfDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d: Date, n: number) => new Date(startOfDay(d).getTime() + n * DAY);
const fmtDay = (d: Date) =>
  d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const lower = (s: string) => s.toLowerCase();

/** Great-circle distance in km. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

type Fail =
  | 'closed'
  | 'inactive'
  | 'holiday'
  | 'spots'
  | 'category'
  | 'budget'
  | 'date'
  | 'location';

interface Checked {
  c: MatchCandidate;
  fails: Fail[];
  distanceKm: number | null;
  readyBy: Date;
  fabricFit: boolean;
}

function check(brief: MatchBrief, c: MatchCandidate, today: Date): Checked {
  const fails: Fail[] = [];
  const distanceKm =
    brief.lat != null && brief.lng != null && c.lat != null && c.lng != null
      ? haversineKm({ lat: brief.lat, lng: brief.lng }, { lat: c.lat, lng: c.lng })
      : null;
  const readyBy = addDays(today, c.leadWeeks[0] * 7);
  if (!c.open) fails.push('closed');
  if (!c.active) fails.push('inactive');
  // Away for any of the time between now and when it's needed.
  const until = brief.neededBy ?? addDays(today, c.leadWeeks[1] * 7);
  if (
    c.holidayUntil &&
    c.holidayUntil >= startOfDay(today) &&
    (!c.holidayFrom || c.holidayFrom <= until)
  )
    fails.push('holiday');
  if (c.spotsLeft <= 0) fails.push('spots');
  const wanted = kindCategories(brief.kind);
  if (!c.categories.some((cat) => wanted.includes(cat))) fails.push('category');
  if (brief.budgetMax != null && c.minPrice > brief.budgetMax) fails.push('budget');
  if (brief.neededBy && readyBy > startOfDay(brief.neededBy)) fails.push('date');
  const radius = c.fittingRadiusKm ?? CUSTOM.cityRadiusKm;
  const within = distanceKm != null && distanceKm <= radius;
  const nearOnly = brief.reach === 'near' || brief.fitMode === 'fitting';
  if (nearOnly ? !(c.fittingsInPerson && within) : !(c.postsAustraliaWide || within))
    fails.push('location');
  const chosen = brief.fabrics.filter((f) => lower(f) !== 'not sure');
  const fabricFit =
    chosen.length === 0 || chosen.some((f) => c.fabrics.map(lower).includes(lower(f)));
  return { c, fails, distanceKm, readyBy, fabricFit };
}

function score(brief: MatchBrief, k: Checked): number {
  const w = CUSTOM.weights;
  const nearMatters = brief.reach === 'near' || brief.fitMode === 'fitting';
  const radius = k.c.fittingRadiusKm ?? CUSTOM.cityRadiusKm;
  const distance =
    k.distanceKm == null ? 0 : Math.max(0, 1 - k.distanceKm / (nearMatters ? radius : 1000));
  return (
    1 +
    w.fabric * (k.fabricFit ? 1 : 0) +
    w.distance * distance +
    w.replySpeed * (1 - Math.min(k.c.replyHours, 48) / 48) +
    w.rating * (k.c.rating / 5) +
    w.spots * (Math.min(k.c.spotsLeft, 4) / 4) +
    w.sourceListing * (brief.sourceMakerId && brief.sourceMakerId === k.c.makerId ? 1 : 0)
  );
}

function reasons(brief: MatchBrief, k: Checked): string[] {
  const out: string[] = [];
  const shared = brief.fabrics.find((f) => k.c.fabrics.map(lower).includes(lower(f)));
  if (shared)
    out.push(
      brief.details.some((d) => lower(d) === 'bias cut')
        ? `Bias-cut ${lower(shared)}`
        : `Works in ${lower(shared)}`,
    );
  if (brief.budgetMax == null || k.c.minPrice <= brief.budgetMax) out.push('Fits your budget');
  out.push(`Ready by ${fmtDay(k.readyBy)}`);
  if (k.c.spotsLeft <= 2) out.push(`${k.c.spotsLeft} spot${k.c.spotsLeft === 1 ? '' : 's'} left`);
  if (k.distanceKm != null && k.distanceKm <= (k.c.fittingRadiusKm ?? CUSTOM.cityRadiusKm))
    out.push(`${Math.max(1, Math.round(k.distanceKm))} km away`);
  if (k.c.fittingsInPerson && brief.fitMode === 'fitting') out.push('In-person fittings');
  if (brief.fitMode === 'measurements' || brief.fitMode === 'saved')
    out.push('Works to measurements');
  return out.slice(0, 4);
}

function toMatch(brief: MatchBrief, k: Checked, warning: string | null): Match {
  return {
    makerId: k.c.makerId,
    name: k.c.name,
    slug: k.c.slug,
    suburb: k.c.suburb,
    avatarUrl: k.c.avatarUrl,
    rating: k.c.rating,
    reviewCount: k.c.reviewCount,
    distanceKm: k.distanceKm == null ? null : Math.round(k.distanceKm),
    score: Math.round(score(brief, k) * 1000) / 1000,
    reasons: reasons(brief, k),
    readyBy: k.readyBy,
    warning,
  };
}

/**
 * The makers who can make this brief, best first: up to 5, the last of which may be one near miss
 * (only the budget or only the date doesn't fit), flagged with a warning line.
 */
export function matchMakers(brief: MatchBrief, candidates: MatchCandidate[], today = new Date()) {
  const checked = candidates.map((c) => check(brief, c, today));
  const eligible = checked
    .filter((k) => k.fails.length === 0)
    .sort((a, b) => score(brief, b) - score(brief, a));
  const matches = eligible.slice(0, CUSTOM.results).map((k) => toMatch(brief, k, null));
  const near = checked
    .filter((k) => k.fails.length === 1 && (k.fails[0] === 'budget' || k.fails[0] === 'date'))
    .sort((a, b) => score(brief, b) - score(brief, a))[0];
  if (near && matches.length < CUSTOM.results)
    matches.push(
      toMatch(
        brief,
        near,
        near.fails[0] === 'budget'
          ? `Usually from A$${near.c.minPrice.toLocaleString('en-AU')}, above your budget`
          : `Earliest ready by ${fmtDay(near.readyBy)}, after your date`,
      ),
    );
  return { matches, eligibleCount: eligible.length };
}

/**
 * When nothing fits: the same search with one thing relaxed at a time (budget up a band, two more
 * weeks, posted as well as nearby), keeping only the ones that would find someone.
 */
export function widenOptions(
  brief: MatchBrief,
  candidates: MatchCandidate[],
  today = new Date(),
): WidenOption[] {
  const out: WidenOption[] = [];
  const count = (b: MatchBrief) => matchMakers(b, candidates, today).eligibleCount;
  const band = BUDGET_BANDS.findIndex((b) => b.max === brief.budgetMax);
  const up = band >= 0 ? BUDGET_BANDS[band + 1] : undefined;
  if (up) {
    const b = { ...brief, budgetMin: up.min, budgetMax: up.max };
    out.push({ kind: 'budget', label: `Raise budget to ${up.label}`, count: count(b), brief: b });
  }
  if (brief.neededBy) {
    const later = addDays(brief.neededBy, 14);
    const b = { ...brief, neededBy: later };
    out.push({ kind: 'date', label: `Need it by ${fmtDay(later)}`, count: count(b), brief: b });
  }
  if (brief.reach === 'near' && brief.fitMode !== 'fitting') {
    const b = { ...brief, reach: 'both' as const };
    out.push({ kind: 'reach', label: 'Include makers who post', count: count(b), brief: b });
  }
  return out.filter((o) => o.count > 0);
}
