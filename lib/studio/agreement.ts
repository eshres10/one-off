import { readFile } from 'node:fs/promises';
import path from 'node:path';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

/**
 * The Seller Agreement (content/seller-agreement.md) as HTML. Handles the little Markdown the
 * file uses: headings, paragraphs, quotes and lists. Everything is escaped first.
 */
export async function sellerAgreementHtml(): Promise<string> {
  const md = await readFile(path.join(process.cwd(), 'content/seller-agreement.md'), 'utf8');
  return md
    .split(/\n{2,}/)
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      const h = /^(#{1,3})\s+(.*)$/.exec(b);
      if (h) {
        const level = Math.min(h[1]!.length + 1, 4);
        return `<h${level} class="font-display text-[22px] leading-tight pt-2">${inline(h[2]!)}</h${level}>`;
      }
      if (b.startsWith('>'))
        return `<blockquote class="bg-stone p-3 text-[13px]">${inline(b.replace(/^>\s?/gm, '').replace(/\n/g, ' '))}</blockquote>`;
      if (/^[-*]\s/.test(b))
        return `<ul class="list-disc pl-5">${b
          .split('\n')
          .map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`)
          .join('')}</ul>`;
      return `<p>${inline(b.replace(/\n/g, ' '))}</p>`;
    })
    .join('\n');
}
