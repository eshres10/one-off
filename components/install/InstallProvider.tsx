'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { inAppLinkAction } from '@/lib/actions/install';
import { track } from '@/lib/client/track';
import { detectHere, iosShareAt, inAppName, type InstallSituation } from '@/lib/install/detect';
import {
  EMPTY_SESSION,
  EMPTY_STATE,
  KEY,
  SESSION_KEY,
  blockReason,
  dismissed,
  isSecondVisit,
  makeStore,
  type InstallTrigger,
} from '@/lib/install/rules';
import { readLocalSaves } from '@/lib/local-saves';
import { InstallSheet } from './InstallSheet';

interface PromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const OVERLAY = '[role="dialog"][aria-modal="true"]';

/**
 * "Add to home screen": catches Android's install prompt as early as possible, keeps count of
 * visits and product views, and shows the sheet on the first trigger the rules allow
 * (lib/install/rules.ts). Other components ask for it with requestInstallSheet().
 */
export function InstallProvider() {
  const path = usePathname() ?? '/';
  const prompt = useRef<PromptEvent | null>(null);
  const stores = useRef<{
    state: ReturnType<typeof makeStore<typeof EMPTY_STATE>>;
    session: ReturnType<typeof makeStore<typeof EMPTY_SESSION>>;
  } | null>(null);
  const [open, setOpen] = useState<{
    variant: 'android' | 'ios' | 'in-app';
    trigger: InstallTrigger;
  } | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;

  const getStores = () => {
    stores.current ??= {
      state: makeStore('local', KEY, EMPTY_STATE),
      session: makeStore('session', SESSION_KEY, EMPTY_SESSION),
    };
    return stores.current;
  };

  const situation = (): InstallSituation => detectHere(Boolean(prompt.current));

  const fire = useCallback((trigger: InstallTrigger, attempt = 0) => {
    const s = getStores();
    const where = situation();
    const input = {
      situation: where,
      path: pathRef.current,
      trigger,
      state: s.state.read(),
      session: s.session.read(),
      now: Date.now(),
      overlayOpen: Boolean(document.querySelector(OVERLAY)),
    };
    const reason = blockReason(input);
    // Another sheet or drawer is up: try again shortly, for up to half a minute.
    if (reason === 'overlay open' && attempt < 30) {
      window.setTimeout(() => fire(trigger, attempt + 1), 1000);
      return;
    }
    if (reason) return;
    s.session.write({ ...input.session, shown: true });
    const variant = where as 'android' | 'ios' | 'in-app';
    setOpen({ variant, trigger });
    track('install_sheet_shown', { variant, trigger });
  }, []);

  // Capture the install prompt and installs; count this visit.
  useEffect(() => {
    const s = getStores();
    // The inline script in app/layout.tsx catches the prompt, however early it fires.
    const w = window as Window & { __ooInstallPrompt?: PromptEvent };
    const onPrompt = () => {
      if (w.__ooInstallPrompt) prompt.current = w.__ooInstallPrompt;
    };
    onPrompt();
    const onInstalled = () => {
      s.state.write({ ...s.state.read(), installedAt: Date.now() });
      setOpen(null);
    };
    window.addEventListener('oo:installprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (situation() === 'installed' && !s.state.read().installedAt) onInstalled();

    const now = Date.now();
    const state = s.state.read();
    const session = s.session.read();
    if (session.pageViews === 0) {
      const second = isSecondVisit(state, now);
      s.state.write({ ...state, visits: state.visits + 1, lastSeenAt: now });
      if (second) window.setTimeout(() => fire('second_visit'), 3000);
    }
    const seen = () => s.state.write({ ...s.state.read(), lastSeenAt: Date.now() });
    const onHide = () => document.visibilityState === 'hidden' && seen();
    document.addEventListener('visibilitychange', onHide);
    const onRequest = (e: Event) =>
      fire((e as CustomEvent<{ trigger: InstallTrigger }>).detail.trigger);
    window.addEventListener('oo:install', onRequest);
    return () => {
      window.removeEventListener('oo:installprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('oo:install', onRequest);
    };
  }, [fire]);

  // Page views this session, and the third product page.
  useEffect(() => {
    const s = getStores();
    const session = s.session.read();
    const product = path.startsWith('/products/');
    const next = {
      ...session,
      pageViews: session.pageViews + 1,
      productViews: session.productViews + (product ? 1 : 0),
    };
    s.session.write(next);
    s.state.write({ ...s.state.read(), lastSeenAt: Date.now() });
    if (product && next.productViews === 3)
      window.setTimeout(() => fire('third_product_view'), 1200);
  }, [path, fire]);

  if (!open) return null;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const props = { variant: open.variant, trigger: open.trigger };
  const close = () => setOpen(null);
  return (
    <InstallSheet
      variant={open.variant}
      orderPlaced={open.trigger === 'order_placed'}
      appName={inAppName(ua)}
      shareAt={iosShareAt(ua)}
      onDismiss={() => {
        const s = getStores();
        s.state.write(dismissed(s.state.read(), Date.now()));
        track('install_sheet_dismissed', props);
        close();
      }}
      onClose={close}
      onInstall={async () => {
        const p = prompt.current;
        if (!p) return false;
        await p.prompt();
        const choice = await p.userChoice;
        prompt.current = null;
        (window as Window & { __ooInstallPrompt?: PromptEvent }).__ooInstallPrompt = undefined;
        if (choice.outcome !== 'accepted') return false;
        const s = getStores();
        s.state.write({ ...s.state.read(), installedAt: Date.now() });
        track('install_accepted', props);
        return true;
      }}
      onCopyLink={async () => {
        const res = await inAppLinkAction({
          href: window.location.href,
          savedProductIds: readLocalSaves(),
        });
        if (!res.ok) return false;
        try {
          await navigator.clipboard.writeText(res.url);
        } catch {
          // Clipboard blocked: fall back to a prompt the person can copy from.
          window.prompt('Copy this link', res.url);
        }
        track('install_copied_link', props);
        return true;
      }}
    />
  );
}
