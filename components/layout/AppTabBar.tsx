import { getSessionUser } from '@/lib/auth/session';
import { getCartSessionId } from '@/lib/actions/util';
import { checkoutEnabled } from '@/lib/features';
import { cartCount } from '@/lib/services/cart';
import { unreadCount } from '@/lib/services/messaging';
import { messagesHref } from './SiteHeader';
import { TabBar } from './TabBar';

/** Server half of the phone tab bar: badge counts for unread threads and bag items. */
export async function AppTabBar() {
  const user = await getSessionUser();
  const [bag, messages] = await Promise.all([
    checkoutEnabled() ? cartCount(getCartSessionId()) : Promise.resolve(0),
    user ? unreadCount(user).catch(() => 0) : Promise.resolve(0),
  ]);
  return <TabBar counts={{ bag, messages }} messagesHref={messagesHref(user?.role)} />;
}
