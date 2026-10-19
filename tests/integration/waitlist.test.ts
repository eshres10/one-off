import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { joinWaitlist, listWaitlist, waitlistSchema } from '@/lib/services/waitlist';

afterAll(closeDb);

const newEmail = () => `wl-${randomUUID().slice(0, 8)}@example.test`;

async function outbox(email: string) {
  return sql()<{ template: string }[]>`
    select template from public.email_outbox where to_email = ${email}`;
}

describe('waitlist', () => {
  it('records a sign-up and sends one welcome email', async () => {
    const email = newEmail();
    const first = await joinWaitlist(
      waitlistSchema.parse({ email, kind: 'shopper', source: 'ig' }),
    );
    expect(first.alreadyJoined).toBe(false);
    const again = await joinWaitlist(
      waitlistSchema.parse({ email: email.toUpperCase(), kind: 'shopper' }),
    );
    expect(again.alreadyJoined).toBe(true);

    const rows = (await listWaitlist()).filter((r) => r.email === email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'shopper', source: 'ig' });
    expect(await outbox(email)).toEqual([{ template: 'waitlist_welcome' }]);
  });

  it('upgrades a shopper who later applies as a maker, and never downgrades', async () => {
    const email = newEmail();
    await joinWaitlist(waitlistSchema.parse({ email, kind: 'shopper' }));
    await joinWaitlist(
      waitlistSchema.parse({
        email,
        kind: 'maker',
        name: 'Saltbush Studio',
        instagram: '@saltbush',
      }),
    );
    await joinWaitlist(waitlistSchema.parse({ email, kind: 'shopper' }));

    const [row] = await listWaitlist('maker').then((r) => r.filter((x) => x.email === email));
    expect(row).toMatchObject({ kind: 'maker', name: 'Saltbush Studio', instagram: 'saltbush' });
  });

  it('is not readable by anonymous API users', async () => {
    // Either no grant (permission denied) or RLS with no anon policy (no rows) is fine.
    const rows = await sql()
      .begin(async (tx) => {
        await tx`set local role anon`;
        return tx`select id from public.waitlist_signups`;
      })
      .catch((err: Error) => {
        expect(err.message).toMatch(/permission denied/);
        return [];
      });
    expect(rows).toHaveLength(0);
  });
});
