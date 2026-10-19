'use server';

import { rateLimit } from '@/lib/rate-limit';
import { joinWaitlist, waitlistSchema } from '@/lib/services/waitlist';
import { fieldErrors, type FormState } from '@/lib/validation';
import { clientIp, toFormState } from './util';

export async function joinWaitlistAction(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = waitlistSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  let alreadyJoined = false;
  try {
    await rateLimit('waitlist', clientIp());
    ({ alreadyJoined } = await joinWaitlist(parsed.data));
  } catch (err) {
    return toFormState(err);
  }
  if (alreadyJoined)
    return { ok: true, message: 'You’re already on the list — we’ve updated your details.' };
  return {
    ok: true,
    message:
      parsed.data.kind === 'maker'
        ? 'You’re on the maker list. We’ll be in touch personally within a couple of weeks.'
        : 'You’re on the list. We’ll email you the moment we open.',
  };
}
