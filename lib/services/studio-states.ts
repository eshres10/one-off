import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { audit } from '@/lib/audit';
import { emails } from '@/lib/email/templates';
import { sendEmail } from '@/lib/email/send';
import { sanitizeText } from '@/lib/domain/moderation';
import { isOwnImageUrl } from '@/lib/storage';
import { UserError } from './errors';

/** Pieces a shop usually needs before its first order. */
export const FIRST_ORDER_PIECES = 6;

export interface FirstOrderChecklist {
  payouts: boolean;
  livePieces: number;
  sharedLink: boolean;
  madeToOrder: boolean;
  slug: string;
  /** Founding or invited shops can send photos for the team to list. */
  canSendPhotos: boolean;
}

/** "Your first order is on its way": what's done and what's left. */
export async function firstOrderChecklist(makerId: string): Promise<FirstOrderChecklist> {
  const [row] = await sql()<FirstOrderChecklist[]>`
    select m.slug, m.stripe_charges_enabled as payouts, m.shop_link_copied_at is not null as shared_link,
      (select count(*) from public.products p where p.maker_id = m.id and p.status = 'approved')::int as live_pieces,
      (m.custom_commissions_enabled or exists (select 1 from public.products p
        where p.maker_id = m.id and p.status = 'approved' and p.product_type = 'made_to_order')) as made_to_order,
      (m.founding_number is not null or m.source = 'invite') as can_send_photos
    from public.makers m where m.id = ${makerId}`;
  if (!row) throw new UserError('Shop not found.');
  return row;
}

/** Ticks "Share your shop link" the first time the maker copies it. */
export async function markShopLinkCopied(makerId: string) {
  await sql()`update public.makers set shop_link_copied_at = coalesce(shop_link_copied_at, now()) where id = ${makerId}`;
}

/**
 * "Send us photos, we'll list it": a founding or invited maker sends photos and a note; the team
 * gets an email and lists the piece for them.
 */
export async function createListingRequest(
  maker: { id: string; makerId: string },
  input: { photoUrls: string[]; note: string },
) {
  const [shop] = await sql()<{ displayName: string; slug: string; allowed: boolean }[]>`
    select display_name, slug, (founding_number is not null or source = 'invite') as allowed
    from public.makers where id = ${maker.makerId}`;
  if (!shop?.allowed) throw new UserError('Add your piece in the editor, and we’ll take a look.');
  const photos = input.photoUrls.filter((u) => isOwnImageUrl(u)).slice(0, 12);
  if (!photos.length) throw new UserError('Add at least one photo.');
  const note = sanitizeText(input.note).trim().slice(0, 2000) || null;
  const [row] = await sql()<{ id: string }[]>`
    insert into public.listing_requests (maker_id, photo_urls, note)
    values (${maker.makerId}, ${photos}, ${note}) returning id`;
  await sendEmail(
    emails.listingRequest(env().ADMIN_NOTIFICATION_EMAIL, {
      id: row!.id,
      shop: shop.displayName,
      slug: shop.slug,
      photos: photos.length,
      note,
    }),
  );
  await audit(
    'listing_request.created',
    { type: 'maker', id: maker.makerId },
    { photos: photos.length },
    maker.id,
  );
  return row!.id;
}
