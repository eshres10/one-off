import path from 'node:path';
import postgres from 'postgres';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { BUYERS, PASSWORD } from '../scripts/seed-data';

// Scroll effects, shopper onboarding and the taste picker, first-visit tours and seller
// self-sign-up, against the e2e server and its database.
const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { transform: postgres.camel, max: 2, onnotice: () => {} },
);
test.afterAll(() => db.end());

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const photo = (n: string) => path.join(__dirname, '..', 'public', 'seed', `${n}.jpg`);
const PHOTOS = ['tangerine-bias-maxi', 'draped-satin-midi', 'lace-trim-maxi-dress'].map(photo);

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

/** A brand-new shopper account through /join (password option); lands on /welcome. */
async function join(page: Page, name: string) {
  const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}@buyer.test`;
  await page.goto('/join');
  await page.getByTestId('join-use-password').click();
  await page.getByLabel('Name').fill(name);
  await page.locator('input[name=email]:visible').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page
    .getByRole('button', { name: /Create account/ })
    .last()
    .click();
  await page.waitForURL(/\/welcome/);
  return email;
}

const userIdOf = async (email: string) =>
  (await db<{ id: string }[]>`select id from public.users where email = ${email}`)[0]!.id;

const scrollTo = async (page: Page, y: number) => {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(250);
};
const top = (page: Page, sel: string) =>
  page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top, sel);

test.describe.serial('onboarding and scroll', () => {
  test('1. the homepage hero stays put and the next section slides over it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expect(page.locator('[data-hero]')).toBeVisible();
    await scrollTo(page, 600);
    expect(await top(page, '[data-hero]')).toBe(0);
    const heroBottom = await page.evaluate(
      () => document.querySelector('[data-hero]')!.getBoundingClientRect().bottom,
    );
    expect(await top(page, '[data-shutter]')).toBeLessThan(heroBottom);
  });

  test('2. the desktop gallery stays pinned until the details column ends', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/products/navy-satin-slip');
    const header = await page.evaluate(
      () => document.querySelector('.site-header')!.getBoundingClientRect().height,
    );
    await scrollTo(page, 800);
    expect(Math.round(await top(page, '[data-testid=product-gallery]'))).toBe(Math.round(header));
    const detailsEnd = await page.evaluate(() => {
      const r = document.querySelector('[data-testid=product-details]')!.getBoundingClientRect();
      return r.bottom + window.scrollY;
    });
    await scrollTo(page, detailsEnd + 400);
    expect(await top(page, '[data-testid=product-gallery]')).toBeLessThan(header);
  });

  test('3. on a phone the photo stays at the top while the content card moves up', async ({
    browser,
  }) => {
    const page = await (await browser.newContext(PHONE)).newPage();
    await page.goto('/products/navy-satin-slip');
    const cardBefore = await top(page, '[data-testid=product-details]');
    expect(await top(page, '[data-testid=product-gallery]')).toBe(0);
    await scrollTo(page, 400);
    expect(await top(page, '[data-testid=product-gallery]')).toBe(0);
    expect(await top(page, '[data-testid=product-details]')).toBeLessThan(cardBefore - 300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });

  test('4. the taste picker needs 5 picks, saves them and builds a taste profile', async ({
    browser,
  }) => {
    const page = await (await browser.newContext(PHONE)).newPage();
    const email = await join(page, 'Pia Taste');
    await expect(page.getByTestId('welcome-continue')).toBeDisabled();
    await page.getByTestId('fit-size-10').click();
    await page.getByTestId('welcome-continue').click();
    await page.getByTestId('occasion-weddings').click();
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('welcome-step-3')).toBeVisible();

    const tiles = page.getByTestId('taste-tile');
    await expect(tiles).toHaveCount(12);
    for (let i = 0; i < 4; i++) {
      await tiles.nth(i).click();
      await expect(page.getByTestId('taste-count')).toHaveText(`${i + 1} picked`);
    }
    await expect(page.getByTestId('welcome-continue')).toBeDisabled();
    await expect(page.getByTestId('welcome-continue')).toHaveText(/Pick 1 more/i);
    await tiles.nth(4).click();
    await expect(page.getByTestId('welcome-continue')).toBeEnabled();
    await expect(page.getByTestId('welcome-continue')).toHaveText(/Continue · 5 favourites/i);
    await expect(page.getByTestId('style-pill').first()).toBeVisible();

    const userId = await userIdOf(email);
    await expect
      .poll(async () => {
        const [p] = await db<{ n: number; tags: Record<string, number> }[]>`
          select cardinality(taste_picks) as n, taste_tags as tags from public.customer_prefs where user_id = ${userId}`;
        return p && p.n === 5 && Object.keys(p.tags).length > 0;
      })
      .toBe(true);

    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('welcome-step-4')).toBeVisible();
    await page.goto('/saved');
    await expect(page.getByTestId('saved-card')).toHaveCount(5);
  });

  test('5. a satin + minimal shopper sees satin and minimal pieces ranked higher', async ({
    browser,
  }) => {
    const shopper = BUYERS[3]!;
    await db`
      insert into public.customer_prefs (user_id, taste_tags, onboarding_completed_at)
      values (${shopper.id}, '{"Satin": 6, "Minimal": 6}', now())
      on conflict (user_id) do update set taste_tags = excluded.taste_tags`;
    const topSlugs = async (page: Page) => {
      await page.goto('/discover');
      await expect(page.getByTestId('discover-piece').first()).toBeVisible();
      const hrefs = await page
        .getByTestId('discover-piece')
        .locator('a[href^="/products/"]')
        .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!.split('/')[2]!))]);
      return hrefs.slice(0, 12);
    };
    const score = async (slugs: string[]) =>
      (
        await db<{ n: number }[]>`
          select count(*)::int as n from public.products
          where slug = any(${slugs}::text[]) and style_tags && array['Satin', 'Minimal']`
      )[0]!.n;

    const anonPage = await (
      await browser.newContext({ viewport: { width: 1280, height: 860 } })
    ).newPage();
    const anon = await score(await topSlugs(anonPage));
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 860 } })
    ).newPage();
    await login(page, shopper.email, '/discover');
    const mine = await score(await topSlugs(page));
    expect(mine).toBeGreaterThan(anon);
  });

  test('6. the desktop tour shows once, keys drive it, skipping saves it, Replay restarts it', async ({
    browser,
  }) => {
    const page = await (
      await browser.newContext({ viewport: { width: 1280, height: 860 } })
    ).newPage();
    const email = await join(page, 'Tess Tour');
    await page.getByTestId('fit-size-12').click();
    await page.getByTestId('welcome-continue').click();
    await page.getByTestId('welcome-skip').click();
    await expect(page.getByTestId('welcome-step-6')).toBeVisible();

    await page.goto('/');
    await expect(page.getByTestId('tour-welcome')).toBeVisible();
    await page.getByTestId('tour-start').click();
    await expect(page.getByTestId('tour-count')).toHaveText('1 of 6');
    await expect(page.getByTestId('tour-spotlight')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('tour-count')).toHaveText('2 of 6');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('tour-count')).toHaveText('1 of 6');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('tour-count')).toHaveText('2 of 6');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('customer-tour')).toHaveCount(0);

    const userId = await userIdOf(email);
    await expect
      .poll(
        async () =>
          (
            await db<{ done: boolean }[]>`
        select tour_completed_at is not null as done from public.users where id = ${userId}`
          )[0]!.done,
      )
      .toBe(true);
    await page.reload();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('tour-welcome')).toHaveCount(0);

    await page.goto('/account/help');
    await page.getByTestId('replay-tour').click();
    await page.waitForURL((u) => u.pathname === '/');
    await expect(page.getByTestId('tour-welcome')).toBeVisible();
  });

  test('7. a maker signs up at /sell/start; the shop stays a draft until a piece and payouts', async ({
    browser,
  }) => {
    const ctx = await browser.newContext(PHONE);
    const page = await ctx.newPage();
    await page.goto('/sell/start');
    await page.getByTestId('sell-get-started').click();
    const email = `maker.${Date.now()}@maker.test`;
    await page.getByLabel('Name').fill('Ines Self');
    await page.locator('input[name=email]:visible').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page
      .getByRole('button', { name: /Create account/ })
      .last()
      .click();

    await page.getByLabel('Label name').fill('Ines Self Studio');
    await page.getByLabel('Suburb').fill('Northcote');
    await page.getByText('Slips', { exact: true }).click();
    await page.getByTestId('mode-ready_to_ship').click();
    await page.getByTestId('label-continue').click();
    await expect(page.getByTestId('sell-step-2')).toBeVisible();
    for (let i = 0; i < 3; i++) await page.getByTestId('sell-cards-next').click();
    await page.getByTestId('sell-cards-continue').click();
    await expect(page.getByTestId('sell-step-3')).toBeVisible();

    const shop = async () =>
      (
        await db<{ id: string; shopStatus: string }[]>`
          select m.id, m.shop_status from public.makers m join public.users u on u.id = m.user_id
          where u.email = ${email}`
      )[0]!;
    expect((await shop()).shopStatus).toBe('draft');

    // Publish the first piece from Studio before payouts are connected: still a draft.
    const desk = await (
      await browser.newContext({
        viewport: { width: 1280, height: 900 },
        storageState: await ctx.storageState(),
      })
    ).newPage();
    await desk.goto('/studio');
    await desk.getByTestId('tour-dismiss').click();
    await desk.goto('/studio/listings/new');
    await desk.getByTestId('photo-input').first().setInputFiles(PHOTOS);
    await expect(desk.getByTestId('photo-grid').locator('img')).toHaveCount(3, { timeout: 30_000 });
    await desk.getByTestId('piece-title').filter({ visible: true }).first().fill('Northcote Slip');
    await desk.getByTestId('cat-dresses').filter({ visible: true }).first().click();
    await desk
      .getByTestId('piece-description')
      .filter({ visible: true })
      .first()
      .fill(
        'A bias-cut slip in silk satin that skims the body, with French seams and adjustable straps.',
      );
    await desk.getByTestId('piece-price').filter({ visible: true }).first().fill('280');
    await desk.getByTestId('size-10-plus').filter({ visible: true }).first().click();
    await desk.getByTestId('publish-piece').filter({ visible: true }).first().click();
    await expect(desk.getByTestId('piece-live')).toContainText('payouts are connected');
    expect((await shop()).shopStatus).toBe('draft');

    // Connect payouts (mock Stripe): the shop goes live and the piece is published.
    await page.getByTestId('sell-continue-stripe').click();
    await page.getByTestId('mock-connect-complete').click();
    await expect(page.getByTestId('sell-bank-connected')).toBeVisible();
    const s = await shop();
    expect(s.shopStatus).toBe('live');
    const [piece] = await db<{ status: string }[]>`
      select status from public.products where maker_id = ${s.id} and title = 'Northcote Slip'`;
    expect(piece!.status).toBe('approved');
    await page.getByTestId('sell-bank-next').click();
    await expect(page.getByTestId('sell-step-4')).toContainText('Ines Self Studio is set up.');
  });
});
