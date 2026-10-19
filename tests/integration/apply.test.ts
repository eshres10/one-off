import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import {
  applyState,
  myApplication,
  saveApplicationLabel,
  saveApplicationWork,
  submitApplication,
} from '@/lib/services/apply';
import { stripeOnboardingLink } from '@/lib/services/claim';

afterAll(closeDb);

async function newUser() {
  const id = randomUUID();
  const email = `apply-${id.slice(0, 8)}@maker.test`;
  await sql()`insert into auth.users (id, email) values (${id}, ${email})`;
  await sql()`insert into public.users (id, auth_user_id, email, role) values (${id}, ${id}, ${email}, 'buyer')`;
  return { id, email, role: 'buyer' as const, makerId: null };
}

const label = {
  name: 'Saltbush Studio',
  ownerName: 'Jo Maker',
  email: '',
  mobile: '0400 000 000',
  suburb: 'Fremantle',
  state: 'WA',
  instagram: '@saltbush.studio',
  website: 'saltbush.com.au',
  makes: ['Dresses', 'Tops'],
  modes: ['made_to_order'],
};
const work = {
  photos: [
    '/seed/butter-silk-slip.jpg',
    '/seed/navy-satin-slip.jpg',
    '/seed/draped-satin-midi.jpg',
  ],
  madeBy: 'self' as const,
  madeByDetail: '',
  process: 'I draft every pattern and sew each piece in my studio.',
  fabrics: 'Deadstock silks from Sydney',
  declaration: true,
};

describe('maker applications', () => {
  it('save as a draft, then join the queue on submit with an immutable record', async () => {
    const user = await newUser();
    const draft = await saveApplicationLabel(user, label);
    expect(draft.shopStatus).toBe('draft');
    expect(draft.answers).toMatchObject({
      instagram: 'saltbush.studio',
      website: 'https://saltbush.com.au',
      email: user.email,
      state: 'WA',
    });
    const [m] = await sql()<{ city: string; source: string; founding: number | null }[]>`
      select city, source, founding_number as founding from public.makers where id = ${draft.makerId}`;
    // Australia-wide: a WA maker starts in Perth, and no founding spot is given at sign-up.
    expect(m).toEqual({ city: 'Perth', source: 'application', founding: null });

    await expect(submitApplication(user)).rejects.toThrow(/Show us your work/);
    await expect(
      saveApplicationWork(user, { ...work, photos: work.photos.slice(0, 2) }),
    ).rejects.toThrow(/at least 3/);
    await saveApplicationWork(user, work);
    const sent = await submitApplication(user);
    expect(sent.shopStatus).toBe('applied');
    expect(applyState(sent)).toBe('applied');

    const rows = await sql()<{ answers: { name: string }; photoUrls: string[] }[]>`
      select answers, photo_urls from public.shop_applications where maker_id = ${draft.makerId}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.answers.name).toBe('Saltbush Studio');
    expect(rows[0]!.photoUrls).toHaveLength(3);
    await expect(
      sql()`update public.shop_applications set answers = '{}' where maker_id = ${draft.makerId}`,
    ).rejects.toThrow(/can’t be changed/);

    // Under review: no edits, and no Stripe account.
    await expect(saveApplicationLabel(user, label)).rejects.toThrow(/with us/);
    await expect(stripeOnboardingLink(user)).rejects.toThrow(/once your shop is approved/);
    const sentEmails = await sql()<{ template: string }[]>`
      select template from public.email_outbox where related_entity_id = ${draft.makerId} or to_email = ${user.email}`;
    expect(sentEmails.map((e) => e.template)).toEqual(
      expect.arrayContaining(['application_new', 'application_received']),
    );
  });

  it('reopen for edits when changes are requested, and wait out a decline', async () => {
    const user = await newUser();
    const { makerId } = await saveApplicationLabel(user, label);
    await saveApplicationWork(user, work);
    await submitApplication(user);

    await sql()`update public.makers set shop_status = 'changes_requested', review_note = 'More photos please'
      where id = ${makerId}`;
    const app = await myApplication(user);
    expect(applyState(app)).toBe('changes_requested');
    await saveApplicationLabel(user, { ...label, name: 'Saltbush' });
    expect((await submitApplication(user)).shopStatus).toBe('applied');
    expect((await myApplication(user))!.reviewNote).toBeNull();

    await sql()`update public.makers set shop_status = 'declined', can_reapply_after = current_date + 90
      where id = ${makerId}`;
    expect(applyState(await myApplication(user))).toBe('declined');
    await expect(submitApplication(user)).rejects.toThrow(/apply again/);

    // After the date, they can apply again.
    await sql()`update public.makers set can_reapply_after = current_date - 1 where id = ${makerId}`;
    expect(applyState(await myApplication(user))).toBe('draft');
    expect((await submitApplication(user)).shopStatus).toBe('applied');
  });
});
