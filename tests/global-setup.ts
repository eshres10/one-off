/**
 * Integration tests need a migrated database. Unit tests don't, so failures to reach Postgres
 * only matter when integration tests run (they will fail with a clear connection error).
 */
import { execSync } from 'node:child_process';

export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_test';
  const onlyUnit = process.argv.some((a) => a.includes('tests/unit'));
  if (onlyUnit) return;
  const { hostname } = new URL(url);
  if (['127.0.0.1', 'localhost'].includes(hostname)) {
    execSync('bash scripts/pg-local.sh', { stdio: 'inherit' });
  }
  const { migrate } = await import('../scripts/db-setup');
  await migrate(url, { reset: true });
  const { seed } = await import('../scripts/seed');
  await seed(url);
}
