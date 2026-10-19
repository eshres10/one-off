import { expect, test, type Browser, type Page } from '@playwright/test';
import postgres from 'postgres';
import { BUYERS, MAKERS, PASSWORD } from '../scripts/seed-data';

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { max: 1, onnotice: () => {} },
);
test.afterAll(() => db.end());

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

/** A seeded delivered item of `type` for a buyer with no cases or returns, delivered `daysAgo`. */
async function deliveredItem(type: string, daysAgo: number, notBuyer: string[] = []) {
  const [row] = await db<
    { itemId: string; orderNumber: string; buyerId: string; makerId: string }[]
  >`
    select oi.id as "itemId", o.order_number as "orderNumber", o.buyer_user_id as "buyerId", oi.maker_id as "makerId"
    from public.order_items oi join public.orders o on o.id = oi.order_id
    where oi.product_type = ${type} and oi.fulfilment_status in ('delivered', 'completed')
      and o.buyer_user_id is not null and oi.refunded_cents = 0
      and not (o.buyer_user_id = any(${notBuyer}::uuid[]))
      and not exists (select 1 from public.return_claims c where c.order_item_id = oi.id)
      and not exists (select 1 from public.returns r where r.order_item_id = oi.id)
    order by oi.id limit 1`;
  await db`update public.order_items set delivered_at = now() - make_interval(days => ${daysAgo}),
    return_policy = null where id = ${row!.itemId}`;
  return row!;
}

async function contextPage(browser: Browser, width: number) {
  const ctx = await browser.newContext(
    width < 768
      ? { viewport: { width, height: 844 }, isMobile: true, hasTouch: true }
      : { viewport: { width, height: 860 } },
  );
  return ctx.newPage();
}

test.describe.serial('change-of-mind returns', () => {
  test('ready to ship: Return this piece → started → maker marks received → refunded', async ({
    browser,
  }) => {
    const item = await deliveredItem('ready_to_ship', 3);
    const buyer = BUYERS.find((b) => b.id === item.buyerId)!;
    const maker = MAKERS.find((m) => m.id === item.makerId)!;
    await db`update public.makers set return_address = ${'Studio 4, 12 Smith St\nFitzroy VIC 3065'} where id = ${maker.id}`;

    const page = await contextPage(browser, 390);
    await login(page, buyer.email, `/account/orders/${item.orderNumber}`);
    const offer = page
      .getByTestId('return-offer')
      .filter({ has: page.locator(`a[href$="/return/${item.itemId}"]`) });
    await expect(offer).toContainText('Ready to ship · return by');
    await offer.getByTestId('return-piece').click();
    await expect(page.getByTestId('return-drawer')).toBeVisible();
    await page.getByTestId('return-reason-doesnt_fit').check();
    await page.getByTestId('return-next').click();
    await expect(page.getByTestId('return-start')).toBeDisabled();
    await page.getByTestId('return-condition').check();
    await page.getByTestId('return-start').click();
    await expect(page.getByTestId('return-address')).toContainText('12 Smith St');
    await page.getByTestId('return-tracking').fill('AP12345678');
    await page.getByTestId('return-done').click();
    await expect(page.getByTestId('return-sent')).toContainText('Return started.');
    const [r] = await db<{ id: string; number: string; status: string }[]>`
      select id, number, status from public.returns where order_item_id = ${item.itemId}`;
    expect(r!.status).toBe('in_transit');

    const studio = await contextPage(browser, 1280);
    await login(studio, maker.email, '/studio/orders?tab=returns');
    const row = studio.getByTestId('return-row').filter({ hasText: r!.number });
    await expect(row).toContainText('On its way back');
    await row.getByTestId('mark-received').click();
    await row.getByTestId('confirm-received').click();
    await expect(row).toContainText('Refunded');
    const [after] = await db<
      { status: string }[]
    >`select status from public.returns where id = ${r!.id}`;
    expect(after!.status).toBe('refunded');
  });

  test('made to order and one of one say "Not returnable for change of mind"; 15 days is too late', async ({
    browser,
  }) => {
    const mto = await deliveredItem('made_to_order', 3);
    const page = await contextPage(browser, 1280);
    await login(
      page,
      BUYERS.find((b) => b.id === mto.buyerId)!.email,
      `/account/orders/${mto.orderNumber}`,
    );
    await expect(page.getByTestId('not-returnable').first()).toHaveText(
      'Not returnable for change of mind',
    );
    // The return page itself refuses too.
    await page.goto(`/account/orders/${mto.orderNumber}/return/${mto.itemId}`);
    await expect(page.getByTestId('return-closed')).toContainText(
      'Not returnable for change of mind',
    );

    const late = await deliveredItem('ready_to_ship', 15, [mto.buyerId]);
    const p2 = await contextPage(browser, 1280);
    await login(
      p2,
      BUYERS.find((b) => b.id === late.buyerId)!.email,
      `/account/orders/${late.orderNumber}`,
    );
    await p2.goto(`/account/orders/${late.orderNumber}/return/${late.itemId}`);
    await expect(p2.getByTestId('return-closed')).toContainText('window has closed');
  });
});
