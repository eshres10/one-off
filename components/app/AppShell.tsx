import { Suspense, type ReactNode } from 'react';
import { getSessionUser } from '@/lib/auth/session';
import { getCartSessionId } from '@/lib/actions/util';
import { checkoutEnabled } from '@/lib/features';
import { cartCount } from '@/lib/services/cart';
import { unreadCount } from '@/lib/services/messaging';
import { LocalSavesMerger } from '@/components/product/LocalSavesMerger';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { TabBar } from '@/components/layout/TabBar';
import { messagesHref } from '@/components/layout/SiteHeader';
import { NavTransitions } from './NavTransitions';
import { PhoneTopBar } from './PhoneTopBar';
import { PhoneTabBar } from './TabBar';
import { ToastHost } from './Toast';

/**
 * Wraps every shop page. Below md it is the phone app: the phone top bar for the screen, the
 * five-tab bar and slide transitions, with the desktop header, footer and strip hidden (CSS
 * only). At md and up it renders today's layout untouched.
 */
export async function AppShell({ children, modal }: { children: ReactNode; modal?: ReactNode }) {
  const user = await getSessionUser();
  const [bag, unread] = await Promise.all([
    checkoutEnabled().then((on) => (on ? cartCount(getCartSessionId()) : 0)),
    user ? unreadCount(user).catch(() => 0) : Promise.resolve(0),
  ]);
  const barUser = user
    ? { initial: (user.displayName ?? user.email).trim().slice(0, 1) || '·', avatarUrl: null }
    : null;
  return (
    <div data-app-shell>
      <div className="max-md:hidden">
        <SiteHeader />
      </div>
      <Suspense fallback={null}>
        <PhoneTopBar user={barUser} unread={unread} />
      </Suspense>
      <main id="main" className="pt-[var(--header-h)]">
        {children}
      </main>
      <div className="max-md:hidden">
        <SiteFooter />
      </div>
      {user && <LocalSavesMerger />}
      {/* Tablets keep today's bar; phones get the app's. */}
      <TabBar counts={{ bag, messages: unread }} messagesHref={messagesHref(user?.role)} />
      <Suspense fallback={null}>
        <PhoneTabBar counts={{ inbox: unread, bag }} />
        <NavTransitions />
      </Suspense>
      <ToastHost />
      {modal}
    </div>
  );
}
