import { describe, expect, it } from 'vitest';
import {
  matchMakers,
  widenOptions,
  type MatchBrief,
  type MatchCandidate,
} from '@/lib/custom/match';

const today = new Date('2026-10-20T00:00:00Z');
// Fitzroy, VIC.
const here = { lat: -37.7987, lng: 144.9784 };

const brief = (over: Partial<MatchBrief> = {}): MatchBrief => ({
  kind: 'dress',
  neededBy: new Date('2026-12-20T00:00:00Z'),
  fabrics: ['Silk'],
  details: ['Bias cut'],
  budgetMin: 450,
  budgetMax: 700,
  fitMode: 'measurements',
  reach: 'both',
  ...here,
  ...over,
});

let n = 0;
const maker = (over: Partial<MatchCandidate> = {}): MatchCandidate => {
  n += 1;
  return {
    makerId: `m${n}`,
    name: `Maker ${n}`,
    slug: `maker-${n}`,
    suburb: 'Fitzroy',
    avatarUrl: null,
    rating: 4.8,
    reviewCount: 10,
    replyHours: 12,
    active: true,
    holidayFrom: null,
    holidayUntil: null,
    open: true,
    spotsLeft: 3,
    categories: ['Dresses'],
    fabrics: ['Silk'],
    minPrice: 400,
    leadWeeks: [3, 4],
    fittingsInPerson: true,
    fittingRadiusKm: 20,
    postsAustraliaWide: true,
    // Collingwood, about 1 km away.
    lat: -37.8031,
    lng: 144.9886,
    ...over,
  };
};

// Byron Bay, NSW: far from Fitzroy.
const far = { lat: -28.6474, lng: 153.602 };

describe('matchMakers', () => {
  it('excludes closed, full, wrong category, over budget, too slow and too far', () => {
    const good = maker({ name: 'Good' });
    const out = matchMakers(
      brief({ reach: 'near', fitMode: 'fitting' }),
      [
        good,
        maker({ name: 'Closed', open: false }),
        maker({ name: 'Inactive', active: false }),
        maker({ name: 'Full', spotsLeft: 0 }),
        maker({ name: 'Suits', categories: ['Tailoring'] }),
        maker({ name: 'Pricey', minPrice: 1200 }),
        maker({ name: 'Slow', leadWeeks: [12, 14] }),
        maker({ name: 'Far', ...far }),
        maker({ name: 'No fittings', fittingsInPerson: false }),
        maker({
          name: 'Away',
          holidayFrom: new Date('2026-11-01T00:00:00Z'),
          holidayUntil: new Date('2026-11-20T00:00:00Z'),
        }),
      ],
      today,
    );
    expect(out.eligibleCount).toBe(1);
    // Only the budget is wrong for Pricey, so it comes back as the one near miss.
    expect(out.matches.map((m) => [m.name, m.warning])).toEqual([
      ['Good', null],
      ['Pricey', 'Usually from A$1,200, above your budget'],
    ]);
  });

  it('lets a far maker in when they post and the buyer takes posting', () => {
    const out = matchMakers(brief(), [maker({ name: 'Far', ...far })], today);
    expect(out.matches.map((m) => m.name)).toEqual(['Far']);
    expect(out.matches[0]!.distanceKm).toBeGreaterThan(1000);
    expect(out.matches[0]!.reasons).not.toContainEqual(expect.stringMatching(/km away/));
  });

  it('adds one near miss with its warning, after the real matches', () => {
    const out = matchMakers(
      brief(),
      [
        maker({ name: 'Good' }),
        maker({ name: 'Pricey', minPrice: 800 }),
        maker({ name: 'Slow', leadWeeks: [10, 12] }),
        // Two things wrong: not a near miss.
        maker({ name: 'Both', minPrice: 800, leadWeeks: [10, 12] }),
      ],
      today,
    );
    expect(out.eligibleCount).toBe(1);
    expect(out.matches).toHaveLength(2);
    expect(out.matches[0]).toMatchObject({ name: 'Good', warning: null });
    expect(out.matches[1]!.warning).toMatch(
      /^(Usually from A\$800, above your budget|Earliest ready by .+, after your date)$/,
    );
  });

  it('gives a slow near miss the date warning', () => {
    const out = matchMakers(brief(), [maker({ name: 'Slow', leadWeeks: [10, 12] })], today);
    expect(out.eligibleCount).toBe(0);
    expect(out.matches[0]!.warning).toBe('Earliest ready by 29 Dec, after your date');
  });

  it('ranks fabric fit, the source listing and closeness above the rest', () => {
    const out = matchMakers(
      brief({ sourceMakerId: 'src' }),
      [
        maker({ name: 'Cotton', fabrics: ['Cotton'] }),
        maker({ name: 'Silk' }),
        maker({ name: 'Source', makerId: 'src', fabrics: ['Cotton'] }),
      ],
      today,
    );
    expect(out.matches.map((m) => m.name)).toEqual(['Silk', 'Source', 'Cotton']);
    expect(out.matches[0]!.reasons).toEqual([
      'Bias-cut silk',
      'Fits your budget',
      'Ready by 10 Nov',
      '1 km away',
    ]);
  });

  it('returns at most five', () => {
    const many = Array.from({ length: 8 }, () => maker());
    expect(matchMakers(brief(), many, today).matches).toHaveLength(5);
  });
});

describe('widenOptions', () => {
  it('counts the makers each change would find and drops the ones that find none', () => {
    const candidates = [
      maker({ name: 'Pricey', minPrice: 800 }),
      maker({ name: 'Slow', leadWeeks: [10, 12] }),
      maker({ name: 'Posts only', ...far }),
      maker({ name: 'Also pricey', minPrice: 900 }),
    ];
    const b = brief({ reach: 'near' });
    expect(matchMakers(b, candidates, today).eligibleCount).toBe(0);
    const opts = widenOptions(b, candidates, today);
    expect(opts.map((o) => [o.kind, o.label, o.count])).toEqual([
      ['budget', 'Raise budget to A$700–1k', 2],
      ['date', 'Need it by 3 Jan', 1],
      ['reach', 'Include makers who post', 1],
    ]);
  });

  it('offers nothing that finds no one', () => {
    const opts = widenOptions(
      brief({ budgetMin: 1000, budgetMax: null, neededBy: null }),
      [maker({ categories: ['Bridal'] })],
      today,
    );
    expect(opts).toEqual([]);
  });
});
