import { sizeFromUrl } from '@/lib/image-size';
import { audit } from '@/lib/audit';
import { withUser, type Db } from '@/lib/db';
import { validateLeadTime } from '@/lib/domain/leadTime';
import { sanitizeText } from '@/lib/domain/moderation';
import type { ProductType } from '@/lib/domain/types';
import { slugify, uniqueSuffix } from '@/lib/slug';
import { isOwnImageUrl } from '@/lib/storage';
import type { SessionUser } from '@/lib/auth/session';
import { UserError } from './errors';

type Actor = Pick<SessionUser, 'id' | 'role' | 'makerId'>;

export interface ListingInput {
  title: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  productType: ProductType;
  sizes: string[];
  colours: string[];
  stock: number;
  fabricComposition: string;
  careInstructions: string;
  countryOfMaking: string;
  modelHeightCm?: number;
  modelSizeWorn?: string;
  leadTimeDays?: number;
  madeToOrderOptions?: string;
  shippingPolicy?: string;
  measurements: Array<{ name: string; valueCm: number }>;
  images: Array<{ url: string; alt: string }>;
}

function assertListingRules(input: ListingInput, submit: boolean) {
  const lead = validateLeadTime(input.productType, input.leadTimeDays ?? null);
  if (lead) throw new UserError(lead);
  if (
    input.productType === 'one_of_one' &&
    (input.stock !== 1 || input.sizes.length !== 1 || input.colours.length !== 1)
  ) {
    throw new UserError('One-of-one pieces have exactly one size, one colour and a stock of 1.');
  }
  if (input.images.some((i) => !isOwnImageUrl(i.url)))
    throw new UserError('Please upload images through the listing form.');
  if (input.images.some((i) => !i.alt.trim()))
    throw new UserError('Every image needs a short description (alt text).');
  if (submit && input.images.length < 1)
    throw new UserError('Add at least one photo before submitting for review.');
  if (input.images.length > 8) throw new UserError('Add up to 8 photos.');
}

async function makerStatus(db: Db, makerId: string) {
  const [m] = await db<
    { status: string }[]
  >`select status from public.makers where id = ${makerId}`;
  return m?.status;
}

async function writeChildren(db: Db, productId: string, input: ListingInput) {
  // Variants are matched on (size, colour) so existing order/cart references stay valid.
  const existing = await db<{ id: string; size: string; colour: string | null }[]>`
    select id, size, colour from public.product_variants where product_id = ${productId}`;
  const wanted = input.sizes.flatMap((size) => input.colours.map((colour) => ({ size, colour })));
  for (const [i, w] of wanted.entries()) {
    const match = existing.find((e) => e.size === w.size && e.colour === w.colour);
    if (match) {
      await db`update public.product_variants set stock_quantity = ${input.stock}, is_active = true, sort_order = ${i} where id = ${match.id}`;
    } else {
      await db`insert into public.product_variants (product_id, size, colour, stock_quantity, sort_order)
               values (${productId}, ${w.size}, ${w.colour}, ${input.stock}, ${i})`;
    }
  }
  const keep = existing
    .filter((e) => wanted.some((w) => w.size === e.size && w.colour === e.colour))
    .map((e) => e.id);
  await db`update public.product_variants set is_active = false where product_id = ${productId}
           ${keep.length ? db`and id not in ${db(keep)}` : db``}`;

  await db`delete from public.product_images where product_id = ${productId}`;
  for (const [i, img] of input.images.entries()) {
    const storagePath = img.url.replace(/^\/api\/files\//, '');
    const size = sizeFromUrl(img.url);
    await db`insert into public.product_images (product_id, storage_path, public_url, alt_text, sort_order, width, height)
             values (${productId}, ${storagePath}, ${img.url}, ${sanitizeText(img.alt).slice(0, 200)}, ${i},
               ${size?.width ?? null}, ${size?.height ?? null})`;
  }
  await db`delete from public.product_measurements where product_id = ${productId}`;
  for (const [i, m] of input.measurements.entries()) {
    await db`insert into public.product_measurements (product_id, size, garment_measurement_name, value_cm, sort_order)
             values (${productId}, ${input.modelSizeWorn ?? input.sizes[0] ?? null}, ${sanitizeText(m.name)}, ${m.valueCm}, ${i})`;
  }
}

function productColumns(input: ListingInput) {
  return {
    title: sanitizeText(input.title),
    description: sanitizeText(input.description),
    category: input.category,
    tags: input.tags,
    colours: input.colours,
    priceCents: input.price,
    productType: input.productType,
    fabricComposition: sanitizeText(input.fabricComposition),
    careInstructions: sanitizeText(input.careInstructions),
    countryOfMaking: sanitizeText(input.countryOfMaking || 'Australia'),
    modelHeightCm: input.modelHeightCm ?? null,
    modelSizeWorn: input.modelSizeWorn ?? null,
    leadTimeDays: input.productType === 'made_to_order' ? (input.leadTimeDays ?? null) : null,
    madeToOrderOptions:
      input.productType === 'made_to_order' ? (input.madeToOrderOptions ?? null) : null,
    shippingPolicy: input.shippingPolicy ?? null,
  };
}

export async function createListing(
  seller: Actor,
  input: ListingInput,
  submit: boolean,
): Promise<string> {
  if (!seller.makerId) throw new UserError('Seller profile not found.');
  assertListingRules(input, submit);
  const id = await withUser(seller, async (db) => {
    const status =
      submit && (await makerStatus(db, seller.makerId!)) === 'approved' ? 'pending' : 'draft';
    const slug = `${slugify(input.title)}-${uniqueSuffix()}`;
    const cols = productColumns(input);
    const [row] = await db<{ id: string }[]>`
      insert into public.products ${db({ ...cols, makerId: seller.makerId!, slug, status } as never)}
      returning id`;
    await writeChildren(db, row!.id, input);
    return row!.id;
  });
  await audit('listing.created', { type: 'product', id }, { submit }, seller.id);
  return id;
}

export async function updateListing(
  seller: Actor,
  productId: string,
  input: ListingInput,
  submit: boolean,
) {
  assertListingRules(input, submit);
  await withUser(seller, async (db) => {
    const [current] = await db<
      { status: string }[]
    >`select status from public.products where id = ${productId} for update`;
    if (!current) throw new UserError('Listing not found.');
    let status = current.status;
    if (submit && ['draft', 'rejected'].includes(current.status)) {
      status = (await makerStatus(db, seller.makerId!)) === 'approved' ? 'pending' : 'draft';
    }
    await db`update public.products set ${db({ ...productColumns(input), status } as never)} where id = ${productId}`;
    await writeChildren(db, productId, input);
    if (current.status === 'approved') {
      await audit(
        'listing.edited_after_approval',
        { type: 'product', id: productId },
        {},
        seller.id,
        db,
      );
    }
  });
  await audit('listing.updated', { type: 'product', id: productId }, { submit }, seller.id);
}

export async function archiveListing(seller: Actor, productId: string) {
  const rows = await withUser(
    seller,
    (db) => db`update public.products set status = 'archived' where id = ${productId} returning id`,
  );
  if (!rows.length) throw new UserError('Listing not found.');
  await audit('listing.archived', { type: 'product', id: productId }, {}, seller.id);
}

export async function duplicateListing(seller: Actor, productId: string): Promise<string> {
  const id = await withUser(seller, async (db) => {
    const [p] = await db<
      { title: string }[]
    >`select title from public.products where id = ${productId}`;
    if (!p) throw new UserError('Listing not found.');
    const title = `${p.title} (copy)`.slice(0, 120);
    const [row] = await db<{ id: string }[]>`
      insert into public.products (maker_id, slug, title, description, category, tags, colours, price_cents, product_type, status,
        fabric_composition, care_instructions, country_of_making, model_height_cm, model_size_worn, lead_time_days,
        made_to_order_options, shipping_policy, return_policy)
      select maker_id, ${`${slugify(title)}-${uniqueSuffix()}`}, ${title}, description, category, tags, colours, price_cents,
        product_type, 'draft', fabric_composition, care_instructions, country_of_making, model_height_cm, model_size_worn,
        lead_time_days, made_to_order_options, shipping_policy, return_policy
      from public.products where id = ${productId}
      returning id`;
    const newId = row!.id;
    await db`insert into public.product_variants (product_id, size, colour, price_cents, stock_quantity, is_active, low_stock_threshold, sort_order)
             select ${newId}, size, colour, price_cents, stock_quantity, is_active, low_stock_threshold, sort_order
             from public.product_variants where product_id = ${productId} and is_active`;
    await db`insert into public.product_images (product_id, storage_path, public_url, alt_text, sort_order, width, height)
             select ${newId}, storage_path, public_url, alt_text, sort_order, width, height from public.product_images where product_id = ${productId}`;
    await db`insert into public.product_measurements (product_id, size, garment_measurement_name, value_cm, notes, sort_order)
             select ${newId}, size, garment_measurement_name, value_cm, notes, sort_order from public.product_measurements where product_id = ${productId}`;
    return newId;
  });
  await audit('listing.duplicated', { type: 'product', id }, { from: productId }, seller.id);
  return id;
}

/** Listing for the seller edit form (RLS: only the owner can read drafts). */
export async function getListingForEdit(seller: Actor, productId: string) {
  return withUser(seller, async (db) => {
    const [p] = await db<
      Record<string, unknown>[]
    >`select * from public.products where id = ${productId}`;
    if (!p) return null;
    const variants = await db<
      { size: string; colour: string | null; stockQuantity: number; isActive: boolean }[]
    >`
      select size, colour, stock_quantity, is_active from public.product_variants where product_id = ${productId} order by sort_order`;
    const images = await db<{ url: string; alt: string }[]>`
      select public_url as url, alt_text as alt from public.product_images where product_id = ${productId} order by sort_order`;
    const measurements = await db<{ name: string; valueCm: string }[]>`
      select garment_measurement_name as name, value_cm from public.product_measurements where product_id = ${productId} order by sort_order`;
    return { product: p, variants, images, measurements };
  });
}
