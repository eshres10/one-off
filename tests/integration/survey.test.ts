import { beforeAll, describe, expect, it } from 'vitest';
import { POST } from '@/app/api/survey/route';
import { sql, withAnon, withUser } from '@/lib/db';
import { PER_DAY } from '@/lib/survey/questions';
import { buyer } from './helpers';

/** A complete, valid submission; override to break it. */
function body(over: Record<string, unknown> = {}) {
  return {
    src: 'ig-dm',
    ref: 'fern-thread',
    q1_instagram_share: 'most',
    q2_monthly_volume: '6_20',
    q3_typical_price: '250_500',
    q4_commission: '12_18',
    q5_mto_share: 'half',
    q6_custom_today: 'quote_drop',
    q7_biggest_cost: 'visibility',
    q8_payout_need: '3_after',
    q9_blockers: ['fees', 'buyers'],
    q10_founding: 'want_in',
    q11_wish: 'Handle sizing questions for me.',
    follow_up: 'founding',
    contact_name: 'Fern',
    label_name: 'Fern & Thread',
    contact_email: 'fern@example.com',
    instagram: '@fernandthread',
    consent_contact: true,
    duration_seconds: 140,
    website: '',
    ...over,
  };
}

async function post(payload: unknown, ip = '203.0.113.7') {
  const res = await POST(
    new Request('http://localhost/api/survey', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(payload),
    }),
  );
  return { status: res.status, json: (await res.json()) as { ok: boolean; message?: string } };
}

describe('maker survey', () => {
  beforeAll(async () => {
    await sql()`delete from public.maker_survey_responses`;
    await sql()`delete from public.rate_limits where key like 'survey:%'`;
  });

  it('accepts a full submission and stores keys, contact details and the duration', async () => {
    const r = await post(body());
    expect(r.status).toBe(200);
    const [row] = await sql()<Record<string, unknown>[]>`
      select * from public.maker_survey_responses where contact_email = 'fern@example.com'`;
    expect(row).toMatchObject({
      src: 'ig-dm',
      ref: 'fern-thread',
      q4Commission: '12_18',
      q9Blockers: ['fees', 'buyers'],
      q10Founding: 'want_in',
      followUp: 'founding',
      contactName: 'Fern',
      labelName: 'Fern & Thread',
      instagram: 'fernandthread',
      consentContact: true,
      durationSeconds: 140,
    });
    // The founder hears about opt-ins through the outbox, answers as labels.
    const [mail] = await sql()<{ subject: string; bodyText: string }[]>`
      select subject, body_text from public.email_outbox where template = 'maker_survey' order by created_at desc limit 1`;
    expect(mail?.subject).toBe('New maker survey: Fern & Thread');
    expect(mail?.bodyText).toContain('12–18%');
    expect(mail?.bodyText).toContain('Fees, Not enough buyers yet');
  });

  it('rejects an unknown option key', async () => {
    const r = await post(body({ q4_commission: 'twenty' }), '203.0.113.8');
    expect(r.status).toBe(400);
  });

  it('rejects more than two blockers, "nothing" with others, and a bad src', async () => {
    expect(
      (await post(body({ q9_blockers: ['fees', 'buyers', 'admin'] }), '203.0.113.9')).status,
    ).toBe(400);
    expect((await post(body({ q9_blockers: ['fees', 'nothing'] }), '203.0.113.9')).status).toBe(
      400,
    );
    expect((await post(body({ src: 'Bad Src!' }), '203.0.113.9')).status).toBe(400);
    expect((await post(body({ extra: 'field' }), '203.0.113.9')).status).toBe(400);
  });

  it('rejects a submission finished in under 20 seconds', async () => {
    const r = await post(body({ duration_seconds: 12 }), '203.0.113.10');
    expect(r.status).toBe(400);
  });

  it('rejects the honeypot filled in', async () => {
    const r = await post(body({ website: 'https://spam.example' }), '203.0.113.11');
    expect(r.status).toBe(400);
  });

  it('drops contact details when follow-up is "no" or consent is unticked', async () => {
    await post(body({ follow_up: 'no', contact_email: 'dropme@example.com' }), '203.0.113.12');
    await post(
      body({ follow_up: 'chat', consent_contact: false, contact_email: 'dropme2@example.com' }),
      '203.0.113.12',
    );
    const rows = await sql()<{ contactEmail: string | null }[]>`
      select contact_email from public.maker_survey_responses where contact_email in ('dropme@example.com', 'dropme2@example.com')`;
    expect(rows).toHaveLength(0);
    const [noRow] = await sql()<Record<string, unknown>[]>`
      select follow_up, contact_name, contact_email, instagram, consent_contact
      from public.maker_survey_responses where follow_up = 'no' order by created_at desc limit 1`;
    expect(noRow).toMatchObject({
      followUp: 'no',
      contactName: null,
      contactEmail: null,
      instagram: null,
      consentContact: false,
    });
  });

  it('requires a name and email when they opt in with consent', async () => {
    const r = await post(body({ contact_email: '' }), '203.0.113.13');
    expect(r.status).toBe(400);
  });

  it(`allows ${PER_DAY} a day per IP hash and refuses the next`, async () => {
    const ip = '198.51.100.44';
    for (let i = 0; i < PER_DAY; i++) {
      const r = await post(body({ follow_up: 'no' }), ip);
      expect(r.status, `submission ${i + 1}`).toBe(200);
    }
    const sixth = await post(body({ follow_up: 'no' }), ip);
    expect(sixth.status).toBe(429);
    // The limiter stores a hash, never the address.
    const keys = await sql()<
      { key: string }[]
    >`select key from public.rate_limits where key like 'survey:%'`;
    expect(keys.length).toBeGreaterThan(0);
    for (const k of keys) expect(k.key).not.toContain(ip);
  });

  it('cannot be read or written by anon or signed-in buyers', async () => {
    await expect(
      withAnon((db) => db`select id from public.maker_survey_responses`),
    ).rejects.toThrow(/permission denied/);
    await expect(
      withAnon(
        (db) => db`insert into public.maker_survey_responses (q10_founding) values ('want_in')`,
      ),
    ).rejects.toThrow(/permission denied/);
    // A signed-in non-admin: the table is readable only through the admin policy.
    const rows = await withUser(buyer(0), (db) => db`select id from public.maker_survey_responses`);
    expect(rows).toHaveLength(0);
    await expect(
      withUser(
        buyer(0),
        (db) => db`insert into public.maker_survey_responses (q10_founding) values ('want_in')`,
      ),
    ).rejects.toThrow(/permission denied|row-level security/);
  });
});
