'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { magicLinksEnabled } from '@/lib/features';
import { audit } from '@/lib/audit';
import {
  createLocalAuthUser,
  findAuthUserIdByEmail,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signMagicToken,
  signSession,
  verifyPassword,
} from '@/lib/auth/local';
import { claimGuestOrders, ensureAppUser } from '@/lib/auth/users';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { rateLimit } from '@/lib/rate-limit';
import {
  fieldErrors,
  loginSchema,
  magicLinkSchema,
  signupSchema,
  type FormState,
} from '@/lib/validation';
import { clientIp, toFormState } from './util';

function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === 'string' ? next : '';
  return n.startsWith('/') && !n.startsWith('//') ? n : '/account';
}

export async function setLocalSession(userId: string) {
  cookies().set(SESSION_COOKIE, await signSession(userId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().APP_URL.startsWith('https://'),
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
}

export async function loginAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { email, password } = parsed.data;
  try {
    await rateLimit('auth', `${clientIp()}:${email}`);
    if (env().AUTH_DRIVER === 'supabase') {
      const { supabaseServer } = await import('@/lib/auth/supabase');
      const { data, error } = await supabaseServer().auth.signInWithPassword({ email, password });
      if (error || !data.user)
        return { ok: false, message: 'That email and password don’t match.' };
      await ensureAppUser(data.user.id, email);
      await claimGuestOrders(data.user.id, email);
    } else {
      const userId = await verifyPassword(email, password);
      if (!userId) return { ok: false, message: 'That email and password don’t match.' };
      await ensureAppUser(userId, email);
      await setLocalSession(userId);
      // Local passwords don't prove email ownership; guest orders are claimed via magic link only.
    }
  } catch (err) {
    return toFormState(err);
  }
  redirect(safeNext(form.get('next')));
}

export async function signupAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { email, password, name } = parsed.data;
  try {
    await rateLimit('auth', `${clientIp()}:${email}`);
    if (env().AUTH_DRIVER === 'supabase') {
      const { supabaseServer } = await import('@/lib/auth/supabase');
      const { data, error } = await supabaseServer().auth.signUp({
        email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${env().APP_URL}/auth/callback?next=/account`,
        },
      });
      if (error) return { ok: false, message: error.message };
      if (data.user) await ensureAppUser(data.user.id, email, name);
      if (!data.session) return { ok: true, message: 'Check your email to confirm your account.' };
    } else {
      if (await findAuthUserIdByEmail(email))
        return {
          ok: false,
          errors: { email: 'An account with this email already exists. Sign in instead.' },
        };
      const userId = await createLocalAuthUser(email, password);
      await ensureAppUser(userId, email, name);
      await setLocalSession(userId);
      await audit('auth.signup', { type: 'user', id: userId }, {}, userId);
    }
  } catch (err) {
    return toFormState(err);
  }
  redirect(safeNext(form.get('next')));
}

export async function magicLinkAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = magicLinkSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const { email } = parsed.data;
  const next = safeNext(form.get('next'));
  if (!magicLinksEnabled())
    return { ok: false, message: 'Email sign-in links aren’t available yet. Use your password.' };
  try {
    await rateLimit('auth', `${clientIp()}:magic:${email}`);
    if (env().AUTH_DRIVER === 'supabase') {
      const { supabaseServer } = await import('@/lib/auth/supabase');
      const { error } = await supabaseServer().auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${env().APP_URL}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) return { ok: false, message: error.message };
    } else {
      // Create the account on first magic-link sign in (buyers only).
      const userId =
        (await findAuthUserIdByEmail(email)) ??
        (await createLocalAuthUser(email, crypto.randomUUID()));
      await ensureAppUser(userId, email);
      const token = await signMagicToken(userId);
      await sendEmail(
        emails.magicLink(
          email,
          `${env().APP_URL}/auth/magic?token=${token}&next=${encodeURIComponent(next)}`,
        ),
      );
    }
  } catch (err) {
    return toFormState(err);
  }
  // Same response whether or not the account existed.
  return {
    ok: true,
    message: `We’ve emailed a sign-in link to ${email}. It expires in 15 minutes.`,
  };
}

export async function logoutAction() {
  if (env().AUTH_DRIVER === 'supabase') {
    const { supabaseServer } = await import('@/lib/auth/supabase');
    await supabaseServer().auth.signOut();
  }
  cookies().delete(SESSION_COOKIE);
  redirect('/');
}
