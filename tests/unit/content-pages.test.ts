import { execSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACKNOWLEDGEMENT } from '@/content/pages/site';
import { FAQ } from '@/content/faq';
import { SIZE_GUIDE, toInches } from '@/content/pages/size-guide';
import { LEGAL_DOCS, PLACEHOLDER, getLegalDoc, parseLegal } from '@/lib/legal';

const ROOT = path.resolve(__dirname, '../..');

describe('Acknowledgement of Country', () => {
  it('uses the Australia-wide wording', () => {
    expect(ACKNOWLEDGEMENT).toBe(
      'Off One acknowledges the Traditional Custodians of the lands across Australia on which our makers live and work, and pays respect to Elders past and present.',
    );
  });

  it('no longer names a single nation anywhere in the repo', () => {
    // git grep covers every tracked file (code, emails, content, seed, tests' fixtures).
    const out = execSync(
      // The postcode data names the WA town of Kulin, which isn't the nation.
      `git grep -n -i -E "wurundjeri|kulin" -- . ':!tests/unit/content-pages.test.ts' ':!supabase/seed/postcodes.sql' ':!public/data/postcodes.json' || true`,
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(out.trim()).toBe('');
  });
});

describe('size guide', () => {
  it('converts cm to inches to one decimal', () => {
    expect(toInches(87)).toBe(34.3);
    expect(toInches(78)).toBe(30.7);
  });
  it('has a value for every size in every row', () => {
    for (const r of SIZE_GUIDE.rows) expect(r.cm).toHaveLength(SIZE_GUIDE.sizes.length);
  });
});

describe('FAQ', () => {
  it('has unique anchor ids, an Afterpay answer and a made-to-order anchor', () => {
    const items = FAQ.flatMap((c) => c.items);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    expect(items.some((i) => /afterpay/i.test(i.a))).toBe(true);
    expect(items.map((i) => i.id)).toContain('made-to-order');
  });
  it('matches the built policies', () => {
    const text = FAQ.flatMap((c) => c.items.map((i) => i.a)).join(' ');
    expect(text).toMatch(/within 14 days of delivery/);
    expect(text).toMatch(/paid 3 days after delivery/);
    expect(text).toMatch(/within 2 business days/);
  });
});

describe('legal documents', () => {
  it('every document parses, with a title, sections and an In short list', async () => {
    for (const d of LEGAL_DOCS) {
      const doc = await getLegalDoc(d.slug);
      expect(doc.title).toBe(d.label);
      expect(doc.sections.length).toBeGreaterThan(2);
      expect(doc.summary.length).toBeGreaterThan(0);
      expect(doc.draft).toBe(true);
    }
  });

  it('returns has the design’s sections, section 5 is Change-of-mind returns', async () => {
    const doc = await getLegalDoc('returns');
    expect(doc.sections.map((s) => s.heading)).toEqual([
      'What this covers',
      'Buying on Off One',
      'Made-to-order pieces',
      'Faulty or not as described',
      'Change-of-mind returns',
      'Contact',
    ]);
    expect(doc.summary[0]).toMatch(/^Ready-to-ship pieces: return within 14 days/);
  });

  it('parses front matter, the covers line and placeholders', () => {
    const doc = parseLegal(
      'cookies',
      '---\ntitle: Cookies\nupdated: 2026-11-01\nversion: 2.0\ndraft: false\nsummary:\n  - One\n  - Two\n---\n\n## First part\n\n> What it covers.\n\n[Lawyer to draft]\n\n## Second part\n\nBody text\nover two lines.\n',
    );
    expect(doc).toMatchObject({
      title: 'Cookies',
      version: '2.0',
      draft: false,
      summary: ['One', 'Two'],
    });
    expect(doc.sections[0]).toMatchObject({
      id: 'first-part',
      covers: 'What it covers.',
      paragraphs: [PLACEHOLDER],
    });
    expect(doc.sections[1]!.paragraphs).toEqual(['Body text over two lines.']);
  });
});
