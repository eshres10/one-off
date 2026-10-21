import { cookies } from 'next/headers';
import { MODE_COOKIE, type AppMode } from './mode-shared';

export { MODE_COOKIE, type AppMode };

/** Which side of the app a maker last used on their phone (server only). */
export function getMode(): AppMode {
  return cookies().get(MODE_COOKIE)?.value === 'studio' ? 'studio' : 'shop';
}
