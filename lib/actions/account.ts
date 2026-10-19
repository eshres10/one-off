'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { isOwnImageUrl } from '@/lib/storage';
import { createCommissionRequest, decideQuote } from '@/lib/services/commissions';
import { submitReview } from '@/lib/services/reviews';
import {
  makeDefaultAddress,
  removeAddress,
  removeSavedCard,
  saveAddress,
  setBuyerPrefs,
} from '@/lib/services/buyer-profile';
import { BUYER_NOTIFY, type BuyerNotify } from '@/lib/services/notifications';
import {
  commissionRequestSchema,
  fieldErrors,
  measurementsSchema,
  reviewSchema,
  type FormState,
} from '@/lib/validation';
import { toFormState } from './util';

export async function submitReviewAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const parsed = reviewSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await submitReview(user, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/account/orders');
  return { ok: true, message: 'Thank you — your review is live.' };
}

export async function saveMeasurementsAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const parsed = measurementsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  const m = parsed.data;
  try {
    await withUser(user, async (db) => {
      await db`
        insert into public.buyer_measurements (user_id, height_cm, bust_cm, waist_cm, hips_cm, inside_leg_cm, fit_notes)
        values (${user.id}, ${m.heightCm ?? null}, ${m.bustCm ?? null}, ${m.waistCm ?? null}, ${m.hipsCm ?? null},
          ${m.insideLegCm ?? null}, ${m.fitNotes ? sanitizeText(m.fitNotes) : null})
        on conflict (user_id) do update set height_cm = excluded.height_cm, bust_cm = excluded.bust_cm, waist_cm = excluded.waist_cm,
          hips_cm = excluded.hips_cm, inside_leg_cm = excluded.inside_leg_cm, fit_notes = excluded.fit_notes, updated_at = now()`;
      // The usual size also filters the feed: keep it first in the onboarding sizes.
      await db`
        insert into public.customer_prefs (user_id, usual_size, fit_pref, sizes)
        values (${user.id}, ${m.usualSize ?? null}, ${m.fitPref ?? null},
          ${m.usualSize ? [m.usualSize] : []}::text[])
        on conflict (user_id) do update set usual_size = excluded.usual_size, fit_pref = excluded.fit_pref,
          sizes = case when excluded.usual_size is null then public.customer_prefs.sizes
            else array_prepend(excluded.usual_size, array_remove(public.customer_prefs.sizes, excluded.usual_size)) end`;
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/account', 'layout');
  return { ok: true, message: 'Saved.' };
}

export async function createCommissionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in to request a custom piece.' };
  const parsed = commissionRequestSchema.safeParse({
    ...Object.fromEntries(form),
    inspirationImageUrls: form
      .getAll('inspirationImageUrls')
      .map(String)
      .filter((u) => u && isOwnImageUrl(u)),
  });
  if (!parsed.success)
    return {
      ok: false,
      errors: fieldErrors(parsed.error),
      message: 'Please check the highlighted fields.',
    };
  let id: string;
  try {
    id = await createCommissionRequest(user, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  redirect(`/account/commissions/${id}?submitted=1`);
}

export async function decideQuoteAction(form: FormData): Promise<void> {
  const user = await getSessionUser();
  if (!user) redirect('/login');
  const input = z
    .object({ requestId: z.string().uuid(), decision: z.enum(['accepted', 'declined']) })
    .parse(Object.fromEntries(form));
  await decideQuote(user, input.requestId, input.decision);
  revalidatePath(`/account/commissions/${input.requestId}`);
}

const id = z.string().min(1).max(64);

async function signedIn() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/account');
  return user;
}

function revalidateAccount() {
  revalidatePath('/account', 'layout');
}

/** Adds or edits a saved address. */
export async function saveAddressAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'Please sign in again.' };
  const f = (k: string) => String(form.get(k) ?? '');
  try {
    await saveAddress(user, {
      id: f('id') || undefined,
      label: f('label'),
      name: f('name'),
      line1: f('line1'),
      line2: f('line2'),
      suburb: f('suburb'),
      state: f('state'),
      postcode: f('postcode'),
      makeDefault: form.get('makeDefault') === 'on',
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidateAccount();
  return { ok: true, message: 'Address saved.' };
}

export async function makeDefaultAddressAction(form: FormData): Promise<void> {
  const user = await signedIn();
  await makeDefaultAddress(user, id.parse(form.get('id')));
  revalidateAccount();
}

export async function removeAddressAction(form: FormData): Promise<void> {
  const user = await signedIn();
  await removeAddress(user, id.parse(form.get('id')));
  revalidateAccount();
}

export async function removeCardAction(form: FormData): Promise<void> {
  const user = await signedIn();
  await removeSavedCard(user, z.string().startsWith('pm_').max(100).parse(form.get('id')));
  revalidateAccount();
}

const prefsSchema = z.object(
  Object.fromEntries(BUYER_NOTIFY.map((k) => [k, z.boolean()])) as Record<
    BuyerNotify,
    z.ZodBoolean
  >,
);

/** Notification switches save as they're flipped. */
export async function saveNotificationsAction(
  prefs: Record<BuyerNotify, boolean>,
): Promise<{ ok: boolean }> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const parsed = prefsSchema.safeParse(prefs);
  if (!parsed.success) return { ok: false };
  await setBuyerPrefs(user, parsed.data);
  revalidatePath('/account/notifications');
  return { ok: true };
}
