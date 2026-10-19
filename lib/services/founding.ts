import type { TransactionSql } from 'postgres';
import { TERMS } from '@/lib/studio/terms';

/**
 * The lowest free founding number (1 to TERMS.foundingSpotsTotal), or null when every spot is
 * taken. Call inside a transaction; it takes the founding-number lock.
 */
export async function nextFoundingNumber(tx: TransactionSql): Promise<number | null> {
  await tx`select pg_advisory_xact_lock(hashtext('founding_number'))`;
  const [row] = await tx<{ n: number }[]>`
    select n from generate_series(1, ${TERMS.foundingSpotsTotal}::int) n
    where not exists (select 1 from public.makers m where m.founding_number = n)
    order by n limit 1`;
  return row?.n ?? null;
}
