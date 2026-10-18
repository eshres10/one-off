import postgres from 'postgres';
import { env } from '@/lib/env';

export type Db = postgres.Sql;
export type Role = 'buyer' | 'seller' | 'admin';

declare global {
  // eslint-disable-next-line no-var
  var __marketplaceSql: postgres.Sql | undefined;
}

function create(): postgres.Sql {
  const e = env();
  return postgres(e.DATABASE_URL, {
    max: e.DATABASE_POOL_MAX,
    idle_timeout: 20,
    // Column names only: JSON payloads (Stripe metadata, addresses) keep their original keys.
    transform: { column: { from: postgres.toCamel, to: postgres.fromCamel } },
    onnotice: () => {},
    // Supabase's transaction pooler does not support prepared statements.
    prepare: !e.DATABASE_URL.includes('pooler.supabase.com'),
  });
}

/**
 * Privileged connection: bypasses RLS. Use only for public catalogue reads with explicit
 * visibility filters, webhooks, admin tooling (after a role check), seeding and jobs.
 */
export function sql(): postgres.Sql {
  if (!globalThis.__marketplaceSql) globalThis.__marketplaceSql = create();
  return globalThis.__marketplaceSql;
}

export async function withService<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return (await sql().begin((tx) => fn(tx as unknown as Db))) as T;
}

/**
 * Runs `fn` in a transaction as the Supabase `authenticated` role with JWT claims for `userId`,
 * so Row Level Security policies apply exactly as they would through PostgREST.
 */
export async function withUser<T>(
  user: { id: string; role: Role },
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: user.id, role: 'authenticated', app_role: user.role });
  return (await sql().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true)`;
    await tx`set local role authenticated`;
    return fn(tx as unknown as Db);
  })) as T;
}

/** Anonymous visitor scope (RLS as the `anon` role). */
export async function withAnon<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return (await sql().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', '{"role":"anon"}', true)`;
    await tx`set local role anon`;
    return fn(tx as unknown as Db);
  })) as T;
}

export async function closeDb() {
  if (globalThis.__marketplaceSql) {
    await globalThis.__marketplaceSql.end({ timeout: 5 });
    globalThis.__marketplaceSql = undefined;
  }
}
