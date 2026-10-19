'use server';

import { cookies } from 'next/headers';
import { getSessionUser } from '@/lib/auth/session';
import { rateLimit } from '@/lib/rate-limit';
import { createRestoreToken, redeemRestoreToken } from '@/lib/services/restore';
import { CART_COOKIE, clientIp, getCartSessionId } from './util';

/**
 * "Copy link instead" in an in-app browser: the current page with ?source=inapp. Signed in, the
 * bag and saved pieces already live on the account; a guest's link also carries a one-time
 * ?restore= token so they come along.
 */
export async function inAppLinkAction(input: {
  href: string;
  savedProductIds: string[];
}): Promise<{ ok: true; url: string } | { ok: false }> {
  try {
    const url = new URL(input.href);
    url.searchParams.delete('restore');
    url.searchParams.set('source', 'inapp');
    const user = await getSessionUser();
    if (!user) {
      await rateLimit('restoreLink', clientIp());
      const token = await createRestoreToken({
        cartSessionId: getCartSessionId() ?? null,
        savedProductIds: input.savedProductIds,
      });
      url.searchParams.set('restore', token);
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false };
  }
}

/** Opens a restore link: the guest bag comes back (its cookie), and the saved pieces are returned. */
export async function restoreAction(
  token: string,
): Promise<{ ok: true; savedProductIds: string[] } | { ok: false }> {
  const row = await redeemRestoreToken(token);
  if (!row) return { ok: false };
  if (row.cartSessionId)
    cookies().set(CART_COOKIE, row.cartSessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production' && !process.env.APP_URL?.startsWith('http://'),
      path: '/',
      maxAge: 60 * 60 * 24 * 60,
    });
  return { ok: true, savedProductIds: row.savedProductIds };
}
