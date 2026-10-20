import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOGOS } from '@/components/ui/Wordmark';
import { BRAND } from '@/lib/brand';

const ROOTS = ['app', 'components', 'content', 'lib', 'public/sw.js'];
const OLD = [
  /One Off/,
  /ONE OFF/,
  // The old domains (shoponeoff.com.au only appears in next.config.mjs, to redirect it).
  /oneoff\.com\.au/,
  // An old Instagram handle (local test logins like admin@oneoff.test are fine).
  /@oneoff\b(?!\.test)/,
  /#OneOff/,
];

function files(p: string): string[] {
  const full = path.join(process.cwd(), p);
  if (statSync(full).isFile()) return [p];
  return readdirSync(full).flatMap((f) => files(path.join(p, f)));
}

describe('rename to Off One', () => {
  it('leaves no old brand name in the app, content or emails (test 1)', () => {
    const hits: string[] = [];
    for (const f of ROOTS.flatMap(files).filter((f) => /\.(tsx?|mdx?|js|json|css|html)$/.test(f))) {
      readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (OLD.some((re) => re.test(line))) hits.push(`${f}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(hits).toEqual([]);
  });

  it('keeps the product-type words', () => {
    const copy = readFileSync('lib/studio/pieces.ts', 'utf8');
    expect(copy).toMatch(/One of one/);
  });

  it('has the new name, wordmark text and Instagram handle', () => {
    expect(BRAND.name).toBe('Off One');
    expect(BRAND.wordmark).toBe('OFF ONE');
    expect(BRAND.instagram).toBe('offone___');
  });

  it('draws OFF before ONE: the left word is the narrower one', () => {
    const subpaths = LOGOS.horizontal.d.split(/(?= M )/);
    const xs = (p: string) =>
      (p.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0);
    const words = [[], []] as number[][];
    for (const p of subpaths) words[Math.min(...xs(p)) < 1000 ? 0 : 1]!.push(...xs(p));
    const width = (w: number[]) => Math.max(...w) - Math.min(...w);
    // "OFF" is narrower than "ONE" in this lettering.
    expect(width(words[0]!)).toBeLessThan(width(words[1]!));
  });
});
