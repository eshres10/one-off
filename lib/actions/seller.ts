'use server';

import { goLiveIfReady } from '@/lib/services/sell';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/lib/audit';
import { requireSeller } from '@/lib/auth/session';
import { sql, withUser } from '@/lib/db';
import { env } from '@/lib/env';
import { sanitizeText } from '@/lib/domain/moderation';
import { mockPaymentsReachable } from '@/lib/features';
import { payments } from '@/lib/payments';
import { createQuote, respondToCommission } from '@/lib/services/commissions';
import { updateFulfilment } from '@/lib/services/fulfilment';
import {
  archiveListing,
  createListing,
  duplicateListing,
  updateListing,
  type ListingInput,
} from '@/lib/services/listings';
import { isOwnImageUrl } from '@/lib/storage';
import {
  commissionQuoteSchema,
  fieldErrors,
  fulfilmentUpdateSchema,
  listingSchema,
  makerProfileSchema,
  type FormState,
} from '@/lib/validation';
import { toFormState } from './util';

function parseListing(form: FormData) {
  const measurements = form
    .getAll('measurementName')
    .map((name, i) => ({ name: String(name), valueCm: form.getAll('measurementValue')[i] }))
    .filter((m) => m.name.trim() && String(m.valueCm ?? '').trim());
  const images = form
    .getAll('imageUrl')
    .map((url, i) => ({ url: String(url), alt: String(form.getAll('imageAlt')[i] ?? '') }))
    .filter((i) => i.url && isOwnImageUrl(i.url));
  const list = (key: string) =>
    String(form.get(key) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const parsed = listingSchema.safeParse({
    ...Object.fromEntries(form),
    sizes: list('sizes'),
    colours: list('colours'),
    measurements,
  });
  return { parsed, images };
}

export async function saveListingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const { parsed, images } = parseListing(form);
  if (!parsed.success)
    return {
      ok: false,
      errors: fieldErrors(parsed.error),
      message: 'Please check the highlighted fields.',
    };
  const submit = form.get('intent') === 'submit';
  const productId = z.string().uuid().safeParse(form.get('productId'));
  const input: ListingInput = { ...parsed.data, images };
  try {
    if (productId.success) await updateListing(seller, productId.data, input, submit);
    else {
      const id = await createListing(seller, input, submit);
      revalidatePath('/studio/listings');
      redirect(`/studio/listings/${id}?saved=1`);
    }
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/studio/listings');
  return { ok: true, message: submit ? 'Saved and submitted for review.' : 'Saved.' };
}

export async function listingCommandAction(form: FormData) {
  const seller = await requireSeller();
  const { productId, command } = z
    .object({ productId: z.string().uuid(), command: z.enum(['archive', 'duplicate']) })
    .parse(Object.fromEntries(form));
  if (command === 'archive') await archiveListing(seller, productId);
  else {
    const id = await duplicateListing(seller, productId);
    redirect(`/studio/listings/${id}`);
  }
  revalidatePath('/studio/listings');
}

export async function fulfilmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const parsed = fulfilmentUpdateSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await updateFulfilment(seller, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/studio/orders');
  revalidatePath(`/studio/orders/${parsed.data.fulfilmentId}`);
  return { ok: true, message: 'Order updated — the buyer has been notified.' };
}

export async function saveProfileAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const parsed = makerProfileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return {
      ok: false,
      errors: fieldErrors(parsed.error),
      message: 'Please check the highlighted fields.',
    };
  const p = parsed.data;
  const avatar = String(form.get('avatarUrl') ?? '');
  const cover = String(form.get('coverUrl') ?? '');
  const t = (v?: string) => (v ? sanitizeText(v) : null);
  try {
    await withUser(
      seller,
      (db) => db`
      update public.makers set display_name = ${sanitizeText(p.displayName)}, tagline = ${t(p.tagline)}, story = ${t(p.story)},
        process = ${t(p.process)}, materials = ${t(p.materials)}, sizing_notes = ${t(p.sizingNotes)}, city = ${sanitizeText(p.city)},
        state = ${p.state}, location = ${sanitizeText(p.city)}, lead_time_days = ${p.leadTimeDays}, dispatch_days = ${p.dispatchDays},
        shipping_standard_cents = ${p.shippingStandard}, free_shipping_over_cents = ${p.freeShippingOver},
        custom_commissions_enabled = ${p.customCommissionsEnabled},
        avatar_url = ${avatar && isOwnImageUrl(avatar) ? avatar : db`avatar_url`},
        cover_url = ${cover && isOwnImageUrl(cover) ? cover : db`cover_url`}
      where id = ${seller.makerId}`,
    );
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/studio', 'layout');
  return { ok: true, message: 'Profile saved.' };
}

export async function submitProfileForReviewAction() {
  const seller = await requireSeller();
  await withUser(
    seller,
    (db) =>
      db`update public.makers set status = 'pending' where id = ${seller.makerId} and status = 'draft'`,
  );
  await audit('maker.submitted_for_review', { type: 'maker', id: seller.makerId }, {}, seller.id);
  revalidatePath('/studio', 'layout');
}

/** Creates (once) the maker's Stripe Connect Express account and sends them to onboarding. */
export async function startPayoutOnboardingAction() {
  const seller = await requireSeller();
  if (env().PAYMENTS_DRIVER === 'mock' && !mockPaymentsReachable())
    redirect('/studio/payouts?unavailable=1');
  const [m] = await sql()<{ stripeAccountId: string | null; displayName: string; email: string }[]>`
    select m.stripe_account_id, m.display_name, u.email from public.makers m join public.users u on u.id = m.user_id
    where m.id = ${seller.makerId}`;
  let accountId = m!.stripeAccountId;
  if (!accountId) {
    const account = await payments().createExpressAccount({
      email: m!.email,
      makerId: seller.makerId,
      businessName: m!.displayName,
    });
    accountId = account.id;
    // Platform-managed column: written with the service role, never by the seller directly.
    await sql()`update public.makers set stripe_account_id = ${accountId} where id = ${seller.makerId}`;
    await audit(
      'connect.account_created',
      { type: 'maker', id: seller.makerId },
      { accountId },
      seller.id,
    );
  }
  const base = env().APP_URL;
  const link = await payments().createAccountLink(
    accountId,
    `${base}/seller/payouts?refresh=1`,
    `${base}/seller/payouts?return=1`,
  );
  redirect(link.url);
}

export async function openStripeDashboardAction() {
  const seller = await requireSeller();
  const [m] = await sql()<
    { stripeAccountId: string | null }[]
  >`select stripe_account_id from public.makers where id = ${seller.makerId}`;
  if (!m?.stripeAccountId) redirect('/studio/payouts');
  const link = await payments().createLoginLink(m.stripeAccountId);
  redirect(link.url);
}

/** On return from Stripe onboarding, re-check the account directly (don't wait for the webhook). */
export async function syncStripeAccount(makerId: string) {
  const [m] = await sql()<
    { stripeAccountId: string | null }[]
  >`select stripe_account_id from public.makers where id = ${makerId}`;
  if (!m?.stripeAccountId) return;
  const a = await payments().retrieveAccount(m.stripeAccountId);
  await sql()`update public.makers set stripe_onboarding_complete = ${a.detailsSubmitted}, stripe_payouts_enabled = ${a.payoutsEnabled},
              stripe_charges_enabled = ${a.chargesEnabled},
              bank_name = coalesce(${a.bankName}, bank_name), bank_last4 = coalesce(${a.bankLast4}, bank_last4)
              where id = ${makerId}`;
  await goLiveIfReady(makerId);
}

export async function commissionResponseAction(form: FormData) {
  const seller = await requireSeller();
  const { requestId, decision } = z
    .object({ requestId: z.string().uuid(), decision: z.enum(['accept', 'decline']) })
    .parse(Object.fromEntries(form));
  await respondToCommission(seller, requestId, decision);
  revalidatePath(`/studio/commissions/${requestId}`);
}

export async function quoteAction(_prev: FormState, form: FormData): Promise<FormState> {
  const seller = await requireSeller();
  const parsed = commissionQuoteSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await createQuote(seller, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath(`/studio/commissions/${parsed.data.requestId}`);
  return { ok: true, message: 'Quote sent — the buyer has been emailed.' };
}

export async function saveTemplateAction(form: FormData) {
  const seller = await requireSeller();
  const input = z
    .object({ title: z.string().trim().min(1).max(60), body: z.string().trim().min(1).max(1000) })
    .parse(Object.fromEntries(form));
  await withUser(
    seller,
    (db) => db`
    insert into public.reply_templates (maker_id, title, body) values (${seller.makerId}, ${sanitizeText(input.title)}, ${sanitizeText(input.body)})`,
  );
  revalidatePath('/studio/messages');
}

export async function deleteTemplateAction(form: FormData) {
  const seller = await requireSeller();
  const id = z.string().uuid().parse(form.get('id'));
  await withUser(seller, (db) => db`delete from public.reply_templates where id = ${id}`);
  revalidatePath('/studio/messages');
}
