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
  // Without email links (production build with the outbox) the password form shows straight away.
  const usePassword = page.getByTestId('join-use-password');
  if (await usePassword.isVisible()) await usePassword.click();
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
    // The header slides away while scrolling down, so the gallery pins right under wherever
    // the header's bottom edge is (the top of the window once it has gone).
    const headerBottom = () =>
      page.evaluate(() =>
        Math.max(0, document.querySelector('.site-header')!.getBoundingClientRect().bottom),
      );
    await scrollTo(page, 800);
    await page.waitForTimeout(450);
    expect(Math.round(await top(page, '[data-testid=product-gallery]'))).toBe(
      Math.round(await headerBottom()),
    );
    // Scrolling back up a little brings the header back, and the gallery sits under it.
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(500);
    expect(Math.round(await top(page, '[data-testid=product-gallery]'))).toBe(Math.round(header));
    const detailsEnd = await page.evaluate(() => {
      const r = document.querySelector('[data-testid=product-details]')!.getBoundingClientRect();
      return r.bottom + window.scrollY;
    });
    await scrollTo(page, detailsEnd + 400);
    await page.waitForTimeout(450);
    expect(await top(page, '[data-testid=product-gallery]')).toBeLessThan(0);
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
    // The ranked order, as Discover's infinite scroll receives it (the masonry columns on the
    // page interleave it, so the DOM order isn't the rank order).
    const topSlugs = async (page: Page) => {
      const res = await page.request.get('/api/discover');
      const body = (await res.json()) as { items: Array<{ kind: string; slug?: string }> };
      return body.items
        .filter((i) => i.kind === 'piece')
        .map((i) => i.slug!)
        .slice(0, 12);
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
});
