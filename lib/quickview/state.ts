/**
 * Client-side quick view state: the product list the modal was opened from (for prev/next) and
 * the card that opened it (focus goes back there on close).
 */
const LIST_KEY = 'oneoff:qv-list';
let opener: { el: HTMLElement; slug: string; at: number } | null = null;

export function setOpener(el: HTMLElement, slug: string) {
  opener = { el, slug, at: Date.now() };
}

/** The card that opened the quick view for `slug` just now, if a click on one did. */
export function openerFor(slug: string): HTMLElement | null {
  return opener && opener.slug === slug && Date.now() - opener.at < 30_000 ? opener.el : null;
}

export function lastOpener(): HTMLElement | null {
  return opener?.el ?? null;
}

export function productSlug(a: HTMLAnchorElement): string | null {
  if (a.origin !== window.location.origin || a.target === '_blank' || a.hasAttribute('download'))
    return null;
  const m = /^\/products\/([^/?#]+)$/.exec(a.pathname);
  return m ? decodeURIComponent(m[1]!) : null;
}

/** Visible product links around `a`, in reading order (top to bottom, then left to right). */
export function rememberList(a: HTMLAnchorElement) {
  const scope =
    a.closest('[data-qv-list]') ?? a.closest('section') ?? document.getElementById('main');
  if (!scope) return;
  const seen = new Set<string>();
  const links = Array.from(scope.querySelectorAll<HTMLAnchorElement>('a[href^="/products/"]'))
    .filter((l) => l.offsetParent !== null)
    .map((l) => ({ slug: productSlug(l), r: l.getBoundingClientRect() }))
    .filter((l): l is { slug: string; r: DOMRect } => Boolean(l.slug))
    .sort((x, y) => (Math.abs(x.r.top - y.r.top) > 8 ? x.r.top - y.r.top : x.r.left - y.r.left));
  const slugs = links.map((l) => l.slug).filter((s) => !seen.has(s) && Boolean(seen.add(s)));
  try {
    sessionStorage.setItem(LIST_KEY, JSON.stringify(slugs));
  } catch {
    // No storage: the modal just won't offer prev/next.
  }
}

export function readList(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(LIST_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
