import { createHash } from 'node:crypto';
import type postgres from 'postgres';
import { PRODUCTS, MAKERS, seedId } from './seed-data';

type Sql = postgres.Sql | postgres.TransactionSql;
type UpsertUser = (
  db: Sql,
  id: string,
  email: string,
  name: string,
  role: string,
  hash: string,
) => Promise<void>;

const DAY = 86_400_000;
const ago = (days: number, hour = 10) => {
  const d = new Date(Date.now() - days * DAY);
  d.setUTCHours(hour - 11, 0, 0, 0); // roughly that hour in Melbourne
  return d;
};
/** Today's date in Melbourne, shifted by `days`, as YYYY-MM-DD. */
const melbourneDate = (days = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(
    new Date(Date.now() + days * DAY),
  );

/** The invited demo shop's claim token (local and e2e only; never used in production). */
export const DEMO_INVITE_TOKEN = process.env.SEED_INVITE_TOKEN ?? 'demo-invite-mira-atelier';
export const DEMO_INVITED_SHOP = {
  id: seedId('maker:mira-atelier'),
  slug: 'mira-atelier',
  displayName: 'Mira Atelier',
  email: 'mira@atelier.test',
};

export const DEMO_BUYER = {
  id: seedId('buyer:amelia-rossi'),
  email: 'amelia.rossi@buyer.test',
  name: 'Amelia Rossi',
};

const halde = MAKERS.find((m) => m.slug === 'halde-studio')!;
const product = (slug: string) => {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`No seeded product ${slug}`);
  return p;
};

interface DemoOrder {
  number: number;
  slug: string;
  size: string;
  buyer: { name: string; email: string; suburb: string; state: string; postcode: string };
  status: 'paid' | 'making' | 'ready' | 'shipped' | 'delivered' | 'completed' | 'issue';
  placedDaysAgo: number;
  shipBy: number; // days from today (Melbourne)
  mtoStep?: number;
  giftNote?: string;
  shippedDaysAgo?: number;
  deliveredDaysAgo?: number;
}

const ORDERS: DemoOrder[] = [
  {
    number: 1047,
    slug: 'butter-silk-slip',
    size: '10',
    buyer: {
      name: DEMO_BUYER.name,
      email: DEMO_BUYER.email,
      suburb: 'Fitzroy',
      state: 'VIC',
      postcode: '3065',
    },
    status: 'paid',
    placedDaysAgo: 1,
    shipBy: 0,
    giftNote: 'Happy 30th, Mel! Wear it somewhere wonderful. Love, Amelia x',
  },
  {
    number: 1046,
    slug: 'rosalind-tiered-maxi',
    size: '12',
    buyer: {
      name: 'Grace Liu',
      email: 'grace.liu@buyer.test',
      suburb: 'Paddington',
      state: 'NSW',
      postcode: '2021',
    },
    status: 'making',
    mtoStep: 1,
    placedDaysAgo: 4,
    shipBy: 10,
  },
  {
    number: 1045,
    slug: 'saffron-column-slip',
    size: '8',
    buyer: {
      name: 'Isla Martin',
      email: 'isla.martin@buyer.test',
      suburb: 'New Farm',
      state: 'QLD',
      postcode: '4005',
    },
    status: 'ready',
    mtoStep: 3,
    placedDaysAgo: 13,
    shipBy: 1,
  },
  {
    number: 1044,
    slug: 'navy-satin-slip',
    size: '8',
    buyer: {
      name: 'Zoe Clarke',
      email: 'zoe.clarke@buyer.test',
      suburb: 'Northcote',
      state: 'VIC',
      postcode: '3070',
    },
    status: 'shipped',
    placedDaysAgo: 5,
    shipBy: -3,
    shippedDaysAgo: 2,
  },
  {
    number: 1043,
    slug: 'elsie-shirt-dress',
    size: '12',
    buyer: {
      name: 'Hannah Lee',
      email: 'hannah.lee@buyer.test',
      suburb: 'Norwood',
      state: 'SA',
      postcode: '5067',
    },
    status: 'delivered',
    placedDaysAgo: 8,
    shipBy: -6,
    shippedDaysAgo: 6,
    deliveredDaysAgo: 1,
  },
  {
    number: 1042,
    slug: 'butter-silk-slip',
    size: '12',
    buyer: {
      name: 'Olivia Brown',
      email: 'olivia.brown@buyer.test',
      suburb: 'Carlton',
      state: 'VIC',
      postcode: '3053',
    },
    status: 'completed',
    placedDaysAgo: 16,
    shipBy: -14,
    shippedDaysAgo: 14,
    deliveredDaysAgo: 11,
  },
  {
    number: 1041,
    slug: 'navy-satin-slip',
    size: '10',
    buyer: {
      name: 'Chloe Wilson',
      email: 'chloe.wilson@buyer.test',
      suburb: 'Hobart',
      state: 'TAS',
      postcode: '7000',
    },
    status: 'issue',
    placedDaysAgo: 12,
    shipBy: -10,
    shippedDaysAgo: 9,
    deliveredDaysAgo: 3,
  },
];

const PAYOUTS = [
  { weeksAgo: 1, amount: 39412, orders: 2 },
  { weeksAgo: 2, amount: 23218, orders: 1 },
  { weeksAgo: 3, amount: 51066, orders: 2 },
  { weeksAgo: 4, amount: 25830, orders: 1 },
  { weeksAgo: 5, amount: 47290, orders: 2 },
];

/** Most recent Thursday on or before `weeksAgo` weeks back. */
function thursday(weeksAgo: number) {
  const d = new Date(Date.now() - weeksAgo * 7 * DAY);
  while (d.getUTCDay() !== 4) d.setTime(d.getTime() - DAY);
  return d.toISOString().slice(0, 10);
}

/**
 * Studio demo: Halde Studio as founding maker Nº 07 with orders in every Studio state, payouts
 * and shipping rates; and Mira Atelier, a shop One Off set up and invited, ready to be claimed.
 */
export async function seedStudio(
  db: Sql,
  upsertUser: UpsertUser,
  hash: string,
  mockPayments: boolean,
): Promise<{ claimUrl: string }> {
  // Halde Studio: listed by One Off, claimed a month ago, still founding.
  await db`
    update public.makers set founding_number = 7, founding_until = now() + interval '58 days',
      created_by_admin = true, claimed_at = now() - interval '32 days', went_live_at = now() - interval '32 days',
      instagram = 'haldestudio', tags = ${['Slips', 'Bias cut', 'Silk', 'Made to order']},
      dispatch_option = '1–2 days', mto_default_lead = '2 weeks', mto_weekly_capacity = 4,
      custom_from_cents = 38000, custom_deposit_pct = 30, custom_reply_within = '2 days',
      custom_blurb = 'Slips cut to your measurements in a fabric you choose from our swatch book.',
      care_default = 'Hand wash cold or dry clean. Dry flat in the shade. Cool iron on the reverse.',
      bank_name = ${mockPayments ? 'Commonwealth Bank' : null}, bank_last4 = ${mockPayments ? '4821' : null},
      shop_status = 'live', claim_step = 5
    where id = ${halde.id}`;
  for (const [region, standard, express, enabled] of [
    ['same_state', 900, 1600, true],
    ['au', 1200, 2000, true],
    ['nz', 2800, null, false],
  ] as const) {
    await db`
      insert into public.maker_shipping_rates (maker_id, region, standard_cents, express_cents, enabled)
      values (${halde.id}, ${region}, ${standard}, ${express}, ${enabled})
      on conflict (maker_id, region) do update set standard_cents = excluded.standard_cents,
        express_cents = excluded.express_cents, enabled = excluded.enabled`;
  }
  // Everything but the shirt dress was listed by One Off; the maker has checked them.
  await db`
    update public.products set listed_by_admin = (slug <> 'elsie-shirt-dress'),
      reviewed_by_seller_at = now() - interval '32 days', mto_lead = case when product_type = 'made_to_order' then '2 weeks' end,
      mto_capacity = case when product_type = 'made_to_order' then 3 end, accepts_custom = (product_type = 'made_to_order')
    where maker_id = ${halde.id}`;
  // A draft One Off prepared that the maker hasn't published yet.
  const draftId = seedId('product:halde-corset-front-mini');
  await db`
    insert into public.products (id, maker_id, slug, title, description, category, tags, colours, price_cents, product_type,
      status, fabric_composition, care_instructions, listed_by_admin, occasions)
    values (${draftId}, ${halde.id}, 'halde-corset-front-mini', 'Corset-front mini',
      'A short bias-cut mini with a lace-up corset front.', 'dresses', ${['mini', 'corset']}, ${['Navy']}, 21000,
      'ready_to_ship', 'draft', 'Silk satin', 'Hand wash cold.', true, ${['party']})
    on conflict (id) do update set status = 'draft'`;
  await db`
    insert into public.product_images (id, product_id, storage_path, public_url, alt_text, sort_order, width, height)
    values (${seedId('image:halde-corset-front-mini')}, ${draftId}, 'seed/corset-front-mini.jpg',
      '/seed/corset-front-mini.jpg', 'Navy corset-front mini dress', 0, 933, 1400)
    on conflict (id) do nothing`;
  for (const [i, size] of ['6', '8', '10', '12'].entries()) {
    await db`
      insert into public.product_variants (id, product_id, size, colour, stock_quantity, is_active, sort_order)
      values (${seedId(`variant:halde-corset:${size}`)}, ${draftId}, ${size}, 'Navy', ${i === 3 ? 0 : 2}, true, ${i})
      on conflict (id) do nothing`;
  }
  // One size nearly gone, for "Low stock".
  await db`
    update public.product_variants set stock_quantity = 1
    where product_id = ${product('navy-satin-slip').id} and size = '14'`;

  // Older orders from the general seed are history now: paid out and completed.
  await db`
    update public.fulfilments set status = 'completed',
      shipped_at = coalesce(shipped_at, created_at + interval '2 days'),
      delivered_at = coalesce(delivered_at, created_at + interval '7 days'),
      transfer_released_at = coalesce(transfer_released_at, created_at + interval '10 days'),
      commission_pct_applied = coalesce(commission_pct_applied, 15)
    where maker_id = ${halde.id} and status <> 'completed' and order_id not in (
      select id from public.orders where order_number in ${db(ORDERS.map((o) => `OO-${o.number}`))})`;

  await upsertUser(db, DEMO_BUYER.id, DEMO_BUYER.email, DEMO_BUYER.name, 'buyer', hash);

  for (const o of ORDERS) {
    const p = product(o.slug);
    const variant = p.variants.find((v) => v.size === o.size) ?? p.variants[0]!;
    const orderId = seedId(`studio-order:${o.number}`);
    const fulfilmentId = seedId(`studio-fulfilment:${o.number}`);
    const shipping = p.priceCents >= (halde.freeShippingOverCents ?? Infinity) ? 0 : 1200;
    const total = p.priceCents + shipping;
    const fee = Math.round(total * 0.0175) + 30;
    const net = p.priceCents + shipping - fee; // founding: 0% commission
    const placed = ago(o.placedDaysAgo, 9 + (o.number % 6));
    const shippedAt = o.shippedDaysAgo !== undefined ? ago(o.shippedDaysAgo, 15) : null;
    const deliveredAt = o.deliveredDaysAgo !== undefined ? ago(o.deliveredDaysAgo, 13) : null;
    const isMto = p.productType === 'made_to_order';
    const tracking = shippedAt ? `33LGV${(5_000_000 + o.number * 37).toString()}01000931509` : null;
    const buyerId =
      o.buyer.email === DEMO_BUYER.email ? DEMO_BUYER.id : seedId(`studio-buyer:${o.buyer.email}`);
    if (buyerId !== DEMO_BUYER.id)
      await upsertUser(db, buyerId, o.buyer.email, o.buyer.name, 'buyer', hash);
    const address = {
      name: o.buyer.name,
      line1: `${o.number % 90} ${o.buyer.suburb === 'Fitzroy' ? 'Gertrude St' : 'Main St'}`,
      city: o.buyer.suburb,
      state: o.buyer.state,
      postal_code: o.buyer.postcode,
      country: 'AU',
    };
    const fStatus = o.status;
    const itemStatus = ['making', 'ready', 'issue'].includes(fStatus)
      ? fStatus === 'issue'
        ? 'delivered'
        : 'preparing'
      : fStatus;
    await db`
      insert into public.orders (id, order_number, buyer_user_id, buyer_email, buyer_name, status, subtotal_cents,
        shipping_total_cents, total_cents, platform_fee_total_cents, stripe_checkout_session_id, stripe_payment_intent_id,
        stripe_charge_id, shipping_address, paid_at, created_at, gift_note, returns_ack_at, returns_policy_version)
      values (${orderId}, ${`OO-${o.number}`}, ${buyerId}, ${o.buyer.email}, ${o.buyer.name}, 'paid', ${p.priceCents},
        ${shipping}, ${total}, 0, ${`cs_studio_${o.number}`}, ${`pi_studio_${o.number}`}, ${`ch_studio_${o.number}`},
        ${db.json(address)}, ${placed}, ${placed}, ${o.giftNote ?? null}, ${placed}, 'v1')
      on conflict (id) do update set gift_note = excluded.gift_note`;
    await db`
      insert into public.fulfilments (id, order_id, maker_id, status, subtotal_cents, shipping_cents, platform_commission_cents,
        seller_net_cents, processing_fee_cents, commission_pct_applied, transfer_status, stripe_transfer_id, transfer_released_at,
        tracking_number, carrier, estimated_dispatch_date, estimated_delivery_from, estimated_delivery_to, shipped_at,
        delivered_at, delivery_source, mto_step, shipping_method, created_at, reply_token)
      values (${fulfilmentId}, ${orderId}, ${halde.id}, ${fStatus}::fulfilment_status, ${p.priceCents}, ${shipping}, 0, ${net}, ${fee},
        0, ${fStatus === 'completed' ? 'created' : 'pending'}, ${fStatus === 'completed' ? `tr_studio_${o.number}` : null},
        ${fStatus === 'completed' ? ago(o.deliveredDaysAgo! - 3) : null}, ${tracking}, ${tracking ? 'auspost' : null},
        ${melbourneDate(o.shipBy)}, ${melbourneDate(o.shipBy + 2)}, ${melbourneDate(o.shipBy + 6)}, ${shippedAt}, ${deliveredAt},
        ${deliveredAt ? 'carrier' : null}, ${isMto ? (o.mtoStep ?? 0) : 0},
        ${shipping ? 'Standard tracked' : 'Free tracked shipping'}, ${placed}, ${`demo${o.number}`})
      on conflict (id) do update set status = excluded.status, mto_step = excluded.mto_step,
        estimated_dispatch_date = excluded.estimated_dispatch_date, shipped_at = excluded.shipped_at,
        delivered_at = excluded.delivered_at`;
    const itemId = seedId(`studio-item:${o.number}`);
    await db`
      insert into public.order_items (id, order_id, fulfilment_id, product_id, variant_id, maker_id, product_title, variant_label,
        product_type, image_url, quantity, unit_price_cents, line_total_cents, platform_commission_cents, seller_net_cents,
        fulfilment_status, tracking_number, carrier, shipped_at, delivered_at, created_at)
      values (${itemId}, ${orderId}, ${fulfilmentId}, ${p.id}, ${variant.id}, ${halde.id}, ${p.title}, ${`AU ${variant.size}`},
        ${p.productType}::product_type,
        (select public_url from public.product_images where product_id = ${p.id} order by sort_order limit 1), 1, ${p.priceCents}, ${p.priceCents}, 0, ${p.priceCents},
        ${itemStatus}::fulfilment_status, ${tracking}, ${tracking ? 'auspost' : null}, ${shippedAt}, ${deliveredAt}, ${placed})
      on conflict (id) do update set image_url = excluded.image_url`;
    if (o.status === 'issue') {
      await db`
        insert into public.return_claims (id, order_id, order_item_id, buyer_id, seller_id, reason, details, photos, respond_by,
          created_at, status, proposal, seller_response, seller_responded_at)
        values (${seedId(`studio-claim:${o.number}`)}, ${orderId}, ${itemId}, ${buyerId}, ${halde.id}, 'faulty',
          'One of the shoulder straps has come away from the bodice at the back seam after the first wear.',
          ${['claims/demo/strap.jpg']}, now() + interval '1 day', now() - interval '1 day', 'seller_responded', 'repair',
          'So sorry! Post it back with the prepaid label and I’ll restitch the strap this week.', now() - interval '20 hours')
        on conflict (id) do nothing`;
    }
  }

  for (const [i, po] of PAYOUTS.entries()) {
    await db`
      insert into public.payouts (id, maker_id, stripe_payout_id, amount_cents, arrival_date, status, order_count,
        sales_cents, fees_cents, created_at)
      values (${seedId(`studio-payout:${i}`)}, ${halde.id}, ${`po_studio_${i + 1}`}, ${po.amount}, ${thursday(po.weeksAgo)},
        'paid', ${po.orders}, ${po.amount + Math.round(po.amount * 0.02)}, ${Math.round(po.amount * 0.02)},
        ${new Date(`${thursday(po.weeksAgo)}T00:00:00Z`)})
      on conflict (id) do nothing`;
  }

  // Mira Atelier: set up by One Off, three pieces listed, invite sent and waiting.
  const mira = DEMO_INVITED_SHOP;
  await db`
    insert into public.makers (id, user_id, slug, display_name, tagline, story, location, city, state, avatar_url, cover_url,
      status, shop_status, created_by_admin, invite_email, founding_number, instagram, lead_time_days, dispatch_days)
    values (${mira.id}, null, ${mira.slug}, ${mira.displayName}, 'Draped satin for long evenings.',
      'Mira drapes every piece on the stand in her Footscray studio before a single cut is made.',
      'Footscray, Melbourne', 'Melbourne', 'VIC', '/seed/maker-mara-kovac.jpg', '/seed/draped-satin-midi.jpg',
      'draft', 'invited', true, ${mira.email}, 8, 'mira.atelier', 14, 3)
    on conflict (id) do update set shop_status = 'invited', user_id = null, status = 'draft', claimed_at = null,
      went_live_at = null, founding_until = null, claim_step = 0, stripe_account_id = null,
      stripe_charges_enabled = false, stripe_payouts_enabled = false, stripe_onboarding_complete = false`;
  const miraPieces = [
    {
      slug: 'mira-draped-satin-midi',
      title: 'Draped Satin Midi',
      photo: 'draped-satin-midi',
      price: 32000,
      type: 'ready_to_ship',
    },
    {
      slug: 'mira-lace-trim-maxi',
      title: 'Lace Trim Maxi',
      photo: 'lace-trim-maxi-dress',
      price: 36000,
      type: 'made_to_order',
    },
    {
      slug: 'mira-open-back-jumpsuit',
      title: 'Open-Back Jumpsuit',
      photo: 'satin-open-back-jumpsuit',
      price: 29000,
      type: 'ready_to_ship',
    },
  ];
  for (const [k, piece] of miraPieces.entries()) {
    const id = seedId(`product:${piece.slug}`);
    await db`
      insert into public.products (id, maker_id, slug, title, description, category, colours, price_cents, product_type, status,
        fabric_composition, care_instructions, lead_time_days, listed_by_admin, keep_on_claim, mto_lead)
      values (${id}, ${mira.id}, ${piece.slug}, ${piece.title},
        ${`${piece.title} in heavy satin, draped and finished by hand in Footscray. Fully lined, invisible side zip.`},
        'dresses', ${['Chocolate']}, ${piece.price}, ${piece.type}::product_type, 'draft', 'Satin', 'Dry clean only.',
        ${piece.type === 'made_to_order' ? 14 : null}, true, true, ${piece.type === 'made_to_order' ? '2 weeks' : null})
      on conflict (id) do update set status = 'draft', reviewed_by_seller_at = null, keep_on_claim = true`;
    await db`
      insert into public.product_images (id, product_id, storage_path, public_url, alt_text, sort_order, width, height)
      values (${seedId(`image:${piece.slug}`)}, ${id}, ${`seed/${piece.photo}.jpg`}, ${`/seed/${piece.photo}.jpg`},
        ${piece.title}, 0, 933, 1400)
      on conflict (id) do nothing`;
    for (const [i, size] of ['8', '10', '12'].entries()) {
      await db`
        insert into public.product_variants (id, product_id, size, colour, stock_quantity, is_active, sort_order)
        values (${seedId(`variant:${piece.slug}:${size}`)}, ${id}, ${size}, 'Chocolate',
          ${piece.type === 'made_to_order' ? 20 : 2}, true, ${i + k * 0})
        on conflict (id) do nothing`;
    }
  }
  const tokenHash = createHash('sha256').update(DEMO_INVITE_TOKEN).digest('hex');
  await db`delete from public.shop_invites where maker_id = ${mira.id}`;
  await db`
    insert into public.shop_invites (maker_id, token_hash, email, expires_at)
    values (${mira.id}, ${tokenHash}, ${mira.email}, now() + interval '7 days')`;
  return { claimUrl: `/claim/${DEMO_INVITE_TOKEN}` };
}
