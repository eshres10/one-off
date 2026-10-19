import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { RETURNS } from '../lib/content/returns';
import { BUYERS, PASSWORD, PRODUCTS } from '../scripts/seed-data';

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { max: 1, onnotice: () => {} },
);
test.afterAll(() => db.end());

// A 1×1 PNG for the claim photo.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

test.describe.serial('returns policy', () => {
  test('product pages show the right returns line', async ({ page }) => {
    const ready = PRODUCTS.find((p) => p.productType === 'ready_to_ship')!;
    const mto = PRODUCTS.find((p) => p.productType === 'made_to_order')!;
    await page.goto(`/products/${mto.slug}`);
    const row = page.getByTestId('returns-row');
    await expect(row).toBeVisible(); // open by default for made-to-order
    await expect(row).toContainText(RETURNS.short);
    await expect(row).toContainText(RETURNS.madeToOrder);
    await page.goto(`/products/${ready.slug}`);
    await expect(page.locator('details#returns')).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('returns-row')).toHaveText(
      new RegExp(`^${RETURNS.short.replace(/[.?]/g, '\\$&')}`),
    );
  });

  test('checkout is blocked until the returns box is ticked, and the tick is saved', async ({
    page,
  }) => {
    const product = PRODUCTS.find(
      (p) => p.productType === 'ready_to_ship' && p.variants.some((v) => v.stock >= 3),
    )!;
    const size = product.variants.find((v) => v.stock >= 3)!.size;
    await page.goto(`/products/${product.slug}`);
    await page.getByRole('button', { name: `Size ${size}`, exact: true }).click();
    await page
      .getByRole('button', { name: /^Add to bag/ })
      .filter({ visible: true })
      .click();
    await page.getByTestId('view-bag').click();
    await expect(page.getByTestId('bag-returns-note').first()).toHaveText(RETURNS.short);
    await page.getByLabel(/Email for your receipt/).fill('returns-ack@buyer.test');

    const checkout = page.getByTestId('checkout-button');
    await expect(checkout).toHaveAttribute('aria-disabled', 'true');
    // aria-disabled (not disabled), so a real click still reaches the form; Playwright needs force.
    await checkout.click({ force: true });
    await expect(page.locator('#returnsAck-error')).toContainText('tick the box');
    await expect(page).toHaveURL(/\/bag/);
    const box = page.getByLabel(/returned for change of mind/);
    await expect(box).toBeFocused();

    await box.check();
    await expect(checkout).not.toHaveAttribute('aria-disabled', 'true');
    await checkout.click();
    await page.waitForURL(/\/dev\/checkout\//);
    await expect(page.getByTestId('mock-submit-message')).toContainText(
      'No change-of-mind returns',
    );
    const [order] = await db<{ returnsAckAt: Date | null; returnsPolicyVersion: string | null }[]>`
      select returns_ack_at as "returnsAckAt", returns_policy_version as "returnsPolicyVersion"
      from public.orders where buyer_email = 'returns-ack@buyer.test' order by created_at desc limit 1`;
    expect(order?.returnsAckAt).toBeTruthy();
    expect(order?.returnsPolicyVersion).toBeTruthy();
  });

  test('a buyer can report a problem inside the window, and sees “Contact us” after it', async ({
    page,
  }) => {
    // A buyer with two delivered pieces: one delivered yesterday, one 10 days ago.
    const [pick] = await db<{ buyerId: string }[]>`
      select o.buyer_user_id as "buyerId" from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.fulfilment_status = 'delivered' and o.buyer_user_id is not null
        and not exists (select 1 from public.return_claims c where c.buyer_id = o.buyer_user_id)
      group by o.buyer_user_id having count(*) >= 2 limit 1`;
    const buyer = BUYERS.find((b) => b.id === pick!.buyerId)!;
    const items = await db<{ id: string; orderId: string }[]>`
      select oi.id, oi.order_id as "orderId" from public.order_items oi join public.orders o on o.id = oi.order_id
      where o.buyer_user_id = ${buyer.id} and oi.fulfilment_status = 'delivered'
      order by oi.id limit 2`;
    const [recent, old] = items;
    await db`update public.order_items set delivered_at = now() - interval '1 day' where id = ${recent!.id}`;
    await db`update public.order_items set delivered_at = now() - interval '10 days' where id = ${old!.id}`;

    await login(page, buyer.email, `/account/orders/${old!.orderId}`);
    await expect(page.getByTestId('contact-us').first()).toBeVisible();
    await expect(
      page.locator(`a[href="/account/orders/${old!.orderId}/report/${old!.id}"]`),
    ).toHaveCount(0);

    await page.goto(`/account/orders/${recent!.orderId}`);
    await page.locator(`a[href="/account/orders/${recent!.orderId}/report/${recent!.id}"]`).click();
    await expect(page.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
    await page.getByLabel('Faulty', { exact: true }).check();
    await page.getByLabel('Tell us what happened').fill('The side seam split on the first wear.');
    await page.getByLabel('Photos (1–6)').setInputFiles({
      name: 'seam.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.getByText('Added')).toBeVisible();
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByTestId('claim-sent')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Photo 1 of the problem' })).toBeVisible();
  });

  test('a claim with no reply escalates to One Off after the deadline', async ({ page }) => {
    // The 2-business-day clock is unit-tested with an injected clock (tests/integration/claims);
    // here we move the deadline into the past and check the admin queue escalates it.
    await db`update public.return_claims set respond_by = now() - interval '1 minute' where status = 'open'`;
    await login(page, 'admin@oneoff.test', '/admin/claims');
    await expect(page.getByRole('heading', { name: /Escalated/ })).toContainText('(1)');
    await expect(page.getByTestId('claim-list').first()).toContainText('With One Off');
  });
});
