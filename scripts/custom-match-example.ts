/**
 * Prints the matcher's results for two sample briefs against the shops open for custom work.
 * Local only: `npx tsx scripts/custom-match-example.ts` after `npm run db:seed`.
 */
import { config } from 'dotenv';

config({ path: '.env.local' });
process.env.DATABASE_URL ??= 'postgres://postgres@127.0.0.1:54329/marketplace';
import { loadCandidates } from '@/lib/custom/candidates';
import { matchMakers, widenOptions, type MatchBrief } from '@/lib/custom/match';
import { closeDb, sql } from '@/lib/db';

const today = new Date('2026-10-20T00:00:00Z');

async function point(postcode: string, suburb: string) {
  const [p] = await sql()<{ lat: number; lng: number }[]>`
    select lat, lng from public.postcodes where postcode = ${postcode} and suburb = ${suburb} limit 1`;
  return p!;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(127\.0\.0\.1|localhost)[:/]/.test(url)) throw new Error('Local database only.');
  const candidates = await loadCandidates();
  console.log(
    `Open for custom work: ${candidates.map((c) => `${c.name} (${c.suburb})`).join(', ')}\n`,
  );

  const briefs: [string, MatchBrief][] = [
    [
      'Brief 1: bias-cut silk dress, A$450–700, by 20 Dec, to measurements, Fitzroy 3065, posting OK',
      {
        kind: 'dress',
        neededBy: new Date('2026-12-20T00:00:00Z'),
        fabrics: ['Silk'],
        details: ['Bias cut'],
        budgetMin: 450,
        budgetMax: 700,
        fitMode: 'measurements',
        reach: 'both',
        ...(await point('3065', 'Fitzroy')),
      },
    ],
    [
      'Brief 2: bridal, A$450–700, by 3 Nov, in-person fittings, Brunswick 3056',
      {
        kind: 'bridal',
        neededBy: new Date('2026-11-03T00:00:00Z'),
        fabrics: ['Silk'],
        details: [],
        budgetMin: 450,
        budgetMax: 700,
        fitMode: 'fitting',
        reach: 'near',
        ...(await point('3056', 'Brunswick')),
      },
    ],
  ];
  for (const [label, brief] of briefs) {
    console.log(label);
    const { matches, eligibleCount } = matchMakers(brief, candidates, today);
    console.log(`  ${eligibleCount} eligible`);
    for (const m of matches)
      console.log(
        `  - ${m.name}, ${m.suburb} · score ${m.score} · ${m.distanceKm} km · ${m.reasons.join(' · ')}` +
          (m.warning ? `\n    ⚠ ${m.warning}` : ''),
      );
    if (eligibleCount === 0)
      for (const o of widenOptions(brief, candidates, today))
        console.log(`  widen: ${o.label} → ${o.count} maker${o.count === 1 ? '' : 's'}`);
    console.log('');
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
