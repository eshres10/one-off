import path from 'node:path';
import postgres from 'postgres';
import { checkoutAsGuest } from './checkout-steps';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, MAKERS, PASSWORD } from '../scripts/seed-data';
import { TERMS } from '../lib/studio/terms';

// The seller side: concierge set-up, claiming a shop, publishing, orders, payouts, holiday
// mode and notification preferences. Runs against the e2e server and its database.
const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { transform: postgres.camel, max: 2, onnotice: () => {} },
);
const CRON = {
  Authorization: `Bearer ${process.env.E2E_CRON_SECRET ?? 'e2e-cron-secret-0123456789'}`,
};
const halde = MAKERS.find((m) => m.slug === 'halde-studio')!;
const photo = (n: string) => path.join(__dirname, '..', 'public', 'seed', `${n}.jpg`);
const PHOTOS = ['tangerine-bias-maxi', 'draped-satin-midi', 'lace-trim-maxi-dress'].map(photo);

test.afterAll(() => db.end());

/** Studio shows order numbers as "#10001". */
const short = (orderNumber: string) => orderNumber.replace(/^OO-/, '#');

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

/** A Halde ready-to-ship piece with stock to spare. */
async function haldePiece() {
  const [v] = await db<{ slug: string; size: string }[]>`
    select p.slug, v.size from public.products p join public.product_variants v on v.product_id = p.id
    join public.makers m on m.id = p.maker_id
    where m.slug = 'halde-studio' and p.status = 'approved' and p.product_type = 'ready_to_ship'
      and v.is_active and v.stock_quantity >= 3
      and (select count(distinct colour) from public.product_variants x where x.product_id = p.id) <= 1
    order by p.slug, v.sort_order limit 1`;
  if (!v) throw new Error('No Halde piece in stock');
  return v;
}

/** Guest checkout through mock Stripe; returns the order number. */
async function buy(browser: Browser, email: string, piece?: { slug: string; size: string }) {
  const p = piece ?? (await haldePiece());
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`/products/${p.slug}`);
  await page.getByRole('button', { name: `Size ${p.size}`, exact: true }).click();
  await page
    .getByRole('button', { name: /^Add to bag/ })
    .filter({ visible: true })
    .click();
  await page.getByTestId('view-bag').click();
  const orderNumber = await checkoutAsGuest(page, email, 'Studio Buyer');
  await ctx.close();
  return orderNumber;
}

const fulfilmentOf = async (orderNumber: string) =>
  (
    await db<
      {
        id: string;
        status: string;
        stripeTransferId: string | null;
        commissionPctApplied: string;
        orderId: string;
        makerId: string;
      }[]
    >`select f.id, f.status, f.stripe_transfer_id, f.commission_pct_applied, f.order_id, f.maker_id
      from public.fulfilments f join public.orders o on o.id = f.order_id where o.order_number = ${orderNumber}`
  )[0]!;

test.describe.serial('Studio', () => {
  const slug = `e2e-atelier-${Date.now().toString(36)}`;
  let inviteUrl = '';
  let shippedOrder = '';

  test('1. admin sets up a shop with 3 pieces and sends the invite', async ({ page }) => {
    await login(page, ADMIN.email, '/admin/shops/new');
    await page.getByLabel('Shop name').fill('E2E Atelier');
    await page.getByLabel(/Shop link/).fill(slug);
    await page.getByLabel('Suburb').fill('Brunswick');
    await page.getByLabel(/Maker’s email/).fill(`${slug}@maker.test`);
    await page.getByLabel(/Story/).fill('Cut and sewn in a Brunswick back room.');
    await page.getByTestId('create-shop-submit').click();
    await page.waitForURL(/\/admin\/shops\/[0-9a-f-]{36}$/);
    const shopUrl = page.url();

    for (const n of [1, 2, 3]) {
      await page.goto(shopUrl);
      await page.getByTestId('add-shop-piece').click();
      await page.getByTestId('photo-input').setInputFiles(PHOTOS);
      await expect(page.getByTestId('photo-grid').locator('img')).toHaveCount(3, {
        timeout: 30_000,
      });
      await page.getByTestId('piece-title').fill(`Bias Midi ${n}`);
      await page.getByTestId('cat-dresses').click();
      await page
        .getByTestId('piece-description')
        .fill('A bias-cut midi in silk satin. Fully lined, invisible side zip, French seams.');
      await page.getByTestId('piece-price').fill(String(280 + n * 10));
      await page.getByTestId('size-10-plus').click();
      await page.getByTestId('publish-piece').first().click();
      await expect(page.getByTestId('toast')).toBeVisible();
    }
    await page.goto(shopUrl);
    await expect(page.getByTestId('admin-piece')).toHaveCount(3);
    await page.getByTestId('send-invite').click();
    inviteUrl = await page.getByTestId('invite-link').locator('input').inputValue();
    expect(inviteUrl).toMatch(/\/claim\/[A-Za-z0-9_-]{20,}$/);
    const [mail] = await db<{ subject: string; bodyHtml: string }[]>`
      select subject, body_html from public.email_outbox where template = 'shop_invite'
      and to_email = ${`${slug}@maker.test`}`;
    expect(mail!.subject).toBe('Your One Off shop is ready, E2E Atelier');
    expect(mail!.bodyHtml).toContain('This link is just for you and works for 7 days.');
  });

  test('2. the maker claims the shop on a phone and goes live', async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 360, height: 780 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    const noSideScroll = async () =>
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
    await page.goto(new URL(inviteUrl).pathname);
    await page.getByLabel('Name').fill('E2E Maker');
    await page.getByLabel('Password').fill(PASSWORD);
    await page
      .getByRole('button', { name: /Create account/ })
      .last()
      .click();
    await page.getByTestId('take-a-look').click();
    await expect(page.getByTestId('claim-step-1')).toBeVisible();
    await noSideScroll();
    // Leave the third piece off.
    await page.getByTestId('keep-switch').nth(2).click();
    await expect(page.getByTestId('keep-switch').nth(2)).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('looks-good').click();

    await expect(page.getByTestId('agree-continue')).toBeDisabled();
    await page.getByTestId('agree-box').check();
    await page.getByTestId('agree-continue').click();

    await page.getByTestId('continue-to-stripe').click();
    await page.getByTestId('mock-connect-complete').click(); // the mocked Account Link return
    await expect(page.getByTestId('bank-connected')).toBeVisible();
    await page.getByTestId('bank-next').click();

    await page.getByTestId('rate-standard').fill('11');
    await page.getByTestId('save-shipping').click();
    await expect(page.getByTestId('claim-step-5')).toBeVisible();
    await noSideScroll();
    await page.getByTestId('go-live').click();
    await expect(page.getByTestId('claim-live')).toBeVisible();
    await noSideScroll();

    const [shop] = await db<{ shopStatus: string; foundingUntil: Date | null }[]>`
      select shop_status, founding_until from public.makers where slug = ${slug}`;
    expect(shop!.shopStatus).toBe('live');
    expect(shop!.foundingUntil!.getTime()).toBeGreaterThan(Date.now());
    const pieces = await db<{ title: string; status: string }[]>`
      select p.title, p.status from public.products p join public.makers m on m.id = p.maker_id
      where m.slug = ${slug} order by p.title`;
    expect(pieces.map((p) => p.status)).toEqual(['approved', 'approved', 'archived']);
    await ctx.close();
    // The invite is single use.
    const other = await (await browser.newContext()).newPage();
    await other.goto(new URL(inviteUrl).pathname);
    await expect(other.getByTestId('claim-expired')).toBeVisible();
  });

  test('3. publish stays off until all 5 checks pass', async ({ page }) => {
    await login(page, halde.email, '/studio/listings/new');
    // Desktop and phone layouts both render; use the visible one.
    const publish = page.getByTestId('publish-piece').filter({ visible: true }).first();
    const checklist = page.getByTestId('publish-checklist').filter({ visible: true }).first();
    await expect(publish).toBeDisabled();
    await page.getByTestId('photo-input').setInputFiles(PHOTOS);
    await expect(page.getByTestId('photo-grid').locator('img')).toHaveCount(3, { timeout: 30_000 });
    await page.getByTestId('piece-title').fill('Tangerine Bias Midi');
    await page.getByTestId('cat-dresses').click();
    await page
      .getByTestId('piece-description')
      .fill(
        'A bias-cut midi in tangerine silk satin that skims the body. Fully lined, French seams.',
      );
    await page.getByTestId('piece-price').fill('340');
    await expect(checklist).toContainText('4/5');
    await expect(publish).toBeDisabled();
    await page.getByTestId('size-10-plus').click();
    await expect(checklist).toContainText('5/5');
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page.getByTestId('piece-live')).toBeVisible();
  });

  test('4. a sale shows up in To ship and Needs you today, and shipping emails the buyer', async ({
    browser,
    page,
  }) => {
    shippedOrder = await buy(browser, 'studio-e2e@buyer.test');
    await login(page, halde.email, '/studio');
    await expect(
      page.getByTestId('needs-row').filter({ hasText: short(shippedOrder) }),
    ).toBeVisible();
    await page.goto('/studio/orders');
    const row = page.getByTestId('order-row').filter({ hasText: short(shippedOrder) });
    await expect(row).toBeVisible();
    await row.getByTestId('order-open').click();
    await expect(page.getByTestId('order-panel')).toBeVisible();
    await page.getByTestId('tracking-number').fill('33LGV5038890501000931509');
    await page.getByTestId('mark-shipped').click();
    await expect(page.getByTestId('toast')).toBeVisible();
    await expect(page.getByTestId('toast')).toHaveAttribute('role', 'status');
    await expect
      .poll(
        async () =>
          (
            await db`select 1 from public.email_outbox where template = 'order_shipped'
            and to_email = 'studio-e2e@buyer.test' and body_text like '%33LGV5038890501000931509%'`
          ).length,
      )
      .toBe(1);
  });

  test('5. a made-to-order shipment moved to Packed shows on the buyer’s order page', async ({
    browser,
  }) => {
    const [mto] = await db<{ orderNumber: string; orderId: string; email: string }[]>`
      select o.order_number, o.id as order_id, u.email from public.fulfilments f
      join public.orders o on o.id = f.order_id join public.users u on u.id = o.buyer_user_id
      join public.makers m on m.id = f.maker_id
      where m.slug = 'halde-studio' and f.status in ('paid', 'making') and exists (
        select 1 from public.order_items oi join public.products p on p.id = oi.product_id
        where oi.fulfilment_id = f.id and p.product_type = 'made_to_order')
      order by o.order_number limit 1`;
    const seller = await (await browser.newContext()).newPage();
    await login(seller, halde.email, '/studio/orders');
    await seller.goto(`/studio/orders?tab=mto`);
    await seller
      .getByTestId('order-row')
      .filter({ hasText: short(mto!.orderNumber) })
      .getByTestId('order-open')
      .click();
    await seller.getByTestId('stage-making').click();
    await expect(seller.getByTestId('stage-making')).toHaveAttribute('aria-pressed', 'true');

    const buyer = await (await browser.newContext()).newPage();
    await login(buyer, mto!.email, `/account/orders/${mto!.orderNumber}`);
    await expect(
      buyer.getByTestId('parcel-progress').first().locator('[aria-current=step]'),
    ).toContainText('Being made');

    await seller.getByTestId('stage-packed').click();
    await expect(seller.getByTestId('stage-packed')).toHaveAttribute('aria-pressed', 'true');
    // Made to order shows "Being made" until it's sent; the note says it's packed.
    await buyer.reload();
    await expect(buyer.getByTestId('parcel-note').first()).toContainText('packed');
  });

  test(`6. money is released ${TERMS.releaseDaysAfterDelivery} days after delivery, not before, and an issue holds it`, async ({
    browser,
    request,
  }) => {
    const f = await fulfilmentOf(shippedOrder);
    const deliver = (days: number, id = f.id) =>
      db`update public.fulfilments set status = 'delivered',
        delivered_at = now() - make_interval(secs => ${days * 86400}) where id = ${id}`;
    await deliver(TERMS.releaseDaysAfterDelivery - 0.5);
    expect((await request.get('/api/cron/daily', { headers: CRON })).ok()).toBe(true);
    expect((await fulfilmentOf(shippedOrder)).stripeTransferId).toBeNull();
    await deliver(TERMS.releaseDaysAfterDelivery + 0.1);
    await request.get('/api/cron/daily', { headers: CRON });
    const released = await fulfilmentOf(shippedOrder);
    expect(released.stripeTransferId).toMatch(/^tr_/);
    expect(released.status).toBe('completed');

    // A second order with an open issue stays held.
    const held = await fulfilmentOf(await buy(browser, 'studio-e2e-2@buyer.test'));
    await deliver(TERMS.releaseDaysAfterDelivery + 1, held.id);
    const [item] = await db<{ id: string }[]>`
      select id from public.order_items where fulfilment_id = ${held.id} limit 1`;
    const [anyBuyer] = await db<
      { id: string }[]
    >`select id from public.users where role = 'buyer' limit 1`;
    await db`
      insert into public.return_claims (order_id, order_item_id, buyer_id, seller_id, reason, details, photos, respond_by)
      values (${held.orderId}, ${item!.id}, ${anyBuyer!.id}, ${held.makerId}, 'faulty',
        'The side seam has come apart after one wear.', ${['claims/test.jpg']}, now() + interval '2 days')`;
    await request.get('/api/cron/daily', { headers: CRON });
    expect((await fulfilmentOf(await orderNumberOf(held.orderId))).stripeTransferId).toBeNull();
  });

  test(`8. commission is ${TERMS.foundingCommissionPct}% while founding and ${TERMS.standardCommissionPct}% after`, async ({
    browser,
  }) => {
    expect(Number((await fulfilmentOf(shippedOrder)).commissionPctApplied)).toBe(
      TERMS.foundingCommissionPct,
    );
    const [before] = await db<{ foundingUntil: Date }[]>`
      select founding_until from public.makers where slug = 'halde-studio'`;
    await db`update public.makers set founding_until = now() - interval '1 day' where slug = 'halde-studio'`;
    try {
      const after = await fulfilmentOf(await buy(browser, 'studio-e2e-3@buyer.test'));
      expect(Number(after.commissionPctApplied)).toBe(TERMS.standardCommissionPct);
    } finally {
      await db`update public.makers set founding_until = ${before!.foundingUntil} where slug = 'halde-studio'`;
    }
  });

  test('9. notification preferences are respected: SMS off means no text', async ({
    browser,
    page,
  }) => {
    const texts = async () =>
      (
        await db<{ n: number }[]>`
        select count(*)::int as n from public.notification_log where channel = 'sms' and to_address = '+61412345678'`
      )[0]!.n;
    // On by default for new orders (SMS_ENABLED is on for this server, without Twilio keys).
    await db`update public.makers set mobile = '0412 345 678' where slug = 'halde-studio'`;
    const start = await texts();
    await buy(browser, 'studio-e2e-4@buyer.test');
    expect(await texts()).toBe(start + 1);

    await login(page, halde.email, '/studio/settings');
    await page.getByTestId('pref-new_order-sms').uncheck();
    await page.getByTestId('save-settings').click();
    await expect(page.getByTestId('save-bar')).toContainText('Saved');
    await buy(browser, 'studio-e2e-5@buyer.test');
    expect(await texts()).toBe(start + 1);
    // The email still goes.
    const [mail] = await db<{ n: number }[]>`
      select count(*)::int as n from public.email_outbox where template = 'maker_new_order'
      and to_email = ${halde.email} and created_at > now() - interval '2 minutes'`;
    expect(mail!.n).toBeGreaterThanOrEqual(2);
  });

  test('7. holiday mode shows the banner and note, keeps orders open, and ends on the back date', async ({
    page,
    browser,
  }) => {
    const piece = await haldePiece();
    await login(page, halde.email, '/studio/settings');
    await page.locator('#holiday [role=switch]').first().click();
    await expect(page.locator('#holiday [role=switch]').first()).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const back = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await page.getByTestId('holiday-until').fill(back);
    await page.locator('#set-note').fill('Gone to the coast.');
    await page.getByTestId('save-settings').click();
    await expect(page.getByTestId('save-bar')).toContainText('Saved');

    const shopper = await (await browser.newContext()).newPage();
    await shopper.goto(`/products/${piece.slug}`);
    const banner = shopper.getByTestId('holiday-banner').first();
    await expect(banner).toContainText('You can still order');
    await expect(banner).toContainText('Gone to the coast.');
    // Orders stay open by default (SITE.holidayMode = 'accept_orders').
    await shopper.getByRole('button', { name: `Size ${piece.size}`, exact: true }).click();
    await expect(
      shopper
        .getByRole('button', { name: /^Add to bag/ })
        .filter({ visible: true })
        .first(),
    ).toBeEnabled();

    // The back date arrives: the daily job turns holiday mode off.
    await db`update public.makers set holiday_until = current_date where slug = 'halde-studio'`;
    await page.request.get('/api/cron/daily', { headers: CRON });
    const [shop] = await db<{ shopStatus: string }[]>`
      select shop_status from public.makers where slug = 'halde-studio'`;
    expect(shop!.shopStatus).toBe('live');
    await shopper.reload();
    await expect(shopper.getByTestId('holiday-banner')).toHaveCount(0);
    await shopper.getByRole('button', { name: `Size ${piece.size}`, exact: true }).click();
    await expect(
      shopper
        .getByRole('button', { name: /^Add to bag/ })
        .filter({ visible: true })
        .first(),
    ).toBeEnabled();
  });
});

async function orderNumberOf(orderId: string) {
  const [o] = await db<{ orderNumber: string }[]>`
    select order_number from public.orders where id = ${orderId}`;
  return o!.orderNumber;
}
