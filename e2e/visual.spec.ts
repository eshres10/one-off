import { addToBag, checkoutAsGuest } from './checkout-steps';
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
    page.getByTestId('availability-phone'),
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
    await addToBag(page, size);
    const phone = (page.viewportSize()?.width ?? 1280) < 768;
    await expect(page.getByTestId(phone ? 'bag-line-phone' : 'bag-line')).toHaveCount(1);
    await snap(page, 'bag');

    await checkoutAsGuest(page, 'visual-guest@buyer.test', 'Visual Guest', {
      onStep: (name) => snap(page, `checkout-${name}`),
    });
    await snap(page, 'order-confirmation');
  });

  test('ask the maker and request a custom piece', async ({ page }) => {
    await login(page, BUYERS[1]!.email);
    await page.goto(`/products/${product.slug}/ask`);
    await expect(page.getByTestId('thread-context')).toBeVisible();
    await snap(page, 'ask-the-maker');

    await page.goto('/have-it-made');
    await snap(page, 'have-it-made-intro');
  });
});

test.describe('buyer account', () => {
  test('account screens', async ({ page }) => {
    await login(page, BUYERS[2]!.email);
    for (const [path, name] of [
      ['/account', 'account-home'],
      ['/account/orders', 'account-orders'],
      ['/account/sizes', 'account-sizes'],
      ['/account/addresses', 'account-addresses'],
      ['/account/notifications', 'account-notifications'],
    ] as const) {
      await page.goto(path);
      await snap(page, name);
    }
    await page.goto('/account/orders');
    await page.getByTestId('view-order').first().click();
    await expect(page.getByTestId('order-number')).toBeVisible();
    await snap(page, 'account-order');
  });
});
