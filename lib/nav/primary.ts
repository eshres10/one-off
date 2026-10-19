/** Top-level navigation, shared by the header (server) and its client parts. */
export const PRIMARY_NAV = [
  { key: 'new', href: '/discover?sort=new', label: 'New in' },
  { key: 'occasions', href: '/discover?cat=occasion', label: 'Occasions' },
  { key: 'makers', href: '/makers', label: 'Makers' },
  { key: 'discover', href: '/discover', label: 'Discover' },
  { key: 'popups', href: '/pop-ups', label: 'Pop-ups' },
] as const;

export type NavKey = (typeof PRIMARY_NAV)[number]['key'];

/** Which top-level item the current URL belongs to. */
export function currentNavKey(
  pathname: string,
  sort: string | null,
  cat: string | null,
): NavKey | null {
  if (pathname.startsWith('/makers')) return 'makers';
  if (pathname.startsWith('/pop-ups')) return 'popups';
  if (pathname.startsWith('/discover')) {
    if (sort === 'new') return 'new';
    if (cat === 'occasion') return 'occasions';
    return 'discover';
  }
  return null;
}

export const navLinkClass = (active: boolean) =>
  `text-[11px] uppercase tracking-label underline-offset-[6px] hover:underline ${active ? 'underline decoration-1' : ''}`;
