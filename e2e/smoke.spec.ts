import { expect, test, type Page } from '@playwright/test';
import { BUYERS, MAKERS, PASSWORD, PRODUCTS } from '../scripts/seed-data';

// A ready-to-ship piece with plenty of stock in at least one size.
const product = PRODUCTS.find(
  (p) =>
    p.productType === 'ready_to_ship' &&
    p.colours.length === 1 &&
    p.variants.some((v) => v.stock >= 4),
)!;
const size = product.variants.find((v) => v.stock >= 4)!.size;

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

test.describe.serial('marketplace smoke', () => {
  let orderNumber = '';

  test('browse the home feed', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Bespoke pieces made just for you/i }),
    ).toBeVisible();
    const cards = page.getByTestId('product-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
    // Every card shows the maker.
    await expect(cards.first()).toContainText(
      new RegExp(MAKERS.map((m) => m.displayName).join('|')),
    );
    await page.getByRole('link', { name: 'New this week' }).first().click();
    await expect(page).toHaveURL(/tab=new/);
    await expect(page.getByTestId('product-card').first()).toBeVisible();
  });

  test('open a product, add to bag and pay with Stripe (test mode)', async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: product.title })).toBeVisible();
    await expect(
      page.getByLabel('Shipping, returns and protection').getByText('Buyer protection'),
    ).toBeVisible();
    await expect(page.getByTestId('availability')).toContainText('Ready to ship');

    await page.getByRole('button', { name: `Size ${size}`, exact: true }).click();
    await page
      .getByRole('button', { name: /^Add to bag/ })
      .filter({ visible: true })
      .click();
    await page.getByTestId('view-bag').click();

    await expect(page.getByTestId('bag-line')).toHaveCount(1);
    await expect(page.getByText(`Ships from ${product.maker.displayName}`)).toBeVisible();
    await page.getByLabel(/Email for your receipt/).fill('e2e-guest@buyer.test');
    await page.getByLabel(/returned for change of mind/).check();
    await page.getByTestId('checkout-button').click();

    await page.waitForURL(/\/dev\/checkout\//);
    await page.locator('input[name=name]').fill('E2E Guest');
    await page.locator('input[name=line1]').fill('10 Brunswick St');
    await page.locator('input[name=city]').fill('Fitzroy');
    await page.locator('input[name=postalCode]').fill('3065');
    await page.getByTestId('mock-tos').check();
    await page.getByTestId('mock-pay').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    orderNumber = (await page.getByTestId('order-number').innerText()).trim();
    expect(orderNumber).toMatch(/^OO-\d+$/);
    await expect(page.getByTestId('order-confirmation')).toContainText(product.title);
    // Bag is emptied by the verified webhook.
    await page.goto('/bag');
    await expect(page.getByText('Your bag is empty')).toBeVisible();
  });

  test('send an "Ask the maker" message', async ({ page }) => {
    await login(page, BUYERS[0]!.email, `/products/${product.slug}`);
    await page.getByTestId('ask-the-maker').filter({ visible: true }).first().click();
    // Straight into the conversation for this piece.
    await page.waitForURL(/\/messages\/[0-9a-f-]{36}/);
    await expect(page.getByTestId('piece-strip')).toContainText(product.title);
    await page.getByRole('button', { name: 'What size should I get?' }).click();
    await page.getByTestId('send-message').click();
    await expect(page.getByTestId('message-list')).toContainText('What size should I get?');

    // Moderation blocks off-platform payment requests before sending.
    await page.getByTestId('message-input').fill('Can I just PayID you instead?');
    await expect(page.getByTestId('moderation-error')).toContainText('covered by buyer protection');
    await expect(page.getByTestId('send-message')).toBeDisabled();
  });

  test('seller logs in and sees the order', async ({ page }) => {
    expect(orderNumber).not.toBe('');
    await login(page, product.maker.email, '/seller/orders');
    await expect(page.getByTestId('seller-orders')).toContainText(orderNumber);
    await page.getByRole('link', { name: orderNumber }).click();
    await page.getByLabel('Tracking number').fill('AP998877AU');
    await page.getByRole('button', { name: 'Mark as shipped' }).click();
    await expect(page.getByText('Order updated')).toBeVisible();
  });
});
