import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { frontMatter, markdownToHtml } from '@/lib/markdown';

import { GUIDES } from './guide-list';

export { GUIDES };

export async function getGuide(slug: string) {
  const guide = GUIDES.find((g) => g.slug === slug);
  if (!guide) return null;
  const src = await readFile(
    path.join(process.cwd(), 'content/studio-help', `${slug}.mdx`),
    'utf8',
  );
  const { data, body } = frontMatter(src);
  return { ...guide, summary: data.summary ?? '', html: markdownToHtml(body) };
}
