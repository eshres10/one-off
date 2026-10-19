'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getSessionUser, requireUser } from '@/lib/auth/session';
import {
  acceptAgreement,
  claimShop,
  goLive,
  markPiecesReviewed,
  saveClaimShipping,
  setClaimStep,
  setKeepOnClaim,
  stripeOnboardingLink,
} from '@/lib/services/claim';
import type { FormState } from '@/lib/validation';
import { clientIp, toFormState } from './util';

const next = (step: number) => redirect(`/claim/continue?step=${step}`);
/** The agreement and shipping steps are shared with /studio/setup (steps 1 and 3 there). */
const after = (form: FormData, claimStep: number, setupStep: number) =>
  form.get('flow') === 'setup' ? redirect(`/studio/setup?step=${setupStep}`) : next(claimStep);

/** "Take a look": claims the shop for the signed-in maker and moves on to checking pieces. */
export async function claimAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getSessionUser();
  const token = String(form.get('token') ?? '');
  if (!user) redirect(`/login?next=${encodeURIComponent(`/claim/${token}`)}`);
  try {
    await claimShop(user, token);
    await setClaimStep({ ...user }, 1);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/', 'layout');
  next(1);
  return { ok: true };
}

export async function goToStepAction(form: FormData) {
  const user = await requireUser('/claim/continue');
  const step = Number(form.get('step'));
  await setClaimStep(user, step);
  next(step);
}

export async function keepPieceAction(productId: string, keep: boolean): Promise<FormState> {
  const user = await requireUser('/claim/continue');
  if (!z.string().uuid().safeParse(productId).success) return { ok: false };
  try {
    await setKeepOnClaim(user, productId, keep);
    return { ok: true };
  } catch (err) {
    return toFormState(err);
  }
}

export async function piecesReviewedAction() {
  const user = await requireUser('/claim/continue');
  await markPiecesReviewed(user);
  next(2);
}

export async function agreeAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/claim/continue');
  try {
    await acceptAgreement(user, {
      ip: clientIp(),
      userAgent: headers().get('user-agent'),
      photoRights: form.get('agree') === 'on',
    });
  } catch (err) {
    return toFormState(err);
  }
  after(form, 3, 2);
  return { ok: true };
}

export async function stripeLinkAction() {
  const user = await requireUser('/claim/continue');
  const url = await stripeOnboardingLink(user);
  redirect(url);
}

export async function shippingAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser('/claim/continue');
  const cents = (k: string) => {
    const v = String(form.get(k) ?? '').trim();
    return v === '' ? null : Math.round(Number(v) * 100);
  };
  try {
    await saveClaimShipping(user, {
      standardCents: cents('standard') ?? -1,
      expressCents: cents('express'),
      freeOver: form.get('freeOver') === 'on',
      dispatchOption: String(form.get('dispatch') ?? ''),
      mtoLead: String(form.get('mtoLead') ?? ''),
    });
  } catch (err) {
    return toFormState(err);
  }
  after(form, 5, 4);
  return { ok: true };
}

export async function goLiveAction(_prev: FormState): Promise<FormState> {
  const user = await requireUser('/claim/continue');
  try {
    await goLive(user);
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/', 'layout');
  redirect('/claim/continue?step=5&live=1');
}
