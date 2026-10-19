import { z } from 'zod';
import { sql } from '@/lib/db';
import { BRAND } from '@/lib/brand';
import { audit } from '@/lib/audit';
import { sendEmail } from '@/lib/email/send';
import { emailSchema } from '@/lib/validation';

export const WAITLIST_KINDS = ['shopper', 'maker'] as const;
export type WaitlistKind = (typeof WAITLIST_KINDS)[number];

/** Accepts "@handle", "handle" or an instagram.com URL; stores the bare lowercase handle. */
export const instagramSchema = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) =>
    (v ?? '')
      .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/^@/, '')
      .replace(/[/?#].*$/, '')
      .toLowerCase(),
  )
  .refine((v) => v === '' || /^[a-z0-9._]{1,30}$/.test(v), 'Enter your Instagram handle')
  .transform((v) => (v ? v : undefined));

export const waitlistSchema = z
  .object({
    email: emailSchema,
    kind: z.enum(WAITLIST_KINDS, { errorMap: () => ({ message: 'Choose one' }) }),
    name: z
      .string()
      .trim()
      .max(80)
      .optional()
      .transform((v) => (v ? v : undefined)),
    instagram: instagramSchema,
    source: z
      .string()
      .trim()
      .max(60)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'maker' && !v.name)
      ctx.addIssue({ code: 'custom', path: ['name'], message: 'Add your label name' });
  });

export type WaitlistInput = z.infer<typeof waitlistSchema>;

/**
 * Adds (or updates) a waitlist sign-up. Joining twice is not an error: a shopper who later
 * signs up as a maker is upgraded, and details they add are kept. Only first sign-ups get the
 * confirmation email.
 */
export async function joinWaitlist(input: WaitlistInput): Promise<{ alreadyJoined: boolean }> {
  const [row] = await sql()<{ id: string; inserted: boolean }[]>`
    insert into public.waitlist_signups (email, kind, name, instagram, source)
    values (${input.email}, ${input.kind}, ${input.name ?? null}, ${input.instagram ?? null}, ${input.source ?? null})
    on conflict (email) do update set
      kind = case when excluded.kind = 'maker' then 'maker' else waitlist_signups.kind end,
      name = coalesce(excluded.name, waitlist_signups.name),
      instagram = coalesce(excluded.instagram, waitlist_signups.instagram),
      updated_at = now()
    returning id, (xmax = 0) as inserted`;
  const alreadyJoined = !row!.inserted;
  if (!alreadyJoined) {
    await sendEmail({
      to: input.email,
      template: 'waitlist_welcome',
      subject:
        input.kind === 'maker'
          ? `You’re on the ${BRAND.name} maker list`
          : `You’re on the ${BRAND.name} waitlist`,
      text:
        (input.kind === 'maker'
          ? `Thank you for your interest in selling on ${BRAND.name}.\n\nWe’re inviting a small group of independent Australian makers before launch. We’ll be in touch personally within a couple of weeks to hear about your work.\n\nQuestions in the meantime? Write to ${BRAND.supportEmail}.`
          : `Thank you for joining the ${BRAND.name} waitlist.\n\nWe’ll email you when we open, with first access to pieces from the makers launching with us.\n\nQuestions? Write to ${BRAND.supportEmail}.`) +
        `\n\n— ${BRAND.name}\n${BRAND.tagline}`,
      related: { type: 'waitlist_signup', id: row!.id },
    });
    await audit('waitlist.joined', { type: 'waitlist_signup', id: row!.id }, { kind: input.kind });
  }
  return { alreadyJoined };
}

export interface WaitlistRow {
  id: string;
  email: string;
  kind: WaitlistKind;
  name: string | null;
  instagram: string | null;
  source: string | null;
  createdAt: Date;
}

export async function listWaitlist(kind?: WaitlistKind): Promise<WaitlistRow[]> {
  return sql()<WaitlistRow[]>`
    select id, email, kind, name, instagram, source, created_at from public.waitlist_signups
    ${kind ? sql()`where kind = ${kind}` : sql()``}
    order by created_at desc`;
}

export async function waitlistCounts(): Promise<Record<WaitlistKind, number>> {
  const rows = await sql()<{ kind: WaitlistKind; n: number }[]>`
    select kind, count(*)::int as n from public.waitlist_signups group by kind`;
  return {
    shopper: rows.find((r) => r.kind === 'shopper')?.n ?? 0,
    maker: rows.find((r) => r.kind === 'maker')?.n ?? 0,
  };
}
