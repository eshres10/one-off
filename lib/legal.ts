import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Legal documents live in content/legal/{slug}.mdx: front matter (title, updated, version,
 * draft, summary) and sections, each a `## Heading`, an optional `> what it covers` line and
 * paragraphs. A paragraph that is exactly `[Lawyer to draft]` is shown as a placeholder.
 */
export const LEGAL_DOCS = [
  { slug: 'terms', label: 'Terms of use' },
  { slug: 'privacy', label: 'Privacy policy' },
  { slug: 'returns', label: 'Returns & refunds' },
  { slug: 'shipping', label: 'Shipping' },
  { slug: 'seller-agreement', label: 'Seller agreement' },
  { slug: 'founding-terms', label: 'Founding maker terms' },
  { slug: 'cookies', label: 'Cookies' },
] as const;
export type LegalSlug = (typeof LEGAL_DOCS)[number]['slug'];

export const PLACEHOLDER = '[Lawyer to draft]';

export interface LegalSection {
  id: string;
  number: number;
  heading: string;
  covers: string | null;
  paragraphs: string[];
}

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  updated: string;
  version: string;
  draft: boolean;
  summary: string[];
  sections: LegalSection[];
}

export function isLegalSlug(s: string): s is LegalSlug {
  return LEGAL_DOCS.some((d) => d.slug === s);
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Parses a legal document's front matter and sections. Exported for tests. */
export function parseLegal(slug: LegalSlug, source: string): LegalDoc {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source.replace(/\r\n/g, '\n'));
  if (!m) throw new Error(`content/legal/${slug}.mdx has no front matter`);
  const meta: Record<string, string> = {};
  const summary: string[] = [];
  let inSummary = false;
  for (const line of m[1]!.split('\n')) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (inSummary && item) {
      summary.push(item[1]!.trim());
      continue;
    }
    const kv = /^([a-z]+):\s*(.*)$/i.exec(line);
    if (!kv) continue;
    inSummary = kv[1] === 'summary';
    if (!inSummary) meta[kv[1]!] = kv[2]!.trim().replace(/^['"]|['"]$/g, '');
  }
  const sections: LegalSection[] = [];
  for (const block of m[2]!.split(/^## /m).slice(1)) {
    const [headingLine, ...rest] = block.split('\n');
    const heading = headingLine!.trim();
    const paras = rest
      .join('\n')
      .split(/\n\s*\n/)
      .map((p) => p.trim().replace(/\s*\n\s*/g, ' '))
      .filter(Boolean);
    const covers = paras[0]?.startsWith('> ') ? paras.shift()!.slice(2) : null;
    sections.push({
      id: slugify(heading),
      number: sections.length + 1,
      heading,
      covers,
      paragraphs: paras,
    });
  }
  return {
    slug,
    title: meta.title ?? slug,
    updated: meta.updated ?? '',
    version: meta.version ?? '1.0',
    draft: meta.draft === 'true',
    summary,
    sections,
  };
}

export async function getLegalDoc(slug: LegalSlug): Promise<LegalDoc> {
  const file = path.join(process.cwd(), 'content/legal', `${slug}.mdx`);
  return parseLegal(slug, await readFile(file, 'utf8'));
}

/** "Last updated 20 October 2026 · Version 1.0" (the date as written until it's a real date). */
export function updatedLine(doc: LegalDoc): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(doc.updated)
    ? new Date(`${doc.updated}T00:00:00Z`).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : doc.updated || '(date)';
  return `Last updated ${d} · Version ${doc.version}`;
}
