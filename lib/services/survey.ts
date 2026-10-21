import { createHash } from 'node:crypto';
import { sql, withService } from '@/lib/db';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { reportError } from '@/lib/log';
import { rateLimit } from '@/lib/rate-limit';
import { SITE } from '@/lib/site/config';
import {
  COMMISSION_ABOVE_12,
  FOLLOW_UP,
  QUESTIONS,
  SINGLE_KEYS,
  label,
  type SingleKey,
} from '@/lib/survey/questions';
import type { Submission } from '@/lib/survey/schema';

/**
 * A response as stored. Contact fields are null unless the maker opted in and consented; the
 * server drops them otherwise, whatever the browser sent.
 */
export interface SurveyRow {
  id: string;
  createdAt: Date;
  src: string | null;
  ref: string | null;
  q1InstagramShare: string | null;
  q2MonthlyVolume: string | null;
  q3TypicalPrice: string | null;
  q4Commission: string | null;
  q5MtoShare: string | null;
  q6CustomToday: string | null;
  q7BiggestCost: string | null;
  q8PayoutNeed: string | null;
  q9Blockers: string[];
  q10Founding: string | null;
  q11Wish: string | null;
  followUp: string | null;
  contactName: string | null;
  labelName: string | null;
  contactEmail: string | null;
  instagram: string | null;
  consentContact: boolean;
  durationSeconds: number | null;
  contactedAt: Date | null;
}

/**
 * The rate-limit subject: a hash of the IP and a salt that changes daily, so the stored key
 * can't be turned back into an address and goes stale within a day (rate_limits rows older than
 * a day are deleted by hit_rate_limit).
 */
export function dailyIpHash(ip: string, now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return createHash('sha256').update(`${ip}|${env().SESSION_SECRET}|${day}`).digest('hex');
}

/** Contact details stay only with an opt-in and consent. */
export function keepContact(s: Pick<Submission, 'follow_up' | 'consent_contact'>): boolean {
  return s.follow_up !== 'no' && s.consent_contact === true;
}

export async function submitSurvey(input: Submission, ip: string): Promise<{ id: string }> {
  await rateLimit('survey', dailyIpHash(ip));
  const contact = keepContact(input);
  const [row] = await withService(
    (db) => db<{ id: string }[]>`
      insert into public.maker_survey_responses (
        src, ref,
        q1_instagram_share, q2_monthly_volume, q3_typical_price, q4_commission, q5_mto_share,
        q6_custom_today, q7_biggest_cost, q8_payout_need, q9_blockers, q10_founding, q11_wish,
        follow_up, contact_name, label_name, contact_email, instagram, consent_contact, duration_seconds)
      values (
        ${input.src}, ${input.ref},
        ${input.q1_instagram_share}, ${input.q2_monthly_volume}, ${input.q3_typical_price},
        ${input.q4_commission}, ${input.q5_mto_share}, ${input.q6_custom_today},
        ${input.q7_biggest_cost}, ${input.q8_payout_need}, ${input.q9_blockers},
        ${input.q10_founding}, ${input.q11_wish},
        ${input.follow_up},
        ${contact ? input.contact_name : null}, ${contact ? input.label_name : null},
        ${contact ? input.contact_email : null}, ${contact ? input.instagram : null},
        ${contact}, ${input.duration_seconds})
      returning id`,
  );
  if (contact)
    await notifyFounder(input).catch((err) => reportError(err, { where: 'survey:notify' }));
  return { id: row!.id };
}

/** "New maker survey: {label or 'anonymous'}" to the founder, answers as labels. */
async function notifyFounder(s: Submission) {
  const who = s.label_name || s.contact_name || 'anonymous';
  const lines = [
    `${who} answered the maker survey and said: ${label('follow_up', s.follow_up)}.`,
    '',
    `Name: ${s.contact_name ?? ''}`,
    `Label: ${s.label_name ?? ''}`,
    `Email: ${s.contact_email ?? ''}`,
    `Instagram: ${s.instagram ? '@' + s.instagram : ''}`,
    s.src || s.ref ? `From: ${[s.src, s.ref].filter(Boolean).join(' / ')}` : '',
    '',
    ...QUESTIONS.map((q) => {
      const v =
        q.kind === 'multi'
          ? s.q9_blockers.map((k) => label('q9_blockers', k)).join(', ') || '—'
          : q.kind === 'text'
            ? s.q11_wish || '—'
            : label(q.key, s[q.key as SingleKey]);
      return `${q.n}. ${q.question}\n   ${v}`;
    }),
  ];
  await sendEmail({
    to: SITE.supportEmail,
    template: 'maker_survey',
    subject: `New maker survey: ${who}`,
    text: lines.join('\n'),
    replyTo: s.contact_email ?? undefined,
  });
}

/* ---------- Admin ---------- */

export interface SurveyFilter {
  src?: string | null;
  ref?: string | null;
  from?: string | null;
  to?: string | null;
}

function where(f: SurveyFilter) {
  const db = sql();
  const parts = [db`true`];
  if (f.src) parts.push(db`src = ${f.src}`);
  if (f.ref) parts.push(db`ref = ${f.ref}`);
  if (f.from) parts.push(db`created_at >= ${f.from}::date`);
  if (f.to) parts.push(db`created_at < (${f.to}::date + interval '1 day')`);
  return parts.reduce((acc, p) => db`${acc} and ${p}`);
}

export async function listResponses(f: SurveyFilter = {}): Promise<SurveyRow[]> {
  return sql()<SurveyRow[]>`
    select * from public.maker_survey_responses where ${where(f)} order by created_at desc`;
}

export interface SurveyStats {
  total: number;
  last7: number;
  perQuestion: Record<string, Array<{ key: string; label: string; count: number; pct: number }>>;
  commissionAbove12Pct: number | null;
  foundingCount: number;
  sources: string[];
  refs: string[];
}

export async function surveyStats(f: SurveyFilter = {}): Promise<SurveyStats> {
  const rows = await listResponses(f);
  const total = rows.length;
  const weekAgo = Date.now() - 7 * 86_400_000;
  const last7 = rows.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length;
  const perQuestion: SurveyStats['perQuestion'] = {};
  const camel = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  for (const q of QUESTIONS) {
    if (q.kind === 'text') continue;
    const counts = new Map(q.options.map((o) => [o.key, 0]));
    for (const r of rows) {
      const v = (r as unknown as Record<string, unknown>)[camel(q.key)];
      const values = Array.isArray(v) ? v : v ? [v] : [];
      for (const k of values) counts.set(String(k), (counts.get(String(k)) ?? 0) + 1);
    }
    perQuestion[q.key] = q.options.map((o) => ({
      key: o.key,
      label: o.label,
      count: counts.get(o.key) ?? 0,
      pct: total ? Math.round(((counts.get(o.key) ?? 0) / total) * 100) : 0,
    }));
  }
  const answered4 = rows.filter((r) => r.q4Commission);
  const above = answered4.filter((r) =>
    (COMMISSION_ABOVE_12 as readonly string[]).includes(r.q4Commission!),
  ).length;
  const founding = rows.filter(
    (r) => r.q10Founding === 'want_in' || r.followUp === 'founding',
  ).length;
  const [tags] = await sql()<{ sources: string[] | null; refs: string[] | null }[]>`
    select array_agg(distinct src) filter (where src is not null) as sources,
      array_agg(distinct ref) filter (where ref is not null) as refs
    from public.maker_survey_responses`;
  return {
    total,
    last7,
    perQuestion,
    commissionAbove12Pct: answered4.length ? Math.round((above / answered4.length) * 100) : null,
    foundingCount: founding,
    sources: tags?.sources ?? [],
    refs: tags?.refs ?? [],
  };
}

export async function setContacted(id: string, contacted: boolean): Promise<void> {
  await sql()`
    update public.maker_survey_responses set contacted_at = ${contacted ? new Date() : null} where id = ${id}`;
}

/** Rows for the CSV, labels instead of keys. Contact columns only when asked for. */
export function csvRows(rows: SurveyRow[], includeContact: boolean): string[][] {
  const head = [
    'submitted',
    'src',
    'ref',
    ...QUESTIONS.map((q) => `q${q.n}`),
    'follow_up',
    ...(includeContact ? ['first_name', 'label', 'email', 'instagram', 'contacted'] : []),
    'duration_seconds',
  ];
  const body = rows.map((r) => [
    new Date(r.createdAt).toISOString(),
    r.src ?? '',
    r.ref ?? '',
    ...SINGLE_KEYS.slice(0, 8).map((k) =>
      label(k, (r as unknown as Record<string, string | null>)[camelKey(k)]!),
    ),
    r.q9Blockers.map((k) => label('q9_blockers', k)).join('; '),
    label('q10_founding', r.q10Founding),
    r.q11Wish ?? '',
    label('follow_up', r.followUp),
    ...(includeContact
      ? [
          r.contactName ?? '',
          r.labelName ?? '',
          r.contactEmail ?? '',
          r.instagram ? `@${r.instagram}` : '',
          r.contactedAt ? new Date(r.contactedAt).toISOString() : '',
        ]
      : []),
    r.durationSeconds == null ? '' : String(r.durationSeconds),
  ]);
  return [head, ...body];
}

const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export { FOLLOW_UP };
