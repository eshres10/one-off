/**
 * Idempotent development seed: `npm run db:seed`.
 * Uses deterministic ids and upserts, so running it repeatedly converges on the same data.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { splitOrder } from '../lib/domain/split';
import { estimateDelivery, toIsoDate } from '../lib/domain/leadTime';
import type { CartLine, MakerShipping } from '../lib/domain/types';
import {
  ADMIN,
  BUYERS,
  COLLECTIONS,
  MAKERS,
  PASSWORD,
  HEROES,
  PRODUCTS,
  rng,
  seedId,
  type ProductSeed,
} from './seed-data';

const FEE_BPS = Number(process.env.PLATFORM_FEE_BPS ?? 1500);
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n: number, hour = 10): Date {
  const d = new Date(Date.now() - n * DAY);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

type Sql = postgres.Sql | postgres.TransactionSql;

async function upsertAuthUser(db: Sql, id: string, email: string, hash: string) {
  if ((process.env.AUTH_DRIVER ?? 'local') === 'supabase') {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
      },
    );
    const { error } = await admin.auth.admin.createUser({
      id,
      email,
      password: PASSWORD,
      email_confirm: true,
    } as never);
    if (error && !/already/i.test(error.message)) throw error;
    return;
  }
  await db`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at)
    values (${id}, ${email}, ${hash}, now())
    on conflict (id) do update set email = excluded.email, encrypted_password = excluded.encrypted_password`;
}

async function upsertUser(
  db: Sql,
  id: string,
  email: string,
  name: string,
  role: string,
  hash: string,
) {
  await upsertAuthUser(db, id, email, hash);
  await db`
    insert into public.users (id, auth_user_id, email, display_name, role)
    values (${id}, ${id}, ${email}, ${name}, ${role}::user_role)
    on conflict (id) do update set email = excluded.email, display_name = excluded.display_name, role = excluded.role`;
}

async function seedProducts(db: Sql) {
  for (const p of PRODUCTS) {
    const approvedAt = daysAgo(p.createdDaysAgo);
    await db`
      insert into public.products (
        id, maker_id, slug, title, description, category, tags, colours, price_cents, product_type, status,
        is_featured, fabric_composition, care_instructions, country_of_making, model_height_cm, model_size_worn,
        lead_time_days, made_to_order_options, shipping_policy, return_policy, approved_at, created_at, occasions
      ) values (
        ${p.id}, ${p.maker.id}, ${p.slug}, ${p.title}, ${p.description}, ${p.category}, ${p.tags}, ${p.colours},
        ${p.priceCents}, ${p.productType}::product_type, 'approved', ${p.isFeatured}, ${p.fabric}, ${p.care},
        'Australia', ${p.modelHeightCm}, ${p.modelSizeWorn}, ${p.leadTimeDays}, ${p.madeToOrderOptions},
        ${'Tracked Australia Post parcel. Ships from ' + p.maker.city + '.'}, null, ${approvedAt}, ${approvedAt},
        ${p.occasions}
      )
      on conflict (id) do update set
        title = excluded.title, description = excluded.description, category = excluded.category,
        tags = excluded.tags, colours = excluded.colours, price_cents = excluded.price_cents,
        product_type = excluded.product_type, status = 'approved', is_featured = excluded.is_featured,
        fabric_composition = excluded.fabric_composition, care_instructions = excluded.care_instructions,
        model_height_cm = excluded.model_height_cm, model_size_worn = excluded.model_size_worn,
        lead_time_days = excluded.lead_time_days, made_to_order_options = excluded.made_to_order_options,
        shipping_policy = excluded.shipping_policy, approved_at = excluded.approved_at, created_at = excluded.created_at,
        occasions = excluded.occasions`;

    // Every seeded image is a placeholder, to be swapped for real maker photography.
    const imageIds = p.images.map((img) => seedId(`image:${p.slug}:${img.view}`));
    await db`delete from public.product_images where product_id = ${p.id} and not (id = any(${imageIds}::uuid[]))`;
    for (const img of p.images) {
      await db`
        insert into public.product_images (id, product_id, storage_path, public_url, alt_text, sort_order, is_placeholder)
        values (${seedId(`image:${p.slug}:${img.view}`)}, ${p.id}, ${img.path}, ${img.url}, ${img.alt}, ${img.view}, true)
        on conflict (id) do update set storage_path = excluded.storage_path, public_url = excluded.public_url,
          alt_text = excluded.alt_text, sort_order = excluded.sort_order, is_placeholder = true`;
    }
    for (const [i, v] of p.variants.entries()) {
      await db`
        insert into public.product_variants (id, product_id, size, colour, sku, stock_quantity, is_active, low_stock_threshold, sort_order)
        values (${v.id}, ${p.id}, ${v.size}, ${v.colour}, ${v.sku}, ${v.stock}, true, 2, ${i})
        on conflict (id) do update set size = excluded.size, colour = excluded.colour, sku = excluded.sku,
          stock_quantity = excluded.stock_quantity, sort_order = excluded.sort_order`;
    }
    for (const [i, m] of p.measurements.entries()) {
      await db`
        insert into public.product_measurements (id, product_id, size, garment_measurement_name, value_cm, notes, sort_order)
        values (${seedId(`measure:${p.slug}:${m.name}`)}, ${p.id}, ${p.productType === 'one_of_one' ? p.variants[0]!.size : '10'},
                ${m.name}, ${m.valueCm}, ${m.name === 'Bust' ? 'Measured flat, doubled' : null}, ${i})
        on conflict (id) do update set value_cm = excluded.value_cm, garment_measurement_name = excluded.garment_measurement_name`;
    }
  }
}

function lineFor(p: ProductSeed, variantIdx: number, quantity = 1): CartLine {
  const v = p.variants[variantIdx % p.variants.length]!;
  return {
    productId: p.id,
    variantId: v.id,
    makerId: p.maker.id,
    makerName: p.maker.displayName,
    productTitle: p.title,
    productSlug: p.slug,
    variantLabel: `AU ${v.size}${p.colours.length > 1 ? ` · ${v.colour}` : ''}`,
    productType: p.productType,
    imageUrl: p.images[0]!.url,
    quantity,
    unitPriceCents: p.priceCents,
    leadTimeDays: p.leadTimeDays,
  };
}

const REVIEW_BODIES: Array<[title: string, body: string]> = [
  [
    'Worth every cent',
    'The fabric is beautiful and the fit was spot on. The maker answered my sizing question within a few hours.',
  ],
  [
    'My new favourite',
    'Wore this to a wedding and was asked where it was from all night. Beautifully finished inside and out.',
  ],
  [
    'Gorgeous quality',
    'You can tell this was made with care — French seams, a proper hem, and it arrived wrapped in tissue.',
  ],
  [
    'Exactly as pictured',
    'Colour is true to the photos. Runs very slightly long on me at 160cm but I love the drama.',
  ],
  [
    'Lovely piece',
    'Took a little longer than I expected to arrive but the maker kept me updated and it was worth the wait.',
  ],
  [
    'Perfect fit',
    'Followed the measurements on the listing and it fits like it was made for me — because it was!',
  ],
];

async function seedOrders(db: Sql) {
  const r = rng('orders');
  const shipping = new Map<string, MakerShipping>(
    MAKERS.map((m) => [
      m.id,
      {
        makerId: m.id,
        shippingStandardCents: m.shippingStandardCents,
        freeShippingOverCents: m.freeShippingOverCents,
        dispatchDays: m.dispatchDays,
      },
    ]),
  );
  const sellable = PRODUCTS.filter((p) => p.productType !== 'one_of_one');
  const ooo = PRODUCTS.filter((p) => p.productType === 'one_of_one' && p.variants[0]!.stock === 0);

  for (let n = 0; n < 32; n++) {
    const buyer = BUYERS[n % BUYERS.length]!;
    const lines: CartLine[] = [];
    // Sold one-of-ones are recorded as delivered sales.
    if (n < ooo.length) lines.push(lineFor(ooo[n]!, 0));
    const count = n % 4 === 0 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      // Spread orders across makers so every studio has sales history and reviews.
      const maker = MAKERS[(n + i * 5) % MAKERS.length]!;
      const own = sellable.filter((s) => s.maker.id === maker.id);
      const p = own[Math.floor(n / MAKERS.length + i) % own.length]!;
      if (!lines.some((l) => l.productId === p.id)) lines.push(lineFor(p, r.int(0, 5)));
    }
    const plan = splitOrder(lines, shipping, FEE_BPS);
    const state: 'delivered' | 'shipped' | 'preparing' | 'paid' =
      n < 22 ? 'delivered' : n < 26 ? 'shipped' : n < 29 ? 'preparing' : 'paid';
    const created = daysAgo(
      state === 'delivered' ? 20 + n * 2 : state === 'shipped' ? 6 + n - 22 : n - 28,
      9 + (n % 8),
    );
    const orderId = seedId(`order:${n}`);
    const address = {
      name: buyer.name,
      line1: `${10 + n} ${r.pick(['Smith St', 'Lygon St', 'King St', 'Oxford St', 'Boundary St', 'Rundle St'])}`,
      city: r.pick(['Melbourne', 'Sydney', 'Brisbane', 'Adelaide', 'Hobart', 'Perth']),
      state: r.pick(['VIC', 'NSW', 'QLD', 'SA', 'TAS', 'WA']),
      postal_code: String(r.int(2000, 7000)),
      country: 'AU',
    };
    await db`
      insert into public.orders (id, order_number, buyer_user_id, buyer_email, buyer_name, status, subtotal_cents,
        shipping_total_cents, total_cents, platform_fee_total_cents, stripe_checkout_session_id, stripe_payment_intent_id,
        stripe_charge_id, shipping_address, paid_at, created_at)
      values (${orderId}, ${'OO-S' + String(n + 1).padStart(4, '0')}, ${buyer.id}, ${buyer.email}, ${buyer.name}, 'paid',
        ${plan.subtotalCents}, ${plan.shippingTotalCents}, ${plan.totalCents}, ${plan.platformFeeTotalCents},
        ${'cs_seed_' + n}, ${'pi_seed_' + n}, ${'ch_seed_' + n}, ${db.json(address)}, ${created}, ${created})
      on conflict (id) do update set order_number = excluded.order_number`;

    for (const f of plan.fulfilments) {
      const fulfilmentId = seedId(`fulfilment:${n}:${f.makerId}`);
      const maker = MAKERS.find((m) => m.id === f.makerId)!;
      const slowest = f.items.reduce(
        (acc, i) => {
          const est = estimateDelivery(
            {
              productType: i.productType,
              leadTimeDays: i.leadTimeDays,
              dispatchDays: maker.dispatchDays,
            },
            created,
          );
          return est.deliveryTo > acc.deliveryTo ? est : acc;
        },
        estimateDelivery(
          { productType: 'ready_to_ship', dispatchDays: maker.dispatchDays },
          created,
        ),
      );
      const shippedAt =
        state === 'delivered' || state === 'shipped' ? new Date(created.getTime() + 3 * DAY) : null;
      const deliveredAt = state === 'delivered' ? new Date(created.getTime() + 8 * DAY) : null;
      const tracking = shippedAt ? `AP${(1_000_000_000 + n * 7919).toString()}AU` : null;
      await db`
        insert into public.fulfilments (id, order_id, maker_id, status, subtotal_cents, shipping_cents, platform_commission_cents,
          seller_net_cents, stripe_transfer_id, transfer_status, tracking_number, carrier, estimated_dispatch_date,
          estimated_delivery_from, estimated_delivery_to, shipped_at, delivered_at, created_at)
        values (${fulfilmentId}, ${orderId}, ${f.makerId}, ${state}::fulfilment_status, ${f.subtotalCents}, ${f.shippingCents},
          ${f.platformCommissionCents}, ${f.sellerNetCents}, ${'tr_seed_' + n + '_' + maker.slug.slice(0, 6)}, 'created',
          ${tracking}, ${tracking ? 'Australia Post' : null}, ${toIsoDate(slowest.dispatchBy)}, ${toIsoDate(slowest.deliveryFrom)},
          ${toIsoDate(slowest.deliveryTo)}, ${shippedAt}, ${deliveredAt}, ${created})
        on conflict (id) do nothing`;
      for (const item of f.items) {
        const itemId = seedId(`order_item:${n}:${item.variantId}`);
        await db`
          insert into public.order_items (id, order_id, fulfilment_id, product_id, variant_id, maker_id, product_title, variant_label,
            product_type, image_url, quantity, unit_price_cents, line_total_cents, platform_commission_cents, seller_net_cents,
            fulfilment_status, tracking_number, carrier, shipped_at, delivered_at, created_at)
          values (${itemId}, ${orderId}, ${fulfilmentId}, ${item.productId}, ${item.variantId}, ${item.makerId}, ${item.productTitle},
            ${item.variantLabel}, ${item.productType}::product_type, ${item.imageUrl ?? null}, ${item.quantity}, ${item.unitPriceCents},
            ${item.lineTotalCents}, ${item.platformCommissionCents}, ${item.sellerNetCents}, ${state}::fulfilment_status,
            ${tracking}, ${tracking ? 'Australia Post' : null}, ${shippedAt}, ${deliveredAt}, ${created})
          on conflict (id) do nothing`;
        if (state === 'delivered' && (n + item.productTitle.length) % 4 !== 0) {
          const [title, body] =
            REVIEW_BODIES[(n + item.productTitle.length) % REVIEW_BODIES.length]!;
          await db`
            insert into public.reviews (id, order_item_id, buyer_user_id, maker_id, product_id, rating, title, body, created_at)
            values (${seedId(`review:${itemId}`)}, ${itemId}, ${buyer.id}, ${item.makerId}, ${item.productId},
              ${n % 7 === 3 ? 4 : 5}, ${title}, ${body}, ${new Date(created.getTime() + 10 * DAY)})
            on conflict (order_item_id) do nothing`;
        }
      }
    }
  }

  await db`
    update public.makers m set completed_orders = (
      select count(*) from public.fulfilments f where f.maker_id = m.id and f.status = 'delivered'
    )`;
}

const bySlug = (slug: string) => {
  const p = PRODUCTS.find((x) => x.slug === slug);
  if (!p) throw new Error(`No seeded product ${slug}`);
  return p;
};
const makerBySlug = (slug: string) => MAKERS.find((m) => m.slug === slug)!;

/** Profile banner: the supplied studio shot, or a new maker's own photographed piece. */
function coverFor(makerSlug: string) {
  const m = makerBySlug(makerSlug);
  const hero = HEROES.find((h) => h.maker === makerSlug);
  return m.joinedDaysAgo < 60 && hero ? `/seed/${hero.slug}.jpg` : '/seed/banner-velvet-sofa.jpg';
}

/** The demo buyer's saves: one dropped in price since saving, one nearly sold out. */
const DEMO_SAVES: Array<{ slug: string; savedAtPrice?: number }> = [
  { slug: 'tangerine-bias-maxi', savedAtPrice: 35000 },
  { slug: 'corset-front-mini' },
  { slug: 'navy-satin-slip' },
  { slug: 'crochet-lace-maxi' },
  { slug: 'wine-satin-halter-set' },
  { slug: 'embroidered-ruffle-dress' },
];
const DEMO_FOLLOWS = ['halde-studio', 'atelier-noor', 'lune-studio', 'mara-kovac'];

async function seedSocial(db: Sql) {
  const r = rng('social');
  for (const [i, buyer] of BUYERS.entries()) {
    const follows =
      i === 0
        ? DEMO_FOLLOWS.map(makerBySlug)
        : [0, 1, 2].map((k) => MAKERS[(i + k * 5) % MAKERS.length]!);
    for (const maker of follows) {
      await db`insert into public.maker_follows (id, user_id, maker_id) values (${seedId(`follow:${buyer.id}:${maker.id}`)}, ${buyer.id}, ${maker.id})
               on conflict (user_id, maker_id) do nothing`;
    }
    const saves =
      i === 0
        ? DEMO_SAVES.map((d) => ({ p: bySlug(d.slug), price: d.savedAtPrice }))
        : [0, 1, 2, 3].map((k) => ({
            p: PRODUCTS[(i * 11 + k * 17) % PRODUCTS.length]!,
            price: undefined as number | undefined,
          }));
    for (const { p, price } of saves) {
      await db`insert into public.saved_items (id, user_id, product_id, price_at_save)
               values (${seedId(`save:${buyer.id}:${p.id}`)}, ${buyer.id}, ${p.id}, ${price ?? p.priceCents})
               on conflict (user_id, product_id) do update set price_at_save = excluded.price_at_save`;
    }
    if (i % 3 === 0) {
      await db`
        insert into public.buyer_measurements (id, user_id, height_cm, bust_cm, waist_cm, hips_cm, fit_notes)
        values (${seedId(`measurements:${buyer.id}`)}, ${buyer.id}, ${r.int(155, 180)}, ${r.int(82, 104)}, ${r.int(64, 86)},
          ${r.int(90, 114)}, 'Prefer a relaxed fit through the waist; long torso.')
        on conflict (user_id) do nothing`;
    }
  }
  await db`
    update public.products p set save_count = (select count(*) from public.saved_items s where s.product_id = p.id)`;

  // Product views for seller analytics (replaced on each run).
  await db`delete from public.product_views where viewer_key like 'seed:%'`;
  for (const [i, p] of PRODUCTS.entries()) {
    const views = 20 + ((i * 37) % 180);
    await db`
      insert into public.product_views (product_id, maker_id, viewer_key, created_at)
      select ${p.id}, ${p.maker.id}, 'seed:' || g, now() - (g % 30) * interval '1 day'
      from generate_series(1, ${views}) g`;
    await db`update public.products set view_count = ${views} where id = ${p.id}`;
  }
}

const THREADS: Array<{
  buyer: number;
  product: string;
  messages: Array<[from: 'buyer' | 'maker', body: string]>;
}> = [
  {
    buyer: 0,
    product: 'navy-satin-slip',
    messages: [
      ['buyer', 'What size should I get? I’m 168cm, bust 90, waist 72.'],
      [
        'maker',
        'I’d go a 10 — the bias cut skims the body without clinging. Happy to take the hem up if you’d like it shorter.',
      ],
      ['buyer', 'Perfect, thank you!'],
    ],
  },
  {
    buyer: 0,
    product: 'tangerine-bias-maxi',
    messages: [
      ['buyer', 'Can you adjust the length? I’m 160cm and would love it to just skim the floor.'],
    ],
  },
  {
    buyer: 1,
    product: 'lace-trim-maxi-dress',
    messages: [
      ['buyer', 'Could you make this in ivory for a garden wedding?'],
      [
        'maker',
        'Yes — ivory silk with the same lace trim, same price. I’ll confirm the lace in daylight.',
      ],
    ],
  },
  {
    buyer: 2,
    product: 'draped-satin-midi',
    messages: [
      ['buyer', 'When would it arrive if I order this week? It’s for the races on the 8th.'],
      ['maker', 'Order by Friday and it’ll be with you by the 4th. I’ll prioritise it.'],
    ],
  },
];

async function seedMessages(db: Sql) {
  for (const [i, t] of THREADS.entries()) {
    const buyer = BUYERS[t.buyer]!;
    const p = bySlug(t.product);
    const threadId = seedId(`thread:${i}`);
    const start = daysAgo(6 - i);
    const variant = p.variants[2 % p.variants.length]!;
    const context = {
      productId: p.id,
      productTitle: p.title,
      productSlug: p.slug,
      imageUrl: p.images[0]!.url,
      priceCents: p.priceCents,
      productType: p.productType,
      variantId: variant.id,
      variantLabel: `AU ${variant.size}`,
      leadTimeDays: p.leadTimeDays,
    };
    const last = new Date(start.getTime() + t.messages.length * 3_600_000);
    await db`
      insert into public.message_threads (id, buyer_user_id, maker_id, product_id, context, last_message_at, created_at, kind)
      values (${threadId}, ${buyer.id}, ${p.maker.id}, ${p.id}, ${db.json(context)}, ${last}, ${start}, 'enquiry')
      on conflict (id) do update set buyer_user_id = excluded.buyer_user_id, maker_id = excluded.maker_id,
        product_id = excluded.product_id, context = excluded.context, last_message_at = excluded.last_message_at`;
    await db`delete from public.messages where thread_id = ${threadId}`;
    for (const [k, [from, body]] of t.messages.entries()) {
      await db`
        insert into public.messages (id, thread_id, sender_user_id, body, created_at)
        values (${seedId(`message:${i}:${k}`)}, ${threadId}, ${from === 'buyer' ? buyer.id : p.maker.userId}, ${body},
          ${new Date(start.getTime() + k * 3_600_000)})`;
    }
  }
}

/** Unread counters and the reply clock, derived from the seeded messages. */
async function refreshThreadState(db: Sql) {
  // Each side has read up to its own last message.
  await db`
    update public.message_threads t set
      buyer_last_read_at = (select max(m.created_at) from public.messages m
        where m.thread_id = t.id and m.sender_user_id = t.buyer_user_id and m.kind <> 'system'),
      maker_last_read_at = (select max(m.created_at) from public.messages m
        where m.thread_id = t.id and m.sender_user_id <> t.buyer_user_id)`;
  await db`
    update public.message_threads t set
      buyer_unread = (select count(*) from public.messages m where m.thread_id = t.id and not m.is_flagged
        and m.sender_user_id <> t.buyer_user_id and m.kind <> 'system'
        and m.created_at > coalesce(t.buyer_last_read_at, 'epoch')),
      maker_unread = (select count(*) from public.messages m where m.thread_id = t.id and not m.is_flagged
        and m.sender_user_id = t.buyer_user_id and m.created_at > coalesce(t.maker_last_read_at, 'epoch')),
      maker_needs_reply = coalesce((select m.sender_user_id = t.buyer_user_id from public.messages m
        where m.thread_id = t.id and not m.is_flagged order by m.created_at desc limit 1), false),
      reply_due_at = (select m.created_at + interval '6 hours' from public.messages m
        where m.thread_id = t.id and not m.is_flagged and m.sender_user_id = t.buyer_user_id
        and m.created_at = (select max(x.created_at) from public.messages x where x.thread_id = t.id and not x.is_flagged)
        limit 1)`;
}

async function seedCommissions(db: Sql) {
  const mara = makerBySlug('mara-kovac');
  const requests = [
    {
      buyer: 0,
      maker: mara,
      garment: 'Satin halter set',
      occasion: 'a summer wedding',
      min: 30000,
      max: 45000,
      status: 'quoted',
    },
    {
      buyer: 10,
      maker: null,
      garment: 'Skirt',
      occasion: 'Work events',
      min: 15000,
      max: 25000,
      status: 'submitted',
    },
  ];
  for (const [i, req] of requests.entries()) {
    const id = seedId(`commission:${i}`);
    const buyer = BUYERS[req.buyer]!;
    await db`
      insert into public.commission_requests (id, buyer_user_id, maker_id, garment_type, occasion, budget_min_cents, budget_max_cents,
        deadline_date, measurements, fabric_preferences, colour_preferences, notes, status, created_at)
      values (${id}, ${buyer.id}, ${req.maker?.id ?? null}, ${req.garment}, ${req.occasion}, ${req.min}, ${req.max},
        ${toIsoDate(new Date(Date.now() + 60 * DAY))}, 'Bust 88, waist 70, hips 96, height 165cm', 'Heavy satin, nothing sheer',
        'Emerald or deep green', 'Like the wine halter set, but in emerald with a longer trouser.', ${req.status}::commission_status, ${daysAgo(3 - i)})
      on conflict (id) do update set buyer_user_id = excluded.buyer_user_id, maker_id = excluded.maker_id,
        garment_type = excluded.garment_type, occasion = excluded.occasion, notes = excluded.notes`;
    if (req.status !== 'quoted' || !req.maker) continue;

    const quoteId = seedId(`quote:${i}`);
    await db`
      insert into public.commission_quotes (id, commission_request_id, maker_id, total_price_cents, deposit_cents, production_days,
        revisions_included, shipping_cents, estimated_delivery_date, message)
      values (${quoteId}, ${id}, ${req.maker.id}, 42000, 12600, 21, 1, 0,
        ${toIsoDate(new Date(Date.now() + 30 * DAY))}, 'Includes a calico fitting so the halter sits just right.')
      on conflict (id) do nothing`;

    // The request's conversation: a summary, a question, then the maker's quote.
    const threadId = seedId(`thread:commission:${i}`);
    const start = daysAgo(3 - i);
    const context = { commissionGarment: req.garment };
    await db`
      insert into public.message_threads (id, buyer_user_id, maker_id, commission_request_id, kind, context, last_message_at, created_at)
      values (${threadId}, ${buyer.id}, ${req.maker.id}, ${id}, 'custom_request', ${db.json(context)}, ${new Date(start.getTime() + 3 * 3_600_000)}, ${start})
      on conflict (id) do update set context = excluded.context, last_message_at = excluded.last_message_at`;
    await db`delete from public.messages where thread_id = ${threadId}`;
    const quote = {
      price_cents: 42000,
      deposit_pct: 30,
      weeks: 3,
      note: 'Includes a calico fitting.',
      quote_id: quoteId,
    };
    const lines: Array<[string, string, string, Record<string, unknown> | null]> = [
      [
        buyer.id,
        'system',
        `Custom request: ${req.garment} for ${req.occasion}. Budget A$300–A$450.\n\nLike the wine halter set, but in emerald with a longer trouser.`,
        null,
      ],
      [
        req.maker.userId,
        'text',
        'I’d love to make this. Is a 3cm longer inseam right for 165cm in a flat sandal?',
        null,
      ],
      [buyer.id, 'text', 'Yes, perfect — flats mostly.', null],
      [req.maker.userId, 'quote', 'Quote: A$420, 30% deposit, made in 3 weeks', quote],
    ];
    for (const [k, [sender, kind, body, q]] of lines.entries()) {
      await db`
        insert into public.messages (id, thread_id, sender_user_id, body, kind, quote, created_at)
        values (${seedId(`message:commission:${i}:${k}`)}, ${threadId}, ${sender}, ${body}, ${kind}::message_kind,
          ${q ? db.json(q as never) : null}, ${new Date(start.getTime() + k * 3_600_000)})`;
    }
  }
}

export async function seed(databaseUrl: string) {
  const db = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const mockPayments = (process.env.PAYMENTS_DRIVER ?? 'mock') === 'mock';
  try {
    await db.begin(async (tx) => {
      await upsertUser(tx, ADMIN.id, ADMIN.email, ADMIN.name, 'admin', hash);
      for (const b of BUYERS) await upsertUser(tx, b.id, b.email, b.name, 'buyer', hash);

      for (const m of MAKERS) {
        await upsertUser(tx, m.userId, m.email, m.displayName, 'seller', hash);
        await tx`
          insert into public.makers (
            id, user_id, slug, display_name, tagline, story, location, city, state, process, materials, sizing_notes,
            avatar_url, cover_url, lead_time_days, response_time_hours, custom_commissions_enabled, status,
            stripe_account_id, stripe_onboarding_complete, stripe_payouts_enabled, shipping_standard_cents,
            free_shipping_over_cents, dispatch_days, approved_at
          ) values (
            ${m.id}, ${m.userId}, ${m.slug}, ${m.displayName}, ${m.tagline}, ${m.story}, ${`${m.suburb}, ${m.city}`}, ${m.city},
            ${m.state}, ${m.process}, ${m.materials}, ${m.sizingNotes}, ${m.portrait ?? `/seed/makers/${m.slug}-avatar.svg`},
            ${coverFor(m.slug)}, ${m.leadTimeDays}, ${m.responseTimeHours}, ${m.customCommissions}, 'approved',
            ${mockPayments ? `acct_mock_${m.slug.replace(/-/g, '_')}` : null}, ${mockPayments}, ${mockPayments},
            ${m.shippingStandardCents}, ${m.freeShippingOverCents}, ${m.dispatchDays},
            now() - make_interval(days => ${m.joinedDaysAgo})
          )
          on conflict (id) do update set
            display_name = excluded.display_name, tagline = excluded.tagline, story = excluded.story,
            location = excluded.location, city = excluded.city, state = excluded.state, process = excluded.process,
            materials = excluded.materials, sizing_notes = excluded.sizing_notes, avatar_url = excluded.avatar_url,
            cover_url = excluded.cover_url, lead_time_days = excluded.lead_time_days,
            response_time_hours = excluded.response_time_hours,
            custom_commissions_enabled = excluded.custom_commissions_enabled, status = 'approved',
            shipping_standard_cents = excluded.shipping_standard_cents,
            -- Swap mock Connect ids when switching drivers, but never overwrite a real account.
            stripe_account_id = case when public.makers.stripe_account_id is null or public.makers.stripe_account_id like 'acct_mock_%'
              then excluded.stripe_account_id else public.makers.stripe_account_id end,
            stripe_onboarding_complete = case when public.makers.stripe_account_id is null or public.makers.stripe_account_id like 'acct_mock_%'
              then excluded.stripe_onboarding_complete else public.makers.stripe_onboarding_complete end,
            stripe_payouts_enabled = case when public.makers.stripe_account_id is null or public.makers.stripe_account_id like 'acct_mock_%'
              then excluded.stripe_payouts_enabled else public.makers.stripe_payouts_enabled end,
            free_shipping_over_cents = excluded.free_shipping_over_cents, dispatch_days = excluded.dispatch_days,
            approved_at = excluded.approved_at`;
        // The established studios are the featured makers in the Makers menu.
        await tx`update public.makers set is_featured = ${m.joinedDaysAgo >= 60} where id = ${m.id}`;
        await tx`
          insert into public.reply_templates (id, maker_id, title, body) values
            (${seedId(`tpl:${m.slug}:size`)}, ${m.id}, 'Sizing help', ${'Thanks for asking! Based on your measurements I’d recommend '}),
            (${seedId(`tpl:${m.slug}:timing`)}, ${m.id}, 'Timing', ${`Made-to-order pieces take about ${m.leadTimeDays} days to make, plus 2–6 business days for delivery.`})
          on conflict (id) do nothing`;
      }

      await seedProducts(tx);

      for (const [i, c] of COLLECTIONS.entries()) {
        await tx`
          insert into public.collections (id, slug, title, subtitle, description, hero_image_url, sort_order, is_active)
          values (${c.id}, ${c.slug}, ${c.title}, ${c.subtitle}, ${c.description}, ${`/seed/collections/${c.slug}.svg`}, ${i}, true)
          on conflict (id) do update set title = excluded.title, subtitle = excluded.subtitle,
            description = excluded.description, hero_image_url = excluded.hero_image_url, sort_order = excluded.sort_order`;
        const members = PRODUCTS.filter(c.match).slice(0, 16);
        for (const [k, p] of members.entries()) {
          await tx`insert into public.collection_products (collection_id, product_id, sort_order) values (${c.id}, ${p.id}, ${k})
                   on conflict (collection_id, product_id) do update set sort_order = excluded.sort_order`;
        }
      }

      await tx`
        insert into public.editorial_placements (id, slot, title, subtitle, image_url, href, sort_order) values
          (${seedId('placement:hero')}, 'home_hero', 'Bespoke pieces made just for you',
            'Melbourne-made · Straight from the maker',
            '/seed/hero-linen-suit.jpg', '/?tab=new', 0),
          (${seedId('placement:wedding')}, 'home_feature', 'Wedding guest, but not boring',
            'Season picks from ten independent Melbourne studios.', ${'/seed/tangerine-bias-maxi.jpg'},
            '/collections/wedding-guest-but-not-boring', 1)
        on conflict (id) do update set title = excluded.title, subtitle = excluded.subtitle, image_url = excluded.image_url, href = excluded.href`;

      await seedOrders(tx);
      await seedSocial(tx);
      await seedMessages(tx);
      await seedCommissions(tx);
      await refreshThreadState(tx);

      await tx`
        insert into public.audit_events (id, actor_user_id, action, entity_type, entity_id, metadata)
        values (${seedId('audit:seed')}, ${ADMIN.id}, 'seed.run', 'system', 'seed', ${tx.json({ products: PRODUCTS.length })})
        on conflict (id) do update set created_at = now()`;
    });
  } finally {
    await db.end();
  }
}

if (require.main === module) {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace';
  seed(url)
    .then(() =>
      console.log(
        `Seeded ${MAKERS.length} makers, ${PRODUCTS.length} products, ${COLLECTIONS.length} collections, ${BUYERS.length} buyers. ` +
          `Logins: ${ADMIN.email} / ${MAKERS[0]!.email} / ${BUYERS[0]!.email} (password: ${PASSWORD})`,
      ),
    )
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
