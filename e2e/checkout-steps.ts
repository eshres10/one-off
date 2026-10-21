import { expect, type Page } from '@playwright/test';

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;

/** Picks a size and adds to the bag: the size sheet on phones, the size pills on desktop. */
export async function addToBag(page: Page, size: string) {
  if (isPhone(page)) {
    await page.getByTestId('add-to-bag').click();
    await page.getByRole('button', { name: `Size ${size}`, exact: true }).click();
    await page.getByTestId('size-sheet-add').click();
  } else {
    await page.getByRole('button', { name: `Size ${size}`, exact: true }).click();
    await page
      .getByRole('button', { name: /^Add to bag/ })
      .filter({ visible: true })
      .click();
  }
  await page.getByTestId('view-bag').click();
}

/**
 * From the bag, through /checkout (Details → Delivery → Payment) with the mock card, to the
 * Thank you page. Returns the order number. Works at desktop and phone widths.
 */
export async function checkoutAsGuest(
  page: Page,
  email: string,
  name = 'E2E Guest',
  opts: { saveDetails?: boolean; onStep?: (step: string) => Promise<void> } = {},
): Promise<string> {
  const step = async (name: string) => opts.onStep?.(name);
  const phone = isPhone(page);
  await page.getByTestId(phone ? 'checkout-button-phone' : 'checkout-button').click();
  await page.waitForURL(/\/checkout$/);
  const next = async (label: string) => {
    if (phone) await page.getByTestId('checkout-sticky-button').click();
    else await page.getByRole('button', { name: label }).click();
  };
  await expect(page.getByTestId('co-email')).toBeVisible();
  await step('details');
  await page.getByTestId('co-email').fill(email);
  await page.getByTestId('co-phone').fill('0400 111 222');
  await next('Continue to delivery');
  await expect(page.locator('#co-name')).toBeVisible();
  await page.locator('#co-name').fill(name);
  await page.locator('#co-line1').fill('10 Brunswick St');
  await page.locator('#co-suburb').fill('Fitzroy');
  await page.locator('#co-state').selectOption('VIC');
  await page.locator('#co-postcode').fill('3065');
  await step('delivery');
  await next('Continue to payment');
  const pay = page.getByTestId(phone ? 'pay-button-phone' : 'pay-button');
  await expect(pay).toBeVisible();
  if (opts.saveDetails === false) {
    const save = page.getByTestId('save-details');
    if ((await save.getAttribute('aria-checked')) === 'true') await save.click();
  }
  await step('payment');
  await pay.click();
  await page.waitForURL(/\/checkout\/confirmed\//, { timeout: 30_000 });
  await expect(page.getByTestId('order-confirmed')).toBeVisible();
  return decodeURIComponent(page.url().split('/checkout/confirmed/')[1]!.split(/[?#]/)[0]!);
}
