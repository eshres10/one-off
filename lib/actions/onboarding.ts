'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import {
  pickerPieces,
  removeTasteTag,
  savePrefs,
  setPick,
  type PickerPiece,
} from '@/lib/services/taste';
import {
  HEIGHT_BANDS,
  ONBOARDING_SIZES,
  OCCASIONS,
  topTags,
  type StyleTag,
} from '@/lib/taste/tags';

const sizes = z.array(z.enum(ONBOARDING_SIZES)).min(1).max(ONBOARDING_SIZES.length);
const heightBand = z.enum(HEIGHT_BANDS.map((h) => h.value) as [string, ...string[]]).nullable();
const occasions = z
  .array(z.enum(OCCASIONS.map((o) => o.value) as [string, ...string[]]))
  .min(1)
  .max(OCCASIONS.length);
const uuid = z.string().uuid();

/** Step 1: sizes (at least one) and an optional height band. */
export async function saveFitAction(input: { sizes: string[]; heightBand: string | null }) {
  const user = await requireUser('/welcome');
  await savePrefs(user, {
    sizes: sizes.parse(input.sizes),
    heightBand: heightBand.parse(input.heightBand),
    onboardingStep: 1,
  });
  return { ok: true };
}

/** Step 2: occasions (at least one). */
export async function saveOccasionsAction(input: { occasions: string[] }) {
  const user = await requireUser('/welcome');
  await savePrefs(user, { occasions: occasions.parse(input.occasions), onboardingStep: 2 });
  return { ok: true };
}

/** Step 3: toggles a pick in the taste picker; returns the live "Your style" tags. */
export async function togglePickAction(
  productId: string,
  picked: boolean,
): Promise<{ top: StyleTag[] }> {
  const user = await requireUser('/welcome');
  const weights = await setPick(user, uuid.parse(productId), z.boolean().parse(picked));
  revalidatePath('/saved');
  return { top: topTags(weights, 3) };
}

/** "Show me different pieces": the next twelve, none already shown. */
export async function morePiecesAction(shown: string[]): Promise<PickerPiece[]> {
  const user = await requireUser('/welcome');
  return pickerPieces(user.id, z.array(uuid).max(500).parse(shown));
}

/** Marks a step done (the picker, makers and the how-it-works cards). */
export async function stepDoneAction(step: number) {
  const user = await requireUser('/welcome');
  const n = z.number().int().min(1).max(6).parse(step);
  await savePrefs(user, { onboardingStep: n, completed: n >= 5 });
  return { ok: true };
}

/** Account → Your style: remove a tag from the taste profile. */
export async function removeStyleTagAction(form: FormData) {
  const user = await requireUser('/account/style');
  await removeTasteTag(user, String(form.get('tag') ?? ''));
  revalidatePath('/account/style');
}
