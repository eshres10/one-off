'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { restoreAction } from '@/lib/actions/install';
import { readLocalSaves, writeLocalSaves } from '@/lib/local-saves';

/**
 * Opened from "Copy link instead" in an in-app browser: ?restore=<token> brings a guest's bag and
 * saved pieces across, once, then the token is taken out of the address.
 */
export function RestoreFromLink() {
  const params = useSearchParams();
  const path = usePathname() ?? '/';
  const router = useRouter();
  const token = params?.get('restore');
  const done = useRef(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!token || done.current) return;
    done.current = true;
    void restoreAction(token).then((res) => {
      if (res.ok) {
        writeLocalSaves([...new Set([...readLocalSaves(), ...res.savedProductIds])]);
        setMessage('Your bag and saved pieces are here.');
      }
      const next = new URLSearchParams(params!.toString());
      next.delete('restore');
      router.replace(next.size ? `${path}?${next}` : path);
      router.refresh();
    });
  }, [token, params, path, router]);
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 4000);
    return () => window.clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <p
      role="status"
      className="glass-dark fixed inset-x-3 bottom-[calc(var(--tabbar-h)+12px)] z-50 px-4 py-3 text-[13px] text-ground md:inset-x-auto md:left-1/2 md:w-[420px] md:-translate-x-1/2"
      data-testid="restored"
    >
      {message}
    </p>
  );
}
