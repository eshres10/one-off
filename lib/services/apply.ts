import { audit } from '@/lib/audit';
import type { SessionUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { sanitizeText } from '@/lib/domain/moderation';
import { sendEmail } from '@/lib/email/send';
import { emails } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { SITE, STATE_CAPITAL, type MakerRegion } from '@/lib/site/config';
import { slugify } from '@/lib/slug';
import { TERMS } from '@/lib/studio/terms';
import { logShopEvent } from './concierge';
import { UserError } from './errors';
import { MAKES, SELL_MODES } from './sell';

type User = Pick<SessionUser, 'id' | 'email' | 'role' | 'makerId'>;

/** "Who makes your pieces?" */
export const MADE_BY = [
  { value: 'self', label: 'I design and make everything myself' },
  { value: 'team', label: 'A small team in my studio' },
  { value: 'workroom', label: 'I design; a local maker or workroom produces them' },
  { value: 'other', label: 'Other' },
] as const;
export type MadeBy = (typeof MADE_BY)[number]['value'];

export const DECLARATION =
  'Everything I list is designed and made by me or my team. I won’t list resold, dropshipped or mass-produced items.';

/** What a maker tells us when they apply. Saved as they go; copied on each submission. */
export interface ApplicationAnswers {
  name: string;
  ownerName: string;
  email: string;
  mobile: string;
  suburb: string;
  state: string;
  instagram: string;
  website: string;
  makes: string[];
  modes: string[];
  photos: string[];
  madeBy: MadeBy | '';
  madeByDetail: string;
  process: string;
  fabrics: string;
  declaration: boolean;
}

export const EMPTY_ANSWERS: ApplicationAnswers = {
  name: '',
  ownerName: '',
  email: '',
  mobile: '',
  suburb: '',
  state: '',
  instagram: '',
  website: '',
  makes: [],
  modes: [],
  photos: [],
  madeBy: '',
  madeByDetail: '',
  process: '',
  fabrics: '',
  declaration: false,
};

export interface Application {
  makerId: string;
  slug: string;
  shopStatus: string;
  answers: ApplicationAnswers;
  appliedAt: Date | null;
  reviewNote: string | null;
  canReapplyAfter: Date | null;
}

/** Where a maker is in applying: what /sell/apply shows them. */
export type ApplyState = 'new' | 'draft' | 'applied' | 'changes_requested' | 'declined' | 'done';

export function applyState(app: Application | null, today = new Date()): ApplyState {
  if (!app) return 'new';
  switch (app.shopStatus) {
    case 'draft':
      return 'draft';
    case 'applied':
    case 'changes_requested':
      return app.shopStatus;
    case 'declined':
      // Once the wait is over, they can apply again.
      return app.canReapplyAfter && new Date(app.canReapplyAfter) > today ? 'declined' : 'draft';
    default:
      return 'done';
  }
}

export async function myApplication(user: Pick<User, 'id'>): Promise<Application | null> {
  const [row] = await sql()<
    (Omit<Application, 'answers'> & { answers: Partial<ApplicationAnswers> })[]
  >`
    select m.id as maker_id, m.slug, m.shop_status, m.application as answers, m.applied_at, m.review_note,
      m.can_reapply_after
    from public.makers m where m.user_id = ${user.id} limit 1`;
  if (!row) return null;
  return { ...row, answers: { ...EMPTY_ANSWERS, ...row.answers } };
}

function assertEditable(app: Application | null) {
  const state = applyState(app);
  if (state === 'applied')
    throw new UserError('Your application is with us. Message us to change it.');
  if (state === 'declined') throw new UserError('You can apply again after the date shown.');
  if (state === 'done')
    throw new UserError('Your shop is already approved. Change details in Studio.');
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name).slice(0, 40) || 'studio';
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await sql()`
      select 1 from public.makers where slug = ${slug}
      union all select 1 from public.maker_slug_redirects where old_slug = ${slug}`;
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const text = (v: string, max: number) =>
  sanitizeText(v ?? '')
    .trim()
    .slice(0, max);
const handle = (v: string) =>
  (v ?? '')
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/^@/, '')
    .replace(/[^\w.]/g, '')
    .slice(0, 30);

/**
 * Step 1, "Your label". Creates the shop as a draft application the first time (the account
 * becomes a seller account so it can upload photos), then updates it.
 */
export async function saveApplicationLabel(
  user: User,
  input: Pick<
    ApplicationAnswers,
    | 'name'
    | 'ownerName'
    | 'email'
    | 'mobile'
    | 'suburb'
    | 'state'
    | 'instagram'
    | 'website'
    | 'makes'
    | 'modes'
  >,
): Promise<Application> {
  if (user.role === 'admin') throw new UserError('Admin accounts can’t apply to sell.');
  const name = text(input.name, 60);
  if (name.length < 2) throw new UserError('Add your label’s name.');
  const ownerName = text(input.ownerName, 80);
  if (ownerName.length < 2) throw new UserError('Add your name.');
  const email = (input.email || user.email).trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new UserError('Add an email we can reach you on.');
  const mobile = input.mobile
    .replace(/[^\d+ ]/g, '')
    .trim()
    .slice(0, 20);
  if (mobile.replace(/\D/g, '').length < 8) throw new UserError('Add your mobile number.');
  const suburb = text(input.suburb, 60);
  if (!suburb) throw new UserError('Add the suburb you work from.');
  if (!(SITE.makerRegions as readonly string[]).includes(input.state))
    throw new UserError('Pick your state or territory.');
  const state = input.state as MakerRegion;
  const instagram = handle(input.instagram);
  if (!instagram) throw new UserError('Add your Instagram so we can see your work.');
  let website = text(input.website, 200);
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(website))
    throw new UserError('Check your website address.');
  const makes = input.makes.filter((m) => (MAKES as readonly string[]).includes(m));
  if (!makes.length) throw new UserError('Pick what you make.');
  const modes = input.modes.filter((m) => SELL_MODES.some((x) => x.value === m));
  if (!modes.length) throw new UserError('Pick how you sell.');

  const existing = await myApplication(user);
  assertEditable(existing);
  const answers = {
    name,
    ownerName,
    email,
    mobile,
    suburb,
    state,
    instagram,
    website,
    makes,
    modes,
  };
  const location = `${suburb}, ${state}`;

  if (existing) {
    await sql()`
      update public.makers set display_name = ${name}, location = ${location}, state = ${state},
        city = coalesce(nullif(city, ''), ${STATE_CAPITAL[state]}), instagram = ${instagram}, mobile = ${mobile},
        tags = ${makes}, sell_modes = ${modes}, custom_commissions_enabled = ${modes.includes('custom')},
        application = application || ${sql().json(answers)}
      where id = ${existing.makerId}`;
  } else {
    const slug = await uniqueSlug(name);
    const makerId = await sql().begin(async (tx) => {
      const [row] = await tx<{ id: string }[]>`
        insert into public.makers (user_id, slug, display_name, location, city, state, instagram, mobile, tags, sell_modes,
          custom_commissions_enabled, status, shop_status, self_signup, source, claimed_at, application)
        values (${user.id}, ${slug}, ${name}, ${location}, ${STATE_CAPITAL[state]}, ${state}, ${instagram}, ${mobile},
          ${makes}, ${modes}, ${modes.includes('custom')}, 'draft', 'draft', true, 'application', now(),
          ${sql().json(answers)})
        returning id`;
      await tx`update public.users set role = 'seller' where id = ${user.id} and role = 'buyer'`;
      return row!.id;
    });
    await logShopEvent(makerId, 'application_started');
    await audit('shop.application_started', { type: 'maker', id: makerId }, { slug }, user.id);
  }
  await sql()`update public.users set display_name = coalesce(display_name, ${ownerName}) where id = ${user.id}`;
  return (await myApplication(user))!;
}

/** Step 2, "Show us your work". */
export async function saveApplicationWork(
  user: User,
  input: Pick<
    ApplicationAnswers,
    'photos' | 'madeBy' | 'madeByDetail' | 'process' | 'fabrics' | 'declaration'
  >,
): Promise<Application> {
  const app = await myApplication(user);
  if (!app) throw new UserError('Start with your label.');
  assertEditable(app);
  const photos = input.photos
    .filter((u) => /^(https?:\/\/|\/)[^\s]+$/.test(u))
    .slice(0, TERMS.applicationPhotos.max);
  if (photos.length < TERMS.applicationPhotos.min)
    throw new UserError(`Add at least ${TERMS.applicationPhotos.min} photos of your work.`);
  if (!MADE_BY.some((m) => m.value === input.madeBy))
    throw new UserError('Tell us who makes your pieces.');
  const madeByDetail = text(input.madeByDetail, 200);
  if (input.madeBy === 'workroom' && !madeByDetail)
    throw new UserError('Tell us which maker or workroom.');
  if (input.madeBy === 'other' && !madeByDetail)
    throw new UserError('Tell us who makes your pieces.');
  const process = text(input.process, 300);
  if (process.length < 10) throw new UserError('Tell us a little about your process.');
  if (!input.declaration) throw new UserError('Tick the declaration to continue.');
  const answers = {
    photos,
    madeBy: input.madeBy,
    madeByDetail: input.madeBy === 'workroom' || input.madeBy === 'other' ? madeByDetail : '',
    process,
    fabrics: text(input.fabrics, 300),
    declaration: true,
  };
  await sql()`update public.makers set application = application || ${sql().json(answers)} where id = ${app.makerId}`;
  return (await myApplication(user))!;
}

/** Everything needed before an application can be sent. */
export function missingAnswers(a: ApplicationAnswers): string[] {
  const missing: string[] = [];
  if (!a.name || !a.ownerName || !a.email || !a.mobile || !a.suburb || !a.state || !a.instagram)
    missing.push('label');
  if (!a.makes.length || !a.modes.length) missing.push('label');
  if (a.photos.length < TERMS.applicationPhotos.min || !a.madeBy || !a.process || !a.declaration)
    missing.push('work');
  return Array.from(new Set(missing));
}

/** Sends (or resends) the application: it joins the review queue and is kept as sent. */
export async function submitApplication(user: User): Promise<Application> {
  const app = await myApplication(user);
  if (!app) throw new UserError('Start with your label.');
  assertEditable(app);
  const missing = missingAnswers(app.answers);
  if (missing.length)
    throw new UserError(
      missing[0] === 'label' ? 'Finish “Your label” first.' : 'Finish “Show us your work” first.',
    );
  const resubmit = app.shopStatus === 'changes_requested';
  await sql().begin(async (tx) => {
    await tx`
      insert into public.shop_applications (maker_id, answers, photo_urls)
      values (${app.makerId}, ${tx.json({ ...app.answers })}, ${app.answers.photos})`;
    await tx`
      update public.makers set shop_status = 'applied', applied_at = now(), review_note = null, can_reapply_after = null
      where id = ${app.makerId}`;
  });
  await logShopEvent(app.makerId, resubmit ? 'application_resubmitted' : 'application_submitted');
  await audit('shop.applied', { type: 'maker', id: app.makerId }, { resubmit }, user.id);
  await sendEmail(
    emails.applicationNew(env().ADMIN_NOTIFICATION_EMAIL, {
      makerId: app.makerId,
      label: app.answers.name,
      owner: app.answers.ownerName,
      place: `${app.answers.suburb}, ${app.answers.state}`,
      instagram: app.answers.instagram,
      resubmit,
    }),
  );
  await sendEmail(emails.applicationReceived(app.answers.email || user.email, app.answers.name));
  return (await myApplication(user))!;
}
