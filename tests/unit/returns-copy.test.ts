import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RETURNS } from '@/lib/content/returns';
import { getReturnPolicy } from '@/lib/returns/policy';

// Australian Consumer Law guarantees can't be excluded, so these phrases must never appear in
// anything a shopper or maker could read: UI copy, emails, alt text, metadata or seed content.
const BANNED = [
  /\bno refunds?\b/i,
  /\bno returns\b/i,
  /\bfaulty items only\b/i,
  /\ball sales (are )?final\b/i,
  /\bfinal sale\b/i,
];

const ROOT = path.resolve(__dirname, '../..');
const SCAN = ['app', 'components', 'lib', 'scripts', 'public/brand'];
const EXT = /\.(tsx?|mjs|js|json|md|svg|html)$/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return EXT.test(name) ? [full] : [];
  });
}

describe('returns copy', () => {
  it('never uses phrases that suggest consumer guarantees are excluded', () => {
    const hits: string[] = [];
    for (const dir of SCAN) {
      for (const file of files(path.join(ROOT, dir))) {
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          for (const re of BANNED) {
            if (re.test(line)) hits.push(`${path.relative(ROOT, file)}:${i + 1} ${re}`);
          }
        });
      }
    }
    expect(hits).toEqual([]);
  });

  it('never says "no change-of-mind returns" without naming the piece types it covers', () => {
    // Ready-to-ship pieces can be returned, so a bare "no change-of-mind returns" is wrong.
    const QUALIFIER = /made[- ]to[- ]order|one[- ]of[- ]ones?|custom|NOUN\[/i;
    const hits: string[] = [];
    for (const dir of SCAN) {
      for (const file of files(path.join(ROOT, dir))) {
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (/no change[- ]of[- ]mind returns/i.test(line) && !QUALIFIER.test(line))
              hits.push(`${path.relative(ROOT, file)}:${i + 1}`);
          });
      }
    }
    expect(hits).toEqual([]);
  });

  it('every type has its own line, and ready to ship can come back', () => {
    expect(getReturnPolicy('ready_to_ship').changeOfMind).toBe(true);
    expect(getReturnPolicy('ready_to_ship').summary).toBe(
      'Return within 14 days of delivery if unworn, with tags.',
    );
    expect(getReturnPolicy('made_to_order').summary).toBe(
      'No change-of-mind returns on made-to-order pieces.',
    );
    expect(getReturnPolicy('one_of_one').summary).toBe('No change-of-mind returns on one-of-ones.');
    expect(getReturnPolicy('custom').summary).toBe('No change-of-mind returns on custom pieces.');
    expect(RETURNS.shortCustom.toLowerCase()).toContain('no change-of-mind returns on custom');
  });

  it('catches the banned phrases', () => {
    expect(BANNED.some((re) => re.test('All sales final'))).toBe(true);
    expect(BANNED.some((re) => re.test('No returns.'))).toBe(true);
    expect(BANNED.some((re) => re.test('No change-of-mind returns.'))).toBe(false);
  });
});
