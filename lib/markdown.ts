const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const inline = (s: string) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(
      /\[([^\]]+)\]\((\/[^)\s]*)\)/g,
      '<a href="$2" class="underline underline-offset-4">$1</a>',
    );

/**
 * The small Markdown our guides use (headings, paragraphs, tips as quotes, bullet and numbered
 * lists, bold, code and internal links), as HTML. Everything is escaped first.
 */
export function markdownToHtml(md: string): string {
  return md
    .split(/\n{2,}/)
    .map((block) => {
      const b = block.trim();
      if (!b) return '';
      const h = /^(#{1,3})\s+(.*)$/.exec(b);
      if (h) {
        const level = Math.min(h[1]!.length + 1, 4);
        return `<h${level} class="font-display text-[28px] leading-tight pt-4">${inline(h[2]!)}</h${level}>`;
      }
      if (b.startsWith('>'))
        return `<blockquote class="bg-stone p-4 text-[14px]">${inline(b.replace(/^>\s?/gm, '').replace(/\n/g, ' '))}</blockquote>`;
      if (/^[-*]\s/.test(b))
        return `<ul class="list-disc space-y-1 pl-5">${b
          .split('\n')
          .map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''))}</li>`)
          .join('')}</ul>`;
      if (/^\d+\.\s/.test(b))
        return `<ol class="list-decimal space-y-1 pl-5">${b
          .split('\n')
          .map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''))}</li>`)
          .join('')}</ol>`;
      return `<p>${inline(b.replace(/\n/g, ' '))}</p>`;
    })
    .join('\n');
}

/** Splits `---\nkey: value\n---` front matter from the body. */
export function frontMatter(src: string): { data: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src);
  if (!m) return { data: {}, body: src };
  const data = Object.fromEntries(
    m[1]!
      .split('\n')
      .map((l) => /^(\w+):\s*(.*)$/.exec(l))
      .filter((x): x is RegExpExecArray => !!x)
      .map((x) => [x[1]!, x[2]!.replace(/^["']|["']$/g, '')]),
  );
  return { data, body: src.slice(m[0].length) };
}
