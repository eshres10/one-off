'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/session';
import { createShop, sendInvite } from '@/lib/services/concierge';
import type { FormState } from '@/lib/validation';
import { toFormState } from './util';

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export async function createShopAction(_prev: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  let id: string;
  try {
    id = await createShop(admin, {
      name: text(form, 'name'),
      slug: text(form, 'slug'),
      suburb: text(form, 'suburb'),
      state: text(form, 'state'),
      instagram: text(form, 'instagram'),
      tagline: text(form, 'tagline'),
      story: text(form, 'story'),
      avatarUrl: text(form, 'avatarUrl'),
      bannerUrl: text(form, 'bannerUrl'),
      email: text(form, 'email'),
    });
  } catch (err) {
    return toFormState(err);
  }
  revalidatePath('/admin/shops');
  redirect(`/admin/shops/${id}`);
}

export async function sendInviteAction(
  _prev: (FormState & { url?: string }) | undefined,
  form: FormData,
): Promise<FormState & { url?: string }> {
  const admin = await requireAdmin();
  const id = z.string().uuid().safeParse(form.get('makerId'));
  if (!id.success) return { ok: false, message: 'Shop not found.' };
  try {
    const { url } = await sendInvite(admin, id.data);
    revalidatePath(`/admin/shops/${id.data}`);
    revalidatePath('/admin/shops');
    return { ok: true, message: 'Invite sent.', url };
  } catch (err) {
    return toFormState(err) ?? { ok: false };
  }
}
