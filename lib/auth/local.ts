import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';

const key = () => new TextEncoder().encode(env().SESSION_SECRET);

export const SESSION_COOKIE = 'oo_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ purpose: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key());
}

export async function signMagicToken(userId: string): Promise<string> {
  return new SignJWT({ purpose: 'magic' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key());
}

export async function verifyToken(
  token: string,
  purpose: 'session' | 'magic',
): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] });
    if (payload.purpose !== purpose || typeof payload.sub !== 'string') return null;
    return payload.sub;
  } catch {
    return null;
  }
}

let dummyHash: string | undefined;

export async function verifyPassword(email: string, password: string): Promise<string | null> {
  const [row] = await sql()<{ id: string; encryptedPassword: string | null }[]>`
    select id, encrypted_password from auth.users where lower(email) = lower(${email})`;
  // Compare against a dummy hash when the user doesn't exist to keep timing uniform.
  dummyHash ??= bcrypt.hashSync('timing-equaliser', 10);
  const hash = row?.encryptedPassword ?? dummyHash;
  const ok = await bcrypt.compare(password, hash);
  return ok && row ? row.id : null;
}

export async function createLocalAuthUser(email: string, password: string): Promise<string> {
  const hash = await bcrypt.hash(password, 10);
  const [row] = await sql()<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, email_confirmed_at) values (${email}, ${hash}, now())
    returning id`;
  return row!.id;
}

export async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const [row] = await sql()<
    { id: string }[]
  >`select id from auth.users where lower(email) = lower(${email})`;
  return row?.id ?? null;
}
