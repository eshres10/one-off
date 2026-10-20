import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { getReturnPolicy } from '../lib/returns/policy';
import { checkoutAsGuest } from './checkout-steps';
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
    await expect(row).toContainText(getReturnPolicy('made_to_order').detail);
    await page.goto(`/products/${ready.slug}`);
    await expect(page.locator('details#returns')).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('returns-row')).toContainText(
      getReturnPolicy('ready_to_ship').detail,
    );
  });

  test('payment shows the no change-of-mind line, and paying records that it was shown', async ({
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
    await expect(page.getByTestId('bag-returns-note').first()).toHaveText(
      getReturnPolicy('ready_to_ship').summary,
    );
    await checkoutAsGuest(page, 'returns-ack@buyer.test', 'Returns Ack');
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
    await expect(page.locator(`a[href$="/report/${old!.id}"]`)).toHaveCount(0);

    await page.goto(`/account/orders/${recent!.orderId}`);
    await page.locator(`a[href$="/report/${recent!.id}"]`).click();
    const drawer = page.getByTestId('report-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Changed your mind?');
    await page.getByTestId('reason-faulty').check();
    await page.getByTestId('report-next').click();
    // A photo is needed for a faulty piece.
    await page.getByTestId('report-details').fill('The side seam split on the first wear.');
    await expect(page.getByTestId('report-next')).toBeDisabled();
    await page.getByTestId('report-photos').setInputFiles({
      name: 'seam.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await expect(page.getByText('Added')).toBeVisible();
    await page.getByTestId('report-next').click();
    await expect(drawer).toContainText('Australian Consumer Law');
    await page.getByTestId('outcome-repair').check();
    await page.getByTestId('send-to-maker').click();
    await expect(page.getByTestId('report-sent')).toContainText('We’re on it.');
    await expect(page.getByTestId('case-number')).toContainText(/OO-C-\d+/);
  });

  test('a claim with no reply escalates to Off One after the deadline', async ({ page }) => {
    // The 2-business-day clock is unit-tested with an injected clock (tests/integration/claims);
    // here we move the deadline into the past and check the admin queue escalates it.
    await db`update public.return_claims set respond_by = now() - interval '1 minute' where status = 'open'`;
    await login(page, 'admin@oneoff.test', '/admin/claims');
    await expect(page.getByRole('heading', { name: /Escalated/ })).toContainText('(1)');
    await expect(page.getByTestId('claim-list').first()).toContainText('With Off One');
  });
});

test.describe('report a problem options', () => {
  test('“wasn’t made to my measurements” only shows for made to order', async ({ page }) => {
    const items = await db<{ id: string; orderId: string; productType: string; buyerId: string }[]>`
      select oi.id, oi.order_id as "orderId", oi.product_type as "productType", o.buyer_user_id as "buyerId"
      from public.order_items oi join public.orders o on o.id = oi.order_id
      where oi.fulfilment_status = 'delivered' and o.buyer_user_id is not null
        and not exists (select 1 from public.return_claims c where c.order_item_id = oi.id)
      order by oi.id`;
    const mto = items.find((i) => i.productType === 'made_to_order')!;
    const ready =
      items.find((i) => i.productType !== 'made_to_order' && i.buyerId === mto.buyerId) ??
      items.find((i) => i.productType !== 'made_to_order')!;
    for (const i of [mto, ready])
      await db`update public.order_items set delivered_at = now() - interval '1 day' where id = ${i.id}`;
    const email = (id: string) => BUYERS.find((b) => b.id === id)!.email;

    await login(page, email(mto.buyerId), `/account/orders/${mto.orderId}/report/${mto.id}`);
    await expect(page.getByTestId('reason-custom_fit')).toBeVisible();
    if (ready.buyerId !== mto.buyerId) {
      await page.context().clearCookies();
      await login(
        page,
        email(ready.buyerId),
        `/account/orders/${ready.orderId}/report/${ready.id}`,
      );
    } else await page.goto(`/account/orders/${ready.orderId}/report/${ready.id}`);
    await expect(page.getByTestId('reason-faulty')).toBeVisible();
    await expect(page.getByTestId('reason-custom_fit')).toHaveCount(0);
  });
});
