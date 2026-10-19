'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireSeller } from '@/lib/auth/session';
import { saveSettings, setShopClosed, type ShopSettings } from '@/lib/services/settings';
import { NOTIFY_EVENTS } from '@/lib/services/notifications';
import { toFormState } from './util';

const channels = z.object({ email: z.boolean(), push: z.boolean(), sms: z.boolean() });
const rate = z.object({
  region: z.enum(['same_state', 'au', 'nz']),
  standardCents: z.number().int().min(0).max(50_000),
  expressCents: z.number().int().min(0).max(50_000).nullable(),
  enabled: z.boolean(),
});
const schema = z.object({
  name: z.string().max(120),
  slug: z.string().max(80),
  suburb: z.string().max(80),
  state: z.string().max(3),
  timezone: z.string().max(40),
  instagram: z.string().max(80),
  tagline: z.string().max(200),
  story: z.string().max(5000),
  tags: z.array(z.string().max(40)).max(12),
  avatarUrl: z.string().max(500),
  bannerUrl: z.string().max(500),
  rates: z.array(rate).max(3),
  freeShipping: z.boolean(),
  freeOverCents: z.number().int().min(0).max(1_000_000),
  localPickup: z.boolean(),
  dispatchOption: z.string().max(20),
  mtoDefaultLead: z.string().max(20),
  mtoWeeklyCapacity: z.number().int().min(0).max(500).nullable(),
  acceptsCustom: z.boolean(),
  customFromCents: z.number().int().min(0).max(10_000_000).nullable(),
  customDepositPct: z.number().int().min(0).max(100).nullable(),
  customReplyWithin: z.string().max(20),
  customBlurb: z.string().max(800),
  policyExtra: z.string().max(400),
  careDefault: z.string().max(600),
  holidayOn: z.boolean(),
  holidayFrom: z.string().max(10),
  holidayUntil: z.string().max(10),
  holidayNote: z.string().max(400),
  prefs: z.object(
    Object.fromEntries(NOTIFY_EVENTS.map((e) => [e, channels])) as Record<
      (typeof NOTIFY_EVENTS)[number],
      typeof channels
    >,
  ),
  abn: z.string().max(20),
  gstRegistered: z.boolean(),
  mobile: z.string().max(20),
});

export async function saveSettingsAction(
  input: ShopSettings,
): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  const seller = await requireSeller();
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return { ok: false, message: 'Some settings aren’t valid. Check the highlighted section.' };
  try {
    const { slug } = await saveSettings(seller, { ...input, ...parsed.data });
    revalidatePath('/studio', 'layout');
    revalidatePath(`/makers/${slug}`);
    return { ok: true, slug };
  } catch (err) {
    return { ok: false, message: toFormState(err)?.message ?? 'Couldn’t save. Try again.' };
  }
}

export async function closeShopAction(closed: boolean): Promise<{ ok: boolean }> {
  const seller = await requireSeller();
  await setShopClosed(seller, closed);
  revalidatePath('/', 'layout');
  return { ok: true };
}
