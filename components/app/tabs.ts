/**
 * The buyer tab bar on phones: which tab a URL belongs to, and which screens are "pushed"
 * (full screen, no tab bar). Shared by the bar, the top bar and the tests.
 */
export type TabKey = 'home' | 'explore' | 'discover' | 'inbox' | 'bag';

export const TAB_ROOT: Record<TabKey, string> = {
  home: '/',
  explore: '/explore',
  discover: '/discover',
  inbox: '/inbox',
  bag: '/bag',
};

/** The tab a path clearly belongs to, or null when it could be reached from any tab. */
export function tabFor(pathname: string): TabKey | null {
  if (pathname === '/' || pathname.startsWith('/you') || pathname.startsWith('/account'))
    return 'home';
  if (pathname.startsWith('/explore') || pathname.startsWith('/search')) return 'explore';
  if (pathname.startsWith('/discover')) return 'discover';
  if (pathname.startsWith('/inbox') || pathname.startsWith('/messages')) return 'inbox';
  if (pathname.startsWith('/bag')) return 'bag';
  return null;
}

/** Pushed screens: product, chat, search results, checkout, order detail. */
export function isPushedScreen(pathname: string, search: string): boolean {
  if (/^\/products\/[^/]+/.test(pathname)) return true;
  if (
    /^\/(messages|account\/messages|studio\/messages|studio\/inbox\/messages)\/[^/]+/.test(pathname)
  )
    return true;
  if (pathname.startsWith('/checkout')) return true;
  if (/^\/(account\/orders|orders)\/[^/]+/.test(pathname)) return true;
  if (/^\/studio\/(orders|inbox\/requests)\/[^/]+/.test(pathname)) return true;
  if ((pathname === '/explore' || pathname === '/search') && /[?&](q|filter|cat)=/.test(search))
    return true;
  return false;
}
