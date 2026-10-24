/**
 * Dramalicious and the eight pieces the homepage hero rotates through, for local development and
 * tests (production has the real rows). Not part of `npm run db:seed`, so the normal demo feed and
 * its screenshots stay as they are.
 *   npm run seed:featured          install the maker, pieces and an active home feature
 *   npm run seed:featured -- --remove
 */
import 'dotenv/config';
import postgres from 'postgres';
import { seedId } from './seed-data';

type Sql = postgres.Sql | postgres.TransactionSql;

export const FIXTURE_MAKER_ID = seedId('featured:dramalicious');
const USER_ID = seedId('featured:dramalicious:user');

export const FIXTURE_PIECES = [
  { slug: 'sparkle-dress', title: 'Sparkle dress', cents: 32000, w: 1200, h: 1600, cat: 'dresses' },
  { slug: 'trench-coat', title: 'Trench coat', cents: 38000, w: 1068, h: 1600, cat: 'outerwear' },
  {
    slug: 'tan-double-breasted-suit',
    title: 'Tan double breasted suit',
    cents: 42000,
    w: 1200,
    h: 1600,
    cat: 'tailoring',
  },
  { slug: 'yellow-skirt', title: 'Yellow skirt', cents: 17500, w: 1067, h: 1600, cat: 'skirts' },
  { slug: 'moss-suit', title: 'Moss suit', cents: 39000, w: 1280, h: 1600, cat: 'tailoring' },
  {
    slug: 'olive-leather-jacket',
    title: 'Olive leather jacket',
    cents: 48000,
    w: 1200,
    h: 1600,
    cat: 'outerwear',
  },
  { slug: 'sparkle-bag', title: 'Sparkle bag', cents: 23000, w: 1200, h: 1600, cat: 'accessories' },
  {
    slug: 'pointed-heel-shoes',
    title: 'Pointed heel shoes',
    cents: 21000,
    w: 1067,
    h: 1600,
    cat: 'accessories',
  },
] as const;

export const pieceId = (slug: string) => seedId(`featured:dramalicious:${slug}`);

export async function installFeaturedFixture(db: Sql, opts: { feature?: boolean } = {}) {
  const email = 'dramalicious-fixture@example.com';
  await db`
    insert into auth.users (id, email, encrypted_password, email_confirmed_at)
    values (${USER_ID}, ${email}, 'x', now()) on conflict (id) do nothing`;
  await db`
    insert into public.users (id, auth_user_id, email, display_name, role)
    values (${USER_ID}, ${USER_ID}, ${email}, 'Dramalicious', 'seller'::user_role)
    on conflict (id) do nothing`;
  await db`
    insert into public.makers (id, user_id, slug, display_name, tagline, location, city, state, status,
      shop_status, founding_number, approved_at, went_live_at)
    values (${FIXTURE_MAKER_ID}, ${USER_ID}, 'dramalicious', 'Dramalicious',
      'Satin slips, halters and statement dresses, made in Melbourne.', 'Melbourne, VIC', 'Melbourne', 'VIC',
      'approved', 'live', 1, now(), now())
    on conflict (id) do update set shop_status = 'live', founding_number = 1`;
  for (const p of FIXTURE_PIECES) {
    const id = pieceId(p.slug);
    await db`
      insert into public.products (id, maker_id, slug, title, description, category, price_cents, product_type,
        status, approved_at, published_at, country_of_making)
      values (${id}, ${FIXTURE_MAKER_ID}, ${p.slug}, ${p.title},
        ${`${p.title} by Dramalicious, a piece for the featured maker hero.`}, ${p.cat}, ${p.cents},
        'ready_to_ship'::product_type, 'approved', now(), now(), 'Australia')
      on conflict (id) do update set status = 'approved', title = excluded.title,
        price_cents = excluded.price_cents`;
    await db`
      insert into public.product_images (id, product_id, storage_path, public_url, alt_text, sort_order,
        is_placeholder, width, height)
      values (${seedId(`featured:img:${p.slug}`)}, ${id}, ${`/preview/dramalicious/${p.slug}-1.jpg`},
        ${`/preview/dramalicious/${p.slug}-1.jpg`}, ${`${p.title}, photo 1`}, 0, false, ${p.w}, ${p.h})
      on conflict (id) do nothing`;
    await db`
      insert into public.product_variants (id, product_id, size, stock_quantity, is_active, sort_order)
      values (${seedId(`featured:var:${p.slug}`)}, ${id}, 'One size', 3, true, 0)
      on conflict (id) do nothing`;
  }
  if (opts.feature !== false) {
    await db`update public.home_features set is_active = false where is_active`;
    await db`delete from public.home_features where maker_id = ${FIXTURE_MAKER_ID}`;
    await db`
      insert into public.home_features (maker_id, product_ids)
      values (${FIXTURE_MAKER_ID}, ${FIXTURE_PIECES.map((p) => pieceId(p.slug))}::uuid[])`;
  }
}

export async function removeFeaturedFixture(db: Sql) {
  await db`delete from public.home_features where maker_id = ${FIXTURE_MAKER_ID}`;
  const ids = FIXTURE_PIECES.map((p) => pieceId(p.slug));
  await db`delete from public.products where id = any(${ids}::uuid[])`;
  await db`delete from public.makers where id = ${FIXTURE_MAKER_ID}`;
  await db`delete from public.users where id = ${USER_ID}`;
  await db`delete from auth.users where id = ${USER_ID}`;
}

if (require.main === module) {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace';
  const db = postgres(url, { max: 1, onnotice: () => {} });
  const run = process.argv.includes('--remove') ? removeFeaturedFixture : installFeaturedFixture;
  run(db)
    .then(() => console.log(process.argv.includes('--remove') ? 'Removed.' : 'Installed.'))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.end());
}
