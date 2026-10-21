import { z } from 'zod';
import {
  FOLLOW_UP,
  MIN_SECONDS,
  Q9_MAX,
  Q9_NOTHING,
  SINGLE_KEYS,
  TAG_RE,
  WISH_MAX,
  optionKeys,
  type SingleKey,
} from './questions';

const single = (key: SingleKey) => z.enum(optionKeys(key) as [string, ...string[]]);
const tag = z
  .string()
  .regex(TAG_RE)
  .optional()
  .nullable()
  .transform((v) => v ?? null);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** A submission as the browser sends it. Unknown keys and extra fields are rejected. */
export const submissionSchema = z
  .object({
    src: tag,
    ref: tag,
    ...(Object.fromEntries(SINGLE_KEYS.map((k) => [k, single(k)])) as Record<
      SingleKey,
      z.ZodEnum<[string, ...string[]]>
    >),
    q9_blockers: z
      .array(z.enum(optionKeys('q9_blockers') as [string, ...string[]]))
      .max(Q9_MAX)
      .refine((a) => new Set(a).size === a.length, 'No repeats')
      .refine((a) => !a.includes(Q9_NOTHING) || a.length === 1, '"Nothing" stands alone'),
    q11_wish: text(WISH_MAX),
    follow_up: z.enum(FOLLOW_UP.map((o) => o.key) as [string, ...string[]]),
    contact_name: text(80),
    label_name: text(80),
    contact_email: z
      .string()
      .trim()
      .email()
      .max(254)
      .optional()
      .nullable()
      .transform((v) => (v ? v.toLowerCase() : null)),
    instagram: z
      .string()
      .trim()
      .max(31)
      .optional()
      .nullable()
      .transform((v) => (v ? v.replace(/^@/, '') : null))
      .refine((v) => v === null || /^[A-Za-z0-9._]{1,30}$/.test(v), 'Not an Instagram handle'),
    consent_contact: z.boolean().default(false),
    duration_seconds: z.number().int().min(0).max(86_400),
    /** Honeypot: humans never see it. */
    website: z.string().max(200).optional().default(''),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.duration_seconds < MIN_SECONDS)
      ctx.addIssue({ code: 'custom', path: ['duration_seconds'], message: 'Too fast' });
    if (v.website) ctx.addIssue({ code: 'custom', path: ['website'], message: 'Spam' });
    if (v.follow_up !== 'no' && v.consent_contact) {
      if (!v.contact_name)
        ctx.addIssue({ code: 'custom', path: ['contact_name'], message: 'Add your first name.' });
      if (!v.contact_email)
        ctx.addIssue({ code: 'custom', path: ['contact_email'], message: 'Add your email.' });
    }
  });

export type Submission = z.infer<typeof submissionSchema>;
