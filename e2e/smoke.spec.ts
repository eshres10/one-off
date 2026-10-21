import { addToBag, checkoutAsGuest, isPhone } from './checkout-steps';
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
    const phone = isPhone(page);
    const cards = page.getByTestId(phone ? 'phone-tile' : 'product-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(8);
    // Every card shows the maker.
    await expect(cards.first()).toContainText(
      new RegExp(MAKERS.map((m) => m.displayName).join('|')),
    );
    if (phone) await page.getByTestId('pill-new-in').click();
    else await page.getByRole('tab', { name: 'New this week' }).click();
    await expect(page).toHaveURL(/tab=new/);
    await expect(cards.first()).toBeVisible();
  });

  test('open a product, add to bag and pay with Stripe (test mode)', async ({ page }) => {
    await page.goto(`/products/${product.slug}`);
    await expect(page.getByRole('heading', { level: 1, name: product.title })).toBeVisible();
    const phone = isPhone(page);
    if (phone) await expect(page.getByTestId('availability-phone')).toContainText('Ready to ship');
    else {
      await expect(
        page.getByLabel('Shipping, returns and protection').getByText('Buyer protection'),
      ).toBeVisible();
      await expect(page.getByTestId('availability')).toContainText('Ready to ship');
    }

    await addToBag(page, size);

    await expect(page.getByTestId(phone ? 'bag-line-phone' : 'bag-line')).toHaveCount(1);
    if (phone)
      await expect(
        page.getByRole('region', { name: `From ${product.maker.displayName}` }),
      ).toBeVisible();
    else await expect(page.getByText(`Ships from ${product.maker.displayName}`)).toBeVisible();
    orderNumber = await checkoutAsGuest(page, 'e2e-guest@buyer.test');
    expect(orderNumber).toMatch(/^OO-\d+$/);
    await expect(page.getByTestId('order-confirmed')).toContainText(product.title);
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
    // Wait for the post-send reset so it can't wipe the next draft.
    await expect(page.getByTestId('message-input')).toHaveValue('');
    await page.getByTestId('message-input').fill('Can I just PayID you instead?');
    await expect(page.getByTestId('moderation-error')).toContainText('covered by buyer protection');
    await expect(page.getByTestId('send-message')).toBeDisabled();
  });

  test('seller logs in and sees the order', async ({ page }) => {
    expect(orderNumber).not.toBe('');
    await login(page, product.maker.email, '/studio/orders');
    const short = orderNumber.replace(/^OO-/, '#');
    if (isPhone(page)) {
      // The app's Orders: a row per order showing "#10002"; its detail has one next-step button.
      const row = page.getByTestId('phone-order-row').filter({ hasText: short });
      await expect(row).toBeVisible();
      await row.click();
      await page.waitForURL(/\/studio\/orders\/[0-9a-f-]{36}/);
      await expect(page.getByTestId('next-step')).toHaveText('It’s packed');
      await page.getByTestId('next-step').click();
      await expect(page.getByTestId('next-step')).toHaveText('Ship it');
      await page.getByTestId('next-step').click();
      await expect(page.getByTestId('ship-sheet')).toBeVisible();
      await page.getByTestId('tracking-input').fill('AP998877AU');
      await page.getByTestId('mark-shipped-phone').click();
      await expect(page.getByTestId('app-toast')).toContainText(/shipped/i);
      await expect(page.getByTestId('order-timeline')).toContainText('Shipped');
    } else {
      const card = page.getByTestId('order-card').filter({ hasText: short });
      await expect(card).toBeVisible();
      await card.click();
      await page.getByTestId('tracking-number').fill('AP998877AU');
      await page.getByTestId('mark-shipped').click();
      await expect(page.getByTestId('toast')).toContainText(/shipped/i);
    }
  });
});
