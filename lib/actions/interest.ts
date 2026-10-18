'use server';

import { z } from 'zod';
import { audit } from '@/lib/audit';
import { env } from '@/lib/env';
import { sendEmail } from '@/lib/email/send';
import { rateLimit } from '@/lib/rate-limit';
import { fieldErrors, type FormState } from '@/lib/validation';
import { clientIp, toFormState } from './util';

const schema = z.object({
  name: z.string().trim().min(2, 'Add your name').max(80),
  email: z.string().trim().email('Enter a valid email address'),
  label: z.string().trim().min(2, 'Add your label name').max(80),
  city: z.string().trim().min(2, 'Where is your studio?').max(60),
  link: z.string().trim().max(200).optional(),
  about: z.string().trim().min(20, 'Tell us a little more (20+ characters)').max(2000),
});

/** "Sell with us" interest form: emails the team (there is no public seller sign-up). */
export async function sellerInterestAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await rateLimit('commission', `interest:${clientIp()}`);
    const d = parsed.data;
    await sendEmail({
      to: env().ADMIN_NOTIFICATION_EMAIL,
      template: 'seller_interest',
      subject: `Seller interest: ${d.label} (${d.city})`,
      text: `${d.name} <${d.email}>\nLabel: ${d.label}\nCity: ${d.city}\nLink: ${d.link ?? '—'}\n\n${d.about}`,
    });
    await audit(
      'seller.interest',
      { type: 'seller_interest', id: d.email },
      { label: d.label, city: d.city },
    );
  } catch (err) {
    return toFormState(err);
  }
  return { ok: true, message: 'Thank you — we’ll be in touch within a week.' };
}
