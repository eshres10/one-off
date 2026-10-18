import { expect, test, type Page } from '@playwright/test';
import { BUYERS, PASSWORD, PRODUCTS } from '../scripts/seed-data';

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
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

test.describe.serial('marketplace smoke', () => {
  let orderNumber = '';

  test('browse the home feed', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Original fashion/i })).toBeVisible();
    const cards = page.getByTestId('product-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
    // Every card shows the maker.
    await expect(cards.first()).toContainText('·');
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

    await page.getByRole('radio', { name: `Size ${size}` }).click();
    await page.getByRole('button', { name: 'Add to bag' }).click();
    await page.getByTestId('view-bag').click();

    await expect(page.getByTestId('bag-line')).toHaveCount(1);
    await expect(page.getByText(`Ships from ${product.maker.displayName}`)).toBeVisible();
    await page.getByLabel(/Email for your receipt/).fill('e2e-guest@buyer.test');
    await page.getByTestId('checkout-button').click();

    await page.waitForURL(/\/dev\/checkout\//);
    await page.locator('input[name=name]').fill('E2E Guest');
    await page.locator('input[name=line1]').fill('10 Brunswick St');
    await page.locator('input[name=city]').fill('Fitzroy');
    await page.locator('input[name=postalCode]').fill('3065');
    await page.getByTestId('mock-pay').click();

    await expect(page.getByTestId('order-confirmation')).toBeVisible();
    orderNumber = (await page.getByTestId('order-number').innerText()).trim();
    expect(orderNumber).toMatch(/^AL-\d+$/);
    await expect(page.getByTestId('order-confirmation')).toContainText(product.title);
    // Bag is emptied by the verified webhook.
    await page.goto('/bag');
    await expect(page.getByText('Your bag is empty')).toBeVisible();
  });

  test('send an "Ask the maker" message', async ({ page }) => {
    await login(page, BUYERS[0]!.email, `/products/${product.slug}`);
    await page.getByRole('link', { name: 'Ask the maker' }).click();
    await expect(page.getByTestId('thread-context')).toContainText(product.title);
    await page.getByRole('button', { name: 'What size should I get?' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.waitForURL(/\/account\/messages\//);
    await expect(page.getByTestId('message-list')).toContainText('What size should I get?');

    // Moderation blocks off-platform payment requests before sending.
    await page.getByLabel('Message', { exact: true }).fill('Can I just PayID you instead?');
    await expect(page.getByText(/Payments and contact must stay on the platform/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
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
