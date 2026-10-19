'use client';

import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';
import { Sheet } from './Sheet';

/** A Sheet whose open state lives in the URL: closing navigates to `closeHref`. */
export function RouteSheet({
  closeHref,
  ...props
}: Omit<ComponentProps<typeof Sheet>, 'onClose'> & { closeHref: string }) {
  const router = useRouter();
  return <Sheet {...props} onClose={() => router.push(closeHref, { scroll: false })} />;
}
