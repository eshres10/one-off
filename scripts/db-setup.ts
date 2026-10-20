/**
 * Creates the database (local only) and applies migrations in order.
 *   npm run db:migrate          apply migrations (idempotent)
 *   npm run db:reset            drop + recreate the local database, then migrate
 *
 * Against Supabase, prefer `supabase db push`; this script also works there but skips the
 * local auth shim when an `auth.users` table already exists.
 */
import 'dotenv/config';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const root = path.resolve(__dirname, '..');

export async function migrate(databaseUrl: string, opts: { reset?: boolean } = {}) {
  const url = new URL(databaseUrl);
  const dbName = url.pathname.replace(/^\//, '');
  const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);

  if (isLocal) {
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = '/postgres';
    const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
    try {
      if (opts.reset) {
        await admin.unsafe(`drop database if exists "${dbName}" with (force)`);
      }
      const exists = await admin`select 1 from pg_database where datname = ${dbName}`;
      if (exists.length === 0) await admin.unsafe(`create database "${dbName}"`);
    } finally {
      await admin.end();
    }
  }

  const db = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    const [{ hasAuth }] = (await db`
      select exists (
        select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users'
      ) as "hasAuth"`) as unknown as [{ hasAuth: boolean }];
    if (!hasAuth || isLocal) {
      await db.unsafe(readFileSync(path.join(root, 'supabase/local/000_auth_shim.sql'), 'utf8'));
    }
    await db`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
    const dir = path.join(root, 'supabase/migrations');
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      // Migrations are written to be re-runnable, so always apply; record for visibility.
      await db.unsafe(readFileSync(path.join(dir, file), 'utf8'));
      await db`insert into public.schema_migrations (name) values (${file}) on conflict do nothing`;
    }
    // Reference data: Australian postcodes (GeoNames, CC BY 4.0), loaded once.
    const [{ n }] = (await db`select count(*)::int as n from public.postcodes`) as unknown as [
      { n: number },
    ];
    if (n === 0)
      await db.unsafe(readFileSync(path.join(root, 'supabase/seed/postcodes.sql'), 'utf8'));
    // schema_migrations is internal bookkeeping; keep it out of the API roles' reach.
    await db`alter table public.schema_migrations enable row level security`;
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace';
  migrate(url, { reset: process.argv.includes('--reset') })
    .then(() => console.log(`Migrations applied to ${new URL(url).pathname.slice(1)}`))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
