import { expect, test, type Page } from '@playwright/test';
import { BUYERS, PASSWORD } from '../scripts/seed-data';

// Mega menu, nav, Discover and the product quick view (desktop 1280 unless noted).

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}

/** Pieces in the masonry layout that's showing at this width. */
const pieces = (page: Page) => page.locator('[data-masonry] [data-testid=discover-piece]:visible');

async function openQuickView(page: Page, index = 0) {
  const card = pieces(page).nth(index);
  await card.hover();
  await card.getByRole('link', { name: /Quick view/ }).click();
  await expect(page.getByTestId('quick-view')).toBeVisible();
  await expect(page.locator('#qv-title')).toBeVisible();
}

test.describe.serial('discover', () => {
  test('mega menu opens on hover, frosts the header, and closes on leave and Esc', async ({
    page,
  }) => {
    await page.goto('/');
    const header = page.getByTestId('site-header');
    await expect(header).not.toHaveClass(/glass-nav/);
    await page.getByTestId('mega-trigger-occasions').hover();
    await expect(page.getByTestId('mega-panel')).toBeVisible();
    await expect(page.getByTestId('mega-panel')).toContainText('Spring racing');
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect(header).toHaveClass(/glass-nav/);

    // Moving off the trigger and panel closes it.
    await page.mouse.move(640, 840);
    await expect(page.getByTestId('mega-panel')).toHaveCount(0);
    await expect(header).not.toHaveClass(/glass-nav/);

    await page.getByTestId('mega-trigger-occasions').hover();
    await expect(page.getByTestId('mega-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('mega-panel')).toHaveCount(0);
  });

  test('Discover is in the nav and the tab bar; the phone header heart goes to /saved', async ({
    page,
    browser,
  }) => {
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Primary' });
    await expect(nav.getByRole('link', { name: 'Discover' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Made to order' })).toHaveCount(0);

    const phone = await (
      await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true })
    ).newPage();
    await phone.goto('/');
    const tabs = phone.getByRole('navigation', { name: 'App' });
    await expect(tabs.getByTestId('tab-discover')).toBeVisible();
    await expect(tabs.getByRole('link', { name: /^Saved/ })).toHaveCount(0);
    await phone.getByTestId('header-saved').click();
    await expect(phone).toHaveURL(/\/saved$/);
    await phone.context().close();
  });

  test('filters update the URL, show pills and narrow the results; Clear all resets', async ({
    page,
  }) => {
    await page.goto('/discover');
    const count = page.getByTestId('discover-count');
    const all = parseInt(await count.innerText(), 10);

    await page.getByTestId('filters-button').click();
    const panel = page.getByTestId('filter-panel');
    await panel.getByRole('button', { name: 'Size 10', exact: true }).click();
    await panel.getByTestId('max-price').fill('300');
    await expect(panel.getByTestId('show-pieces')).toHaveText(/Show \d+ pieces?/);
    await panel.getByTestId('show-pieces').click();

    await expect(page).toHaveURL(/size=10/);
    await expect(page).toHaveURL(/max=300/);
    await expect(page.getByTestId('filter-pill')).toHaveCount(2);
    await expect(page.getByTestId('filter-pill').first()).toHaveText(/Size 10/);
    await expect(page.getByTestId('filter-pill').nth(1)).toHaveText(/Under A\$300/);
    await expect.poll(async () => parseInt(await count.innerText(), 10)).toBeLessThan(all);
    // Every piece shown is under A$300.
    const prices = await pieces(page).evaluateAll((els) =>
      els.map((el) =>
        // The "maker · A$price" line.
        Number(/A\$([\d,]+)/.exec(el.querySelector('p')?.textContent ?? '')?.[1]?.replace(',', '')),
      ),
    );
    expect(prices.length).toBeGreaterThan(0);
    for (const p of prices) expect(p).toBeLessThanOrEqual(300);

    await page.getByRole('link', { name: 'Clear all' }).click();
    await expect(page).toHaveURL(/\/discover$/);
    await expect(page.getByTestId('filter-pill')).toHaveCount(0);
    await expect.poll(async () => parseInt(await count.innerText(), 10)).toBe(all);
  });

  test('scrolling to the bottom loads the next page without duplicates', async ({ page }) => {
    await page.goto('/discover');
    await expect(pieces(page)).toHaveCount(30);
    await expect
      .poll(
        async () => {
          await page.mouse.wheel(0, 6000);
          return pieces(page).count();
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(30);
    const hrefs = await pieces(page).evaluateAll((els) =>
      els.map((el) => el.querySelector('a')!.getAttribute('href')),
    );
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  test('a search with no matches shows the empty state and a custom request', async ({ page }) => {
    await page.goto('/discover');
    await page.getByTestId('discover-search').fill('zzqxvbnonsense');
    await expect(page).toHaveURL(/q=zzqxvbnonsense/);
    await expect(page.getByTestId('discover-empty')).toBeVisible();
    await expect(
      page.getByTestId('discover-empty').getByRole('link', { name: 'Request a custom piece' }),
    ).toHaveAttribute('href', '/custom');
  });

  test('quick view opens over the list, closes with Esc, and reloads as the full page', async ({
    page,
  }) => {
    await page.goto('/discover');
    await openQuickView(page);
    await expect(page).toHaveURL(/\/products\/[^/]+$/);
    const title = await page.locator('#qv-title').innerText();
    const url = page.url();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quick-view')).toHaveCount(0);
    await expect(page).toHaveURL(/\/discover$/);

    await openQuickView(page);
    await page.reload();
    expect(page.url()).toBe(url);
    await expect(page.getByTestId('quick-view')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  });

  test('quick view: → moves on, Add to bag updates the bag, emails are refused', async ({
    page,
  }) => {
    await login(page, BUYERS[6]!.email);
    await page.goto('/discover');
    const bag = page.getByTestId('bag-link');
    const before = Number(/\d+/.exec(await bag.innerText())?.[0] ?? 0);

    await openQuickView(page);
    const first = page.url();
    const dialog = page.getByTestId('quick-view');
    // Step through until a piece has a size in stock.
    let size = dialog.locator('button[aria-label^="Size "]:not([disabled])');
    for (let i = 0; i < 8; i++) {
      const at = page.url();
      await page.keyboard.press('ArrowRight');
      await expect(page).not.toHaveURL(at);
      await expect(dialog.locator('#qv-title')).toBeVisible();
      if ((await size.count()) > 0) break;
    }
    expect(page.url()).not.toBe(first);
    size = dialog.locator('button[aria-label^="Size "]:not([disabled])');
    await size.first().click();
    await dialog.getByTestId('qv-add').click();
    await expect(dialog.getByTestId('qv-view-bag')).toBeVisible();
    await expect(bag).toContainText(String(before + 1));

    await dialog.getByPlaceholder(/question/).fill('Could you email me at me@example.com?');
    await dialog.getByRole('button', { name: 'Send' }).click();
    await expect(dialog.getByTestId('question-error')).toContainText('contact details');
  });
});
