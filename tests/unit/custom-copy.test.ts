import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The old custom flow took a deposit and quoted "15%" in the quote composer. Have it made holds the
// whole payment and pays the maker in two parts, so neither word belongs in anything a buyer or
// maker reads.
const ROOT = path.resolve(__dirname, '../..');
const SCAN = [
  'app/(shop)',
  'app/(seller)',
  'app/(flow)',
  'components',
  'content',
  'lib/email',
  'lib/help-content.ts',
  'lib/custom',
];
const EXT = /\.(tsx?|mdx?)$/;
const SKIP = [
  // Contact-detail moderation names "bank deposit" so it can block it.
  'lib/domain/moderation.ts',
];

function files(p: string): string[] {
  if (!statSync(p).isDirectory()) return EXT.test(p) ? [p] : [];
  return readdirSync(p).flatMap((name) => files(path.join(p, name)));
}

describe('Have it made copy', () => {
  it('never mentions a deposit or 15% in buyer- or maker-facing files', () => {
    const hits: string[] = [];
    for (const dir of SCAN) {
      for (const file of files(path.join(ROOT, dir))) {
        const rel = path.relative(ROOT, file);
        if (SKIP.includes(rel)) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/\bdeposit/i.test(line) || /\b15\s?%/.test(line)) hits.push(`${rel}:${i + 1}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });

  it('the old request form routes redirect to the brief', () => {
    for (const rel of [
      'app/(shop)/custom/page.tsx',
      'app/(shop)/makers/[slug]/commission/page.tsx',
    ]) {
      const src = readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).toContain('redirect(');
      expect(src).toContain('/have-it-made');
      expect(src).not.toContain('CommissionForm');
    }
  });

  it('the quote composer is gone from messages', () => {
    const src = readFileSync(path.join(ROOT, 'components/messaging/Conversation.tsx'), 'utf8');
    expect(src).not.toContain('QuotePanel');
    expect(src).not.toContain('Send quote');
  });
});
