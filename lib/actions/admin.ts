'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { isOwnImageUrl } from '@/lib/storage';
import {
  reorderCollections,
  setCollectionHero,
  createSeller,
  saveCollection,
  savePlacement,
  sendManualEmail,
  setCollectionProduct,
  setFeatured,
  setListingStatus,
  setMakerStatus,
} from '@/lib/services/admin';
import { saveHomeFeature, stopHomeFeature } from '@/lib/services/home-feature';
import { refundOrderItem } from '@/lib/services/webhook';
import {
  collectionSchema,
  createSellerSchema,
  fieldErrors,
  type FormState,
} from '@/lib/validation';
import { toFormState } from './util';

const uuid = z.string().uuid();
const reason = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => v || undefined);

export async function createSellerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = createSellerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await createSeller(admin.id, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/admin/makers');
  return {
    ok: true,
    message: `Seller account created and invite emailed to ${parsed.data.email}.`,
  };
}

export async function makerStatusAction(form: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({ makerId: uuid, status: z.enum(['approved', 'paused', 'pending']), reason })
    .parse(Object.fromEntries(form));
  await setMakerStatus(admin.id, input.makerId, input.status, input.reason);
  revalidatePath('/admin/makers');
}

export async function listingStatusAction(form: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      productId: uuid,
      status: z.enum(['approved', 'rejected', 'archived', 'feature', 'unfeature']),
      reason,
    })
    .parse(Object.fromEntries(form));
  if (input.status === 'feature' || input.status === 'unfeature')
    await setFeatured(admin.id, input.productId, input.status === 'feature');
  else await setListingStatus(admin.id, input.productId, input.status, input.reason);
  revalidatePath('/admin/listings');
  revalidatePath('/');
}

export async function refundAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const input = z
    .object({
      orderItemId: uuid,
      amount: z.union([z.literal(''), z.coerce.number().positive()]).optional(),
      reason: z.string().trim().min(2, 'Add a reason').max(200),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success)
    return { ok: false, errors: fieldErrors(input.error), message: input.error.issues[0]?.message };
  try {
    const amountCents = input.data.amount ? Math.round(Number(input.data.amount) * 100) : undefined;
    const res = await refundOrderItem({
      orderItemId: input.data.orderItemId,
      amountCents,
      reason: input.data.reason,
      actorUserId: admin.id,
    });
    revalidatePath('/admin/orders');
    return {
      ok: true,
      message: `Refunded A$${(res.amountCents / 100).toFixed(2)} (${res.refundId}).`,
    };
  } catch (err) {
    if (err instanceof Error && /Refund must|not been paid|not found/.test(err.message))
      return { ok: false, message: err.message };
    return toFormState(err);
  }
}

export async function saveCollectionAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = collectionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, errors: fieldErrors(parsed.error) };
  try {
    await saveCollection(admin.id, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/admin/collections');
  revalidatePath('/collections');
  return { ok: true, message: 'Collection saved.' };
}

export async function collectionProductAction(form: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      collectionId: uuid,
      productSlug: z.string().trim().min(1).max(100),
      op: z.enum(['add', 'remove']),
    })
    .parse(Object.fromEntries(form));
  await setCollectionProduct(
    admin.id,
    input.collectionId,
    input.productSlug,
    input.op === 'add',
  ).catch(() => undefined);
  revalidatePath('/admin/collections');
}

export async function placementAction(form: FormData) {
  const admin = await requireAdmin();
  const input = z
    .object({
      id: uuid,
      title: z.string().trim().min(2).max(120),
      subtitle: z.string().trim().max(200).optional(),
      href: z.string().trim().min(1).max(200),
      isActive: z
        .union([z.literal('on'), z.literal('')])
        .optional()
        .transform((v) => v === 'on'),
    })
    .parse(Object.fromEntries(form));
  await savePlacement(admin.id, input);
  revalidatePath('/admin/collections');
  revalidatePath('/');
}

export async function manualEmailAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const input = z
    .object({
      to: z.string().email(),
      subject: z.string().trim().min(2).max(200),
      body: z.string().trim().min(2).max(10_000),
    })
    .safeParse(Object.fromEntries(form));
  if (!input.success) return { ok: false, errors: fieldErrors(input.error) };
  await sendManualEmail(admin.id, input.data);
  revalidatePath('/admin/emails');
  return { ok: true, message: 'Email sent.' };
}

export async function reorderCollectionsAction(ids: string[]) {
  const admin = await requireAdmin();
  const parsed = z.array(uuid).max(200).parse(ids);
  await reorderCollections(admin.id, parsed);
  revalidatePath('/admin/collections');
  revalidatePath('/collections');
}

export async function collectionHeroAction(collectionId: string, url: string) {
  const admin = await requireAdmin();
  if (!isOwnImageUrl(url)) throw new Error('Upload the image first.');
  await setCollectionHero(admin.id, uuid.parse(collectionId), url);
  revalidatePath('/admin/collections');
  revalidatePath('/collections');
}

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .or(z.literal('').transform(() => undefined));

function refreshHome() {
  revalidateTag('home-feature');
  revalidatePath('/');
  revalidatePath('/admin/collections');
}

/** Feature a maker on the homepage hero (Homepage → Featured maker). */
export async function featureMakerAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const parsed = z
    .object({
      makerId: uuid,
      productIds: z
        .array(uuid)
        .min(2, 'Choose at least 2 pieces.')
        .max(10, 'Choose at most 10 pieces.'),
      headline: z.string().trim().max(80).optional(),
      blurb: z.string().trim().max(240).optional(),
      startsOn: day,
      endsOn: day,
    })
    .safeParse({
      makerId: form.get('makerId'),
      productIds: form.getAll('productIds').map(String),
      headline: form.get('headline') ?? undefined,
      blurb: form.get('blurb') ?? undefined,
      startsOn: form.get('startsOn') ?? undefined,
      endsOn: form.get('endsOn') ?? undefined,
    });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first?.message ?? 'Check the form and try again.' };
  }
  try {
    await saveHomeFeature(admin.id, parsed.data);
  } catch (err) {
    return toFormState(err);
  }
  refreshHome();
  return { ok: true, message: 'Featured on the homepage. It can take up to a minute to show.' };
}

export async function stopFeatureAction(form: FormData) {
  const admin = await requireAdmin();
  await stopHomeFeature(admin.id, uuid.parse(form.get('id')));
  refreshHome();
}
