import { cookies, headers } from 'next/headers';
import { reportError } from '@/lib/log';
import { isUserFacing, pgMessage } from '@/lib/services/errors';
import { newCartSessionId } from '@/lib/services/cart';
import type { FormState } from '@/lib/validation';

export const CART_COOKIE = 'oo_cart';

export function getCartSessionId(): string | undefined {
  const v = cookies().get(CART_COOKIE)?.value;
  return v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined;
}

/** Only callable from server actions / route handlers (sets a cookie). */
export function ensureCartSessionId(): string {
  const existing = getCartSessionId();
  if (existing) return existing;
  const id = newCartSessionId();
  cookies().set(CART_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !process.env.APP_URL?.startsWith('http://'),
    path: '/',
    maxAge: 60 * 60 * 24 * 60,
  });
  return id;
}

export function clientIp(): string {
  const h = headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'local').trim();
}

/** Converts thrown errors into a form state with a safe, helpful message. */
export function toFormState(err: unknown): FormState {
  if (isUserFacing(err)) return { ok: false, message: err.message };
  const pg = pgMessage(err);
  if (pg) return { ok: false, message: pg };
  // next/navigation redirect() throws; let it propagate.
  if (
    err &&
    typeof err === 'object' &&
    'digest' in err &&
    String((err as { digest: unknown }).digest).startsWith('NEXT_')
  )
    throw err;
  reportError(err, { where: 'server action' });
  return { ok: false, message: 'Something went wrong. Please try again.' };
}
