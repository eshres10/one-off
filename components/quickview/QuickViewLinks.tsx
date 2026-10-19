'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { productSlug, rememberList, setOpener } from '@/lib/quickview/state';

const DESKTOP = '(min-width: 1024px)';

/**
 * Product links open the quick view on desktop (Next intercepts /products/[slug] into the modal
 * slot). Below 1024px they go straight to the product page. Hovering a product link on desktop
 * prefetches its data so the modal opens with content.
 */
export function QuickViewLinks() {
  const router = useRouter();
  useEffect(() => {
    const prefetched = new Set<string>();
    const link = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.('a');
      return a instanceof HTMLAnchorElement && productSlug(a) ? a : null;
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const a = link(e);
      const slug = a && productSlug(a);
      if (!a || !slug || a.closest('[data-quickview-dialog]')) return;
      if (!window.matchMedia(DESKTOP).matches) {
        // Skip the client router so the modal route is never intercepted on phones.
        e.preventDefault();
        e.stopPropagation();
        window.location.assign(a.href);
        return;
      }
      rememberList(a);
      setOpener(a, slug);
    };
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !window.matchMedia(DESKTOP).matches) return;
      const a = link(e);
      if (!a || prefetched.has(a.pathname)) return;
      prefetched.add(a.pathname);
      // 'full' fetches the page data, not just the loading shell.
      router.prefetch(a.pathname, { kind: 'full' } as unknown as Parameters<
        typeof router.prefetch
      >[1]);
    };
    window.addEventListener('click', onClick, true);
    document.addEventListener('pointerover', onOver);
    return () => {
      window.removeEventListener('click', onClick, true);
      document.removeEventListener('pointerover', onOver);
    };
  }, [router]);
  return null;
}
