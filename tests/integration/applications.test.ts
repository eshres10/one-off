import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql } from '@/lib/db';
import { saveApplicationLabel, saveApplicationWork, submitApplication } from '@/lib/services/apply';
import {
  applicationQueue,
  applicationsDigest,
  approveApplication,
  declineApplication,
  requestChanges,
  resolveSpotCheck,
} from '@/lib/services/applications';

afterAll(closeDb);

const admin = async () => {
  const [a] = await sql()<
    { id: string }[]
  >`select id from public.users where role = 'admin' limit 1`;
  return { id: a!.id, role: 'admin' as const };
};

async function applicant(name: string) {
  const id = randomUUID();
  const email = `queue-${id.slice(0, 8)}@maker.test`;
  await sql()`insert into auth.users (id, email) values (${id}, ${email})`;
  await sql()`insert into public.users (id, auth_user_id, email, role) values (${id}, ${id}, ${email}, 'buyer')`;
  const user = { id, email, role: 'buyer' as const, makerId: null };
  const { makerId } = await saveApplicationLabel(user, {
    name,
    ownerName: 'Sam Maker',
    email: '',
    mobile: '0400 111 222',
    suburb: 'Hobart',
    state: 'TAS',
    instagram: 'sam.makes',
    website: '',
    makes: ['Knitwear'],
    modes: ['ready_to_ship'],
  });
  await saveApplicationWork(user, {
    photos: [
      '/seed/butter-silk-slip.jpg',
      '/seed/navy-satin-slip.jpg',
      '/seed/draped-satin-midi.jpg',
    ],
    madeBy: 'team',
    madeByDetail: '',
    process: 'Knitted on domestic machines and finished by hand.',
    fabrics: '',
    declaration: true,
  });
  await submitApplication(user);
  return { user, makerId };
}

const shop = async (makerId: string) =>
  (
    await sql()<
      {
        shopStatus: string;
        reviewNote: string | null;
        foundingNumber: number | null;
        spotChecksLeft: number;
        canReapplyAfter: Date | null;
      }[]
    >`select shop_status, review_note, founding_number, spot_checks_left, can_reapply_after
      from public.makers where id = ${makerId}`
  )[0]!;
const outbox = async (template: string) =>
  sql()<{ toEmail: string; subject: string }[]>`
    select to_email, subject from public.email_outbox where template = ${template} order by created_at desc limit 5`;

describe('the applications queue', () => {
  it('lists applications oldest first and never invited shops', async () => {
    const { makerId } = await applicant(`Queue Label ${Date.now()}`);
    const queue = await applicationQueue('applied');
    expect(queue.map((r) => r.makerId)).toContain(makerId);
    const dates = queue.map((r) => new Date(r.submittedAt).getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    const [invited] = await sql()<
      { id: string }[]
    >`select id from public.makers where source = 'invite' limit 1`;
    expect(queue.map((r) => r.makerId)).not.toContain(invited!.id);
  });

  it('approves with a founding spot and sends the welcome email', async () => {
    const { user, makerId } = await applicant('Founding Knits');
    await approveApplication(await admin(), makerId, { founding: true });
    const s = await shop(makerId);
    expect(s.shopStatus).toBe('approved');
    expect(s.foundingNumber).toBeGreaterThan(0);
    expect(s.spotChecksLeft).toBe(3);
    expect((await outbox('application_approved'))[0]).toMatchObject({
      toEmail: user.email,
      subject: 'You’re in. Welcome to One Off',
    });
    const [decision] = await sql()<{ decision: string }[]>`
      select decision from public.shop_applications where maker_id = ${makerId}`;
    expect(decision!.decision).toBe('approved');
  });

  it('requests changes with a note, and declines with a reason and a reapply date', async () => {
    const { user, makerId } = await applicant('Reworked Knits');
    await expect(requestChanges(await admin(), makerId, '')).rejects.toThrow(/note/);
    await requestChanges(await admin(), makerId, 'Please add photos of finished pieces.');
    expect(await shop(makerId)).toMatchObject({
      shopStatus: 'changes_requested',
      reviewNote: 'Please add photos of finished pieces.',
    });
    await submitApplication(user);
    expect((await shop(makerId)).shopStatus).toBe('applied');

    await declineApplication(await admin(), makerId, { reason: 'photos', personal: '' });
    const s = await shop(makerId);
    expect(s.shopStatus).toBe('declined');
    expect(s.reviewNote).toMatch(/photos didn’t show/);
    const days = (new Date(s.canReapplyAfter!).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBeGreaterThanOrEqual(89);
    expect((await outbox('application_declined'))[0]!.toEmail).toBe(user.email);
    // Only applications waiting for review can be decided.
    await expect(approveApplication(await admin(), makerId, { founding: false })).rejects.toThrow(
      /isn’t waiting/,
    );
  });

  it('spot-checks the first pieces and can take one down with a note', async () => {
    const { makerId } = await applicant('Spot Knits');
    await approveApplication(await admin(), makerId, { founding: false });
    const [p] = await sql()<{ id: string; spotCheck: boolean }[]>`
      insert into public.products (maker_id, slug, title, category, price_cents, product_type, status)
      values (${makerId}, ${`spot-${makerId.slice(0, 8)}`}, 'Spot Jumper', 'tops', 24000, 'ready_to_ship', 'approved')
      returning id, spot_check`;
    expect(p!.spotCheck).toBe(true);
    await resolveSpotCheck(await admin(), p!.id, {
      unpublish: true,
      note: 'Please show the back too.',
    });
    const [after] = await sql()<{ status: string; spotCheckNote: string }[]>`
      select status, spot_check_note from public.products where id = ${p!.id}`;
    expect(after).toEqual({ status: 'draft', spotCheckNote: 'Please show the back too.' });
    expect((await outbox('spot_check_unpublished')).length).toBeGreaterThan(0);
  });

  it('sends the 9am summary once a day when applications are overdue', async () => {
    const { makerId } = await applicant('Overdue Knits');
    await sql()`update public.makers set applied_at = now() - interval '10 days' where id = ${makerId}`;
    await sql()`delete from public.email_outbox where template = 'applications_waiting'`;
    const first = await applicationsDigest(new Date());
    expect(first.sent).toBe(true);
    expect((await applicationsDigest(new Date())).sent).toBe(false);
  });
});
