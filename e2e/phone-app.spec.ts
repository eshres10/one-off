import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';
import { formatPrice } from '../lib/domain/money';
import { STEP_BUYER_LINE } from '../lib/studio/steps';
import { TERMS } from '../lib/studio/terms';
import { BUYERS, PASSWORD, PRODUCTS } from '../scripts/seed-data';
import { fillBrief, halde, login, sendToThree, signInAtFind } from './have-it-made-steps';

// The phone app (iPhone 14, 390×844): the shell, tab memory, sheets, bag with express pay, and
// Studio mode. The desktop project runs only the last visual check. Phone screens are also
// captured to e2e/__screenshots__/phone-app/ as they're visited.

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { transform: postgres.camel, max: 2, onnotice: () => {} },
);
test.afterAll(() => db.end());

const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
const photo = (n: string) => path.join(__dirname, '..', 'public', 'seed', `${n}.jpg`);
const PHOTOS = ['tangerine-bias-maxi', 'draped-satin-midi', 'lace-trim-maxi-dress'].map(photo);

const ready = PRODUCTS.filter(
  (p) =>
    p.productType === 'ready_to_ship' &&
    p.colours.length === 1 &&
    !p.tags?.includes('preview-only') &&
    p.variants.some((v) => v.stock >= 4),
);
const product = ready[0]!;
const other = ready.find((p) => p.maker.id !== product.maker.id)!;
// Earlier suites sell sizes out, so the size to pick is read from the database when the test runs.
let size = '';
let otherSize = '';
test.beforeAll(async () => {
  const pick = async (productId: string) => {
    const [v] = await db<{ size: string }[]>`
      select size from public.product_variants where product_id = ${productId} and is_active
        and stock_quantity >= 4 order by sort_order limit 1`;
    return v!.size.replace(/^AU\s*/i, '');
  };
  size = await pick(product.id);
  otherSize = await pick(other.id);
});
const oneOfOne = PRODUCTS.find(
  (p) => p.productType === 'one_of_one' && !p.tags?.includes('preview-only'),
)!;
const mto = PRODUCTS.find(
  (p) => p.productType === 'made_to_order' && !p.tags?.includes('preview-only'),
)!;

/** A screenshot of the current screen into the phone-app folder (not compared, just kept). */
async function shot(page: Page, name: string) {
  if (!isPhone(page)) return;
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({
    path: path.join(__dirname, '__screenshots__', 'phone-app', `${name}.png`),
    fullPage: false,
  });
}

async function addFromSheet(page: Page, slug: string, au: string) {
  await page.goto(`/products/${slug}`);
  await page.getByTestId('add-to-bag').click();
  await page.getByRole('button', { name: `Size ${au}`, exact: true }).click();
  await page.getByTestId('size-sheet-add').click();
  await expect(page.getByTestId('app-toast')).toContainText('Added to bag');
}

async function phonePage(browser: Browser) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  return ctx.newPage();
}

/** Mirrors the quote sheet's "You keep": price less commission and the card fee estimate. */
function youKeep(priceCents: number, commissionPct: number) {
  const commission = Math.floor((priceCents * Math.round(commissionPct * 100) + 5_000) / 10_000);
  const card = Math.round((priceCents * 1.75) / 100) + 30;
  return priceCents - commission - card;
}

test.describe.serial('phone app', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) >= 768, 'phone only');

  test('1. phone shell: no desktop header or footer; five tabs and no +', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('site-header')).toBeHidden();
    await expect(page.locator('[data-site-footer]')).toBeHidden();
    const bar = page.getByTestId('phone-tabbar');
    await expect(bar).toBeVisible();
    for (const t of ['home', 'explore', 'discover', 'inbox', 'bag'])
      await expect(bar.getByTestId(`tab-${t}`)).toBeVisible();
    await expect(bar.getByRole('link')).toHaveCount(5);
    await expect(bar.getByRole('link', { name: /List a piece|\+/ })).toHaveCount(0);
    await expect(page.getByTestId('studio-tabbar')).toHaveCount(0);
    await shot(page, 'home');
    await bar.getByTestId('tab-explore').click();
    await expect(page).toHaveURL(/\/explore$/);
    await shot(page, 'explore');
    await bar.getByTestId('tab-discover').click();
    await expect(page).toHaveURL(/\/discover$/);
    await shot(page, 'discover');
  });

  test('2. tab memory: each tab keeps its scroll; re-tapping the active tab goes to the top', async ({
    page,
  }) => {
    await page.goto('/');
    const bar = page.getByTestId('phone-tabbar');
    await page.evaluate(() => window.scrollTo(0, 900));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);
    await bar.getByTestId('tab-explore').click();
    await expect(page).toHaveURL(/\/explore$/);
    await bar.getByTestId('tab-home').click();
    await expect(page).toHaveURL(/\/$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(800);
    // Active tab, tapped again: back to the top.
    await bar.getByTestId('tab-home').click();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  });

  test('3. product: no tab bar; Add to bag opens the size sheet; adding toasts and badges the bag', async ({
    page,
  }) => {
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByTestId('phone-product')).toBeVisible();
    await expect(page.getByTestId('phone-tabbar')).toBeHidden();
    await expect(page.getByTestId('buy-bar')).toBeVisible();
    await shot(page, 'product');
    await page.getByTestId('add-to-bag').click();
    const sheet = page.getByTestId('size-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('size-sheet-add')).toBeDisabled();
    await shot(page, 'size-sheet');
    await page.getByRole('button', { name: `Size ${size}`, exact: true }).click();
    await expect(page.getByTestId('size-sheet-add')).toHaveText(
      `Add to bag · ${formatPrice(product.priceCents)}`,
    );
    await page.getByTestId('size-sheet-add').click();
    await expect(page.getByTestId('app-toast')).toContainText('Added to bag');
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('view-bag')).toBeVisible();
    await page.getByTestId('product-back').click();
    await expect(page.getByTestId('phone-tabbar').getByTestId('tab-bag-count')).toHaveText('1');
  });

  test('4. size sheet: a one-of-one shows only its size; measurements only for made to order', async ({
    page,
  }) => {
    await page.goto(`/products/${oneOfOne.slug}`);
    await page.getByTestId('add-to-bag').click();
    await expect(page.getByTestId('size-grid').getByRole('button')).toHaveCount(1);
    await expect(page.getByTestId('size-measurements')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.goto(`/products/${mto.slug}`);
    await page.getByTestId('add-to-bag').click();
    await expect(page.getByTestId('size-measurements')).toBeVisible();
    // AU 6–16 are always on the grid, with the letter underneath.
    for (const au of ['6', '8', '10', '12', '14', '16'])
      await expect(page.getByTestId(`size-${au}`)).toBeVisible();
    await shot(page, 'size-sheet-made-to-order');
  });

  test('5. filters: the count updates and "Show N pieces" applies them', async ({ page }) => {
    await page.goto('/explore');
    await page.getByTestId('explore-filters').click();
    const sheet = page.getByTestId('filter-sheet');
    await expect(sheet).toBeVisible();
    const apply = page.getByTestId('filter-apply');
    await expect(apply).toHaveText(/^Show \d+ pieces?$/);
    const all = Number(/\d+/.exec(await apply.innerText())![0]);
    await page.getByTestId('filter-how-ready_to_ship').click();
    await expect(apply).toHaveText(/^Show \d+ pieces?$/);
    await expect
      .poll(async () => Number(/\d+/.exec(await apply.innerText())![0]))
      .toBeLessThan(all);
    const n = Number(/\d+/.exec(await apply.innerText())![0]);
    await shot(page, 'filter-sheet');
    await apply.click();
    await expect(page).toHaveURL(/\/explore\?.*filter=ready_to_ship/);
    await expect(page.getByTestId('explore-results')).toBeVisible();
    await expect(page.getByTestId('results-count')).toContainText(String(n));
    await shot(page, 'explore-results');
  });

  test('6. the feed loads more on scroll and shows skeletons while it does', async ({ page }) => {
    await page.route('**/api/feed?**', async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.continue();
    });
    await page.goto('/');
    const feed = page.getByTestId('endless-feed');
    await expect(feed).toHaveAttribute('data-feed-more', '');
    const before = await page.getByTestId('phone-tile').count();
    await feed.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(page.getByTestId('phone-skeleton')).toBeVisible();
    await expect.poll(() => page.getByTestId('phone-tile').count()).toBeGreaterThan(before);
    await expect(page.getByTestId('phone-skeleton')).toHaveCount(0);
  });

  test('7. bag: grouped by maker with the right totals, express pay mounted, then empty', async ({
    page,
  }) => {
    await addFromSheet(page, product.slug, size);
    await addFromSheet(page, other.slug, otherSize);
    await page.goto('/bag');
    const groups = page.getByTestId('bag-group');
    await expect(groups).toHaveCount(2);
    await expect(page.getByTestId('bag-line-phone')).toHaveCount(2);
    const delivery = await page.getByTestId('bag-delivery-phone').innerText();
    const deliveryCents = Math.round(Number(delivery.replace(/[^\d.]/g, '') || 0) * 100);
    await expect(page.getByTestId('bag-total-phone')).toHaveText(
      formatPrice(product.priceCents + other.priceCents + deliveryCents),
    );
    await expect(page.getByTestId('express-checkout')).toBeVisible();
    await expect(page.getByTestId('express-apple')).toBeVisible();
    await expect(page.getByTestId('checkout-button-phone')).toBeVisible();
    await shot(page, 'bag');
    await page.getByTestId('express-apple').click();
    await expect(page.getByTestId('order-placed')).toBeVisible({ timeout: 30_000 });
    await shot(page, 'order-placed');
    await expect(page.getByTestId('track-my-order')).toHaveAttribute('href', '/you?tab=orders');
    // Paid: the bag is empty.
    await page.goto('/bag');
    await expect(page.getByTestId('bag-empty')).toBeVisible();
    await expect(page.getByTestId('bag-empty')).toContainText('Your bag is empty');
    await shot(page, 'bag-empty');
  });

  test('8. Studio access: a buyer never sees it; a maker switches and the mode survives a reload', async ({
    browser,
  }) => {
    const buyer = await phonePage(browser);
    await login(buyer, BUYERS[4]!.email, '/you');
    await expect(buyer.getByTestId('you-screen')).toBeVisible();
    await shot(buyer, 'you');
    await buyer.getByTestId('you-menu').click();
    await expect(buyer.getByTestId('you-menu-sheet')).toBeVisible();
    await expect(buyer.getByTestId('menu-studio')).toHaveCount(0);
    await shot(buyer, 'you-menu');
    await buyer.goto('/studio');
    await expect(buyer).not.toHaveURL(/\/studio/);
    await buyer.goto('/inbox');
    await expect(buyer.getByTestId('phone-inbox')).toBeVisible();
    await shot(buyer, 'inbox');
    await buyer.context().close();

    const maker = await phonePage(browser);
    await login(maker, halde.email, '/you');
    await maker.getByTestId('you-menu').click();
    await maker.getByTestId('menu-studio').click();
    await maker.waitForURL((u) => u.pathname === '/studio');
    await expect(maker.getByTestId('studio-today')).toBeVisible();
    await expect(maker.getByTestId('studio-tabbar')).toBeVisible();
    await expect(maker.getByTestId('phone-tabbar')).toBeHidden();
    await shot(maker, 'studio-today');
    // Reopening the app lands in Studio while the mode is Studio.
    await maker.goto('/');
    await maker.waitForURL((u) => u.pathname === '/studio');
    await maker.reload();
    await expect(maker).toHaveURL(/\/studio$/);
    // Back to shopping.
    await maker.getByTestId('mode-shopping').click();
    await maker.waitForURL((u) => u.pathname === '/');
    await expect(maker.getByTestId('phone-tabbar')).toBeVisible();
    await maker.reload();
    await expect(maker).toHaveURL(/\/$/);
    await maker.context().close();
  });

  test('9. Studio steps: each making step updates the order and tells the buyer; Ship it sends tracking', async ({
    page,
  }) => {
    const [f] = await db<{ id: string; orderId: string; orderNumber: string }[]>`
      select f.id, f.order_id, o.order_number from public.fulfilments f
      join public.makers m on m.id = f.maker_id join public.orders o on o.id = f.order_id
      where m.slug = ${halde.slug} and f.status = 'making' and o.order_type = 'standard'
      order by o.created_at limit 1`;
    expect(f).toBeTruthy();
    await db`update public.fulfilments set mto_step = 0, status = 'paid' where id = ${f!.id}`;
    await login(page, halde.email, '/studio/orders');
    await expect(page.getByTestId('phone-orders')).toBeVisible();
    await shot(page, 'studio-orders');
    await page.goto(`/studio/orders/${f!.id}`);
    await expect(page.getByTestId('phone-order-detail')).toBeVisible();
    await shot(page, 'studio-order');
    const next = page.getByTestId('next-step');
    for (const [label, step] of [
      ['I’ve bought the fabric', 1],
      ['I’ve started cutting', 2],
      ['I’ve started sewing', 3],
      ['I’m finishing it', 4],
    ] as const) {
      await expect(next).toHaveText(label);
      await next.click();
      await expect(page.getByTestId('app-toast')).toContainText('the buyer knows');
      await expect
        .poll(async () => {
          const [r] = await db<{ mtoStep: number }[]>`
            select mto_step from public.fulfilments where id = ${f!.id}`;
          return r?.mtoStep;
        })
        .toBe(step);
      const [m] = await db<{ n: number }[]>`
        select count(*)::int as n from public.messages where body = ${STEP_BUYER_LINE[step]!}`;
      expect(m!.n).toBeGreaterThan(0);
      if (step === 4) await shot(page, 'studio-order-ready');
    }
    // "Fabric bought" on a standard made-to-order order with advances off: no advance payout.
    const [o] = await db<{ fabricAdvanceCents: number | null }[]>`
      select fabric_advance_cents from public.orders where id = ${f!.orderId}`;
    expect(o!.fabricAdvanceCents).toBeNull();

    await expect(next).toHaveText('Ship it');
    await next.click();
    const sheet = page.getByTestId('ship-sheet');
    await expect(sheet).toBeVisible();
    await expect(page.getByTestId('label-coming-soon')).toBeVisible();
    await page.getByTestId('tracking-input').fill('36LB9999999901000930501');
    await shot(page, 'ship-sheet');
    await page.getByTestId('mark-shipped-phone').click();
    await expect(page.getByTestId('app-toast')).toContainText(/shipped/i);
    await expect
      .poll(async () => {
        const [r] = await db<{ status: string; trackingNumber: string | null }[]>`
          select status::text, tracking_number from public.fulfilments where id = ${f!.id}`;
        return `${r?.status}:${r?.trackingNumber}`;
      })
      .toBe('shipped:36LB9999999901000930501');
  });

  test('10. quote sheet: the stepper updates "You keep" from the commission; sending creates a quote', async ({
    browser,
  }) => {
    // A buyer sends a brief to three makers (Halde among them), then Halde quotes from the phone.
    const buyer = await phonePage(browser);
    await fillBrief(buyer);
    await signInAtFind(buyer, BUYERS[14]!.email);
    const number = await sendToThree(buyer);
    await buyer.context().close();

    const page = await phonePage(browser);
    await login(page, halde.email, '/studio/inbox');
    await expect(page.getByTestId('studio-inbox')).toBeVisible();
    await shot(page, 'studio-inbox');
    await page.getByTestId(`request-${number}`).click();
    await expect(page.getByTestId('phone-request')).toBeVisible();
    await shot(page, 'studio-request');
    await page.getByTestId('open-quote').click();
    const sheet = page.getByTestId('quote-sheet');
    await expect(sheet).toBeVisible();
    const [mk] = await db<{ foundingUntil: Date | null }[]>`
      select founding_until from public.makers where slug = ${halde.slug}`;
    const pct =
      mk?.foundingUntil && new Date(mk.foundingUntil) > new Date()
        ? TERMS.foundingCommissionPct
        : TERMS.standardCommissionPct;
    await expect(page.getByTestId('quote-price')).toHaveText(formatPrice(35_000));
    await expect(page.getByTestId('you-keep')).toHaveText(formatPrice(youKeep(35_000, pct)));
    await page.getByTestId('price-plus').click();
    await expect(page.getByTestId('quote-price')).toHaveText(formatPrice(36_000));
    await expect(page.getByTestId('you-keep')).toHaveText(formatPrice(youKeep(36_000, pct)));
    await sheet.locator('[data-testid^="ready-"]').first().click();
    const canMake = page.getByTestId('can-make');
    if ((await canMake.getAttribute('aria-checked')) !== 'true') await canMake.click();
    await shot(page, 'quote-sheet');
    await page.getByTestId('send-quote').click();
    await expect(page.getByTestId('quote-sent')).toBeVisible();
    const [q] = await db<{ price: number; status: string }[]>`
      select q.price, q.status from public.custom_quotes q
      join public.custom_requests r on r.id = q.request_id join public.makers m on m.id = q.maker_id
      where r.number = ${number} and m.slug = ${halde.slug}`;
    expect(q).toEqual({ price: 36_000, status: 'sent' });
    await page.context().close();
  });

  test('11. List a piece: three photos publish a live listing; a one-of-one has exactly one size', async ({
    page,
  }) => {
    await login(page, halde.email, '/studio/new');
    await expect(page.getByTestId('step-photos')).toBeVisible();
    await shot(page, 'studio-new-photos');
    await page.getByTestId('photo-input').setInputFiles(PHOTOS);
    await expect(page.getByTestId('photo-grid').locator('img')).toHaveCount(3, {
      timeout: 30_000,
    });
    await page.getByTestId('to-details').click();
    await expect(page.getByTestId('step-details')).toBeVisible();
    await page.getByTestId('piece-title').fill('Phone Listed Slip');
    await page.getByTestId('piece-price').fill('320');
    await expect(page.getByTestId('you-keep')).toContainText('A$');
    await page.getByTestId('cat-dresses').click();
    await page.getByTestId('type-one_of_one').click();
    await expect(page.getByTestId('size-control')).toHaveAttribute('data-type', 'one_of_one');
    await page.getByTestId('size-10').click();
    await page.getByTestId('size-12').click();
    // Picking a second size moves the one size, it doesn't add one.
    await expect(page.getByTestId('size-control').locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.getByTestId('size-12')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('piece-description').fill('Cut on the bias from deadstock silk.');
    await shot(page, 'studio-new-details');
    await page.getByTestId('publish').click();
    await page.waitForURL((u) => u.pathname === '/studio/shop');
    await expect(page.getByTestId('studio-shop')).toBeVisible();
    await shot(page, 'studio-shop');
    const [p] = await db<{ id: string; status: string; type: string }[]>`
      select id, status, product_type as type from public.products where title = 'Phone Listed Slip'`;
    expect(p).toMatchObject({ status: 'approved', type: 'one_of_one' });
    const sizes = await db<{ size: string; stock: number }[]>`
      select size, stock_quantity as stock from public.product_variants where product_id = ${p!.id} and is_active`;
    expect(sizes).toHaveLength(1);
    expect(sizes[0]).toMatchObject({ stock: 1 });
    expect(sizes[0]!.size).toMatch(/^(AU )?12$/);
    await page.goto('/studio/payouts');
    await expect(page.getByTestId('phone-payouts')).toBeVisible();
    await shot(page, 'studio-payouts');
  });

  test('12. advance flag: with advances off, "Fabric bought" creates no advance payout', async () => {
    // Test 9 walked a standard made-to-order order through "Fabric bought" with the flag off.
    const rows = await db<{ n: number }[]>`
      select count(*)::int as n from public.orders o join public.fulfilments f on f.order_id = o.id
      join public.makers m on m.id = f.maker_id
      where m.slug = ${halde.slug} and o.order_type = 'standard' and o.fabric_advance_cents is not null`;
    expect(rows[0]!.n).toBe(0);
  });

  test('14. accessibility: aria-current on tabs, labelled sheets that trap focus, labelled icon buttons', async ({
    page,
  }) => {
    const unlabelled = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll('button, a'))
          .filter((el) => {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return false;
            const text = (el.textContent ?? '').trim();
            return !text && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby');
          })
          .map((el) => el.outerHTML.slice(0, 120)),
      );
    const bar = page.getByTestId('phone-tabbar');
    await page.goto('/');
    await expect(bar.getByTestId('tab-home')).toHaveAttribute('aria-current', 'page');
    await expect(bar.getByTestId('tab-explore')).not.toHaveAttribute('aria-current', 'page');
    expect(await unlabelled()).toEqual([]);
    await page.goto('/explore');
    await expect(bar.getByTestId('tab-explore')).toHaveAttribute('aria-current', 'page');
    expect(await unlabelled()).toEqual([]);
    await page.goto('/bag');
    expect(await unlabelled()).toEqual([]);

    await page.goto(`/products/${product.slug}`);
    expect(await unlabelled()).toEqual([]);
    await page.getByTestId('add-to-bag').click();
    const sheet = page.getByTestId('size-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('role', 'dialog');
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(sheet).toHaveAccessibleName('Size');
    // Focus stays inside the sheet.
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(
      await page.evaluate(() =>
        document.activeElement?.closest('[data-testid="size-sheet"]') ? 'inside' : 'outside',
      ),
    ).toBe('inside');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });
});

test.describe('desktop check', () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1280) < 768, 'desktop only');

  test('13. desktop at 1440: home, product and the Studio dashboard are unchanged', async ({
    page,
  }) => {
    const settle = async () => {
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(async () => {
        for (const img of Array.from(document.images)) img.loading = 'eager';
        await Promise.all(
          Array.from(document.images)
            .filter((i) => !i.complete)
            .map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r)))),
        );
      });
    };
    const masks = [
      page.getByTestId('availability'),
      page.locator('time'),
      page.locator('[data-dynamic]'),
    ];
    await page.goto('/');
    await expect(page.getByTestId('site-header')).toBeVisible();
    await expect(page.getByTestId('phone-tabbar')).toBeHidden();
    await settle();
    await expect(page).toHaveScreenshot('desktop-home.png', {
      mask: masks,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByTestId('phone-product')).toBeHidden();
    await settle();
    await expect(page).toHaveScreenshot('desktop-product.png', {
      mask: masks,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(halde.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname !== '/login');
    await page.goto('/studio');
    await expect(page.getByTestId('studio-today')).toBeHidden();
    await expect(page.getByTestId('studio-tabbar')).toBeHidden();
    await settle();
    await expect(page).toHaveScreenshot('desktop-studio.png', {
      mask: masks,
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
    });
  });
});
