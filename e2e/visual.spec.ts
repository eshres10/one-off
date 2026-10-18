import { expect, test, type Page } from '@playwright/test';
import { BUYERS, PASSWORD, PRODUCTS, MAKERS } from '../scripts/seed-data';

// Visual snapshots of the key screens, run at 390px and 1280px (see playwright.config.ts).
// Dates, order numbers and timestamps change between runs, so they are masked.

const product = PRODUCTS.find(
  (p) =>
    p.productType === 'ready_to_ship' &&
    p.colours.length === 1 &&
    p.variants.some((v) => v.stock >= 4),
)!;
const size = product.variants.find((v) => v.stock >= 4)!.size;
const maker = MAKERS.find((m) => m.customCommissions) ?? MAKERS[0]!;

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  // Lazy images below the fold load as they scroll in; force them so full-page shots are stable.
  await page.evaluate(async () => {
    for (const img of Array.from(document.images)) img.loading = 'eager';
    await Promise.all(
      Array.from(document.images)
        .filter((i) => !i.complete)
        .map((i) => new Promise((r) => ((i.onload = r), (i.onerror = r)))),
    );
  });
}

function masks(page: Page) {
  return [
    page.getByTestId('availability'),
    page.getByTestId('order-number'),
    page.locator('time'),
    page.locator('[data-dynamic]'),
  ];
}

async function snap(page: Page, name: string) {
  await settle(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    mask: masks(page),
    animations: 'disabled',
    maxDiffPixelRatio: 0.02,
  });
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}

test.describe.serial('visual', () => {
  test('discover', async ({ page }) => {
    await page.goto('/');
    await snap(page, 'discover');
  });

  test('product', async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await snap(page, 'product');
  });

  test('maker', async ({ page }) => {
    await page.goto(`/makers/${maker.slug}`);
    await snap(page, 'maker');
  });

  test('bag and order confirmation', async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await page.getByRole('button', { name: `Size ${size}`, exact: true }).click();
    await page
      .getByRole('button', { name: /^Add to bag/ })
      .filter({ visible: true })
      .click();
    await page.getByTestId('view-bag').click();
    await expect(page.getByTestId('bag-line')).toHaveCount(1);
    await snap(page, 'bag');

    await page.getByLabel(/Email for your receipt/).fill('visual-guest@buyer.test');
    await page.getByTestId('checkout-button').click();
    await page.waitForURL(/\/dev\/checkout\//);
    await page.locator('input[name=name]').fill('Visual Guest');
    await page.locator('input[name=line1]').fill('10 Brunswick St');
    await page.locator('input[name=city]').fill('Fitzroy');
    await page.locator('input[name=postalCode]').fill('3065');
    await page.getByTestId('mock-pay').click();
    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    await snap(page, 'order-confirmation');
  });

  test('ask the maker and request a custom piece', async ({ page }) => {
    await login(page, BUYERS[1]!.email);
    await page.goto(`/products/${product.slug}/ask`);
    await expect(page.getByTestId('thread-context')).toBeVisible();
    await snap(page, 'ask-the-maker');

    await page.goto(`/makers/${maker.slug}/commission`);
    await snap(page, 'request-custom-piece');
  });
});
