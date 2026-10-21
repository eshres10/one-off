import postgres from 'postgres';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { ADMIN, BUYERS, MAKERS, PASSWORD, PRODUCTS } from '../scripts/seed-data';
import {
  fern,
  fillBrief,
  halde,
  isPhone,
  login,
  next,
  sendToThree,
  signInAtFind,
} from './have-it-made-steps';

// Have it made, end to end: a guest fills in the brief and signs in to find makers, picks three,
// the makers quote or pass in Studio, the buyer accepts and pays, and the team's help page. Runs
// against the e2e server; the phone and desktop projects each record a video.
const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { transform: postgres.camel, max: 2, onnotice: () => {} },
);
test.afterAll(() => db.end());

async function quoteAsHalde(browser: Browser, number: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, halde.email, '/studio/requests');
  await page.getByTestId(`request-${number}`).click();
  await expect(page.getByTestId('request-detail')).toContainText('A buyer in Fitzroy, VIC');
  await expect(page.getByTestId('request-measurements')).toContainText('88');
  await page.getByTestId('quote-price-input').fill('560');
  await expect(page.getByTestId('quote-you-get')).toContainText('Within their budget');
  await page.locator('[data-testid^=ready-]').nth(1).click();
  await page.getByTestId('fittings-studio_one').click();
  await page.getByTestId('quote-fabric').fill('Butter silk satin, deadstock');
  await page
    .getByTestId('quote-note')
    .fill(
      'I’d cut it on the bias with a cowl back. Flutter sleeves in a lighter silk so they move.',
    );
  await expect(page.getByTestId('send-quote')).toBeDisabled();
  await page.getByTestId('quote-can-make').check();
  await page.screenshot({ path: 'e2e/__screenshots__/have-it-made/studio-requests-quote.png' });
  await page.getByTestId('send-quote').click();
  await expect(page.getByTestId('quote-sent-price')).toHaveText('A$560', { timeout: 20_000 });
  await page.goto('/studio/requests?tab=settings');
  await expect(page.getByTestId('custom-settings')).toBeVisible();
  await page.screenshot({ path: 'e2e/__screenshots__/have-it-made/studio-custom-settings.png' });
  await ctx.close();
}

async function passAsFern(browser: Browser, number: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, fern.email, '/studio/requests');
  await page.getByTestId(`request-${number}`).click();
  await page.getByTestId('pass-toggle').click();
  await page.getByLabel('Fully booked').check();
  await page.screenshot({ path: 'e2e/__screenshots__/have-it-made/studio-requests-pass.png' });
  await page.getByTestId('pass-send').click();
  await expect(page.getByTestId('quote-panel')).toContainText('You passed', { timeout: 20_000 });
  await ctx.close();
}

async function acceptAndPay(page: Page, number: string) {
  await page.goto(`/account/requests/${number}`);
  await expect(page.getByTestId('quotes')).toBeVisible();
  await expect(page.getByTestId('quote-passed')).toContainText('Not available this time');
  await expect(page.getByTestId('quote-waiting')).toContainText('hours left');
  await page.getByTestId('quote-accept').click();
  await expect(page.getByTestId('accept')).toBeVisible();
  await expect(page.getByTestId('accept-total')).toHaveText('A$572');
  await page.getByTestId('accept-name').fill('Ava Buyer');
  await page.getByTestId('accept-line1').fill('10 Brunswick St');
  await page.getByTestId('accept-suburb').fill('Fitzroy');
  await page.getByTestId('accept-state').selectOption('VIC');
  await page.getByTestId('accept-postcode').fill('3065');
  await page.getByTestId('accept-pay').click();
  await page.waitForURL(/paid=1/, { timeout: 60_000 });
  await expect(page.getByTestId('in-the-making')).toContainText('in the making');
  await page.getByTestId('see-order').click();
  await expect(page.getByTestId('custom-progress')).toBeVisible();
}

test.describe('Have it made', () => {
  test('a guest fills the brief, signs in at Find my makers, three makers hear, one quotes, one passes, the buyer pays', async ({
    page,
    browser,
  }) => {
    test.setTimeout(240_000);
    const b = BUYERS[10]!;
    await fillBrief(page);
    await signInAtFind(page, b.email);
    const number = await sendToThree(page);
    const rows = await db<{ makerId: string; replyBy: Date; sentAt: Date }[]>`
      select x.maker_id, x.reply_by, r.sent_at from public.custom_request_recipients x
      join public.custom_requests r on r.id = x.request_id where r.number = ${number}`;
    expect(rows).toHaveLength(3);
    for (const r of rows)
      expect(new Date(r.replyBy).getTime() - new Date(r.sentAt).getTime()).toBe(48 * 3_600_000);

    if (!isPhone(page)) {
      await quoteAsHalde(browser, number);
      await passAsFern(browser, number);
    } else {
      // The phone recording is the buyer's side; the makers answer in the database.
      const [r] = await db<
        { id: string }[]
      >`select id from public.custom_requests where number = ${number}`;
      await db`
        insert into public.custom_quotes (request_id, maker_id, price, ready_by, fittings, fabric, note, can_make_to_measurements)
        values (${r!.id}, ${halde.id}, 56000, current_date + 30, 'studio_one', 'Butter silk satin',
          'I’d cut it on the bias with a cowl back. Flutter sleeves in a lighter silk so they move.', true)`;
      await db`update public.custom_request_recipients set status = 'quoted' where request_id = ${r!.id} and maker_id = ${halde.id}`;
      await db`update public.custom_request_recipients set status = 'passed', pass_reason = 'booked' where request_id = ${r!.id} and maker_id = ${fern.id}`;
      await db`update public.custom_requests set status = 'quoted' where id = ${r!.id}`;
    }
    await acceptAndPay(page, number);
    const [order] = await db<{ status: string; orderType: string }[]>`
      select o.status, o.order_type from public.orders o join public.custom_quotes q on q.id = o.custom_quote_id
      join public.custom_requests r on r.id = q.request_id where r.number = ${number}`;
    expect(order).toEqual({ status: 'paid', orderType: 'custom' });
  });

  test('no matches: widen, then ask Off One for help; the admin sends it to a shop', async ({
    page,
    browser,
  }) => {
    test.skip(isPhone(page), 'desktop only');
    test.setTimeout(180_000);
    const b = BUYERS[11]!;
    await login(page, b.email, '/have-it-made');
    // A$300–450, an in-person fitting and only 12 days: Fern doesn't do fittings, Lune starts at
    // A$700 and Halde needs three weeks. Two more weeks finds Halde.
    const inTwelveDays = new Date(Date.now() + 12 * 86_400_000).toISOString().slice(0, 10);
    await fillBrief(page, { fitting: true, budget: 0, date: inTwelveDays });
    await next(page).click();
    await expect(page.getByTestId('finding')).toBeVisible();
    await expect(page.getByTestId('no-matches')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('widen-date')).toContainText('maker');
    await page.getByTestId('widen-date').click();
    await expect(page.getByTestId('matches')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('ask-help-link').click();
    await page
      .getByTestId('help-note')
      .fill('I’m flexible on the date if it means the right maker.');
    await page.getByTestId('help-send').click();
    await expect(page.getByTestId('help-sent')).toBeVisible({ timeout: 20_000 });
    const number = /OO-C-\d+/.exec(await page.getByTestId('help-sent').innerText())![0];

    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const admin = await ctx.newPage();
    await login(admin, ADMIN.email, '/admin/help-requests');
    await admin.getByTestId(`help-${number}`).click();
    await expect(admin.getByTestId('help-detail')).toContainText('flexible on the date');
    await admin.screenshot({
      path: 'e2e/__screenshots__/have-it-made/admin-help-requests.png',
      fullPage: true,
    });
    await admin.getByTestId('send-to-maker-select').selectOption(fern.id);
    await admin.getByTestId('send-to-maker-send').click();
    await expect(admin.getByTestId('send-to-maker')).toContainText('Sent', { timeout: 20_000 });
    await ctx.close();

    const studio = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const maker = await studio.newPage();
    await login(maker, fern.email, '/studio/requests');
    await expect(maker.getByTestId(`request-${number}`)).toBeVisible();
    await studio.close();
  });

  test('the old routes redirect, and reduced motion stills the loop', async ({ page, browser }) => {
    test.skip(isPhone(page), 'desktop only');
    await page.goto('/custom?q=green+dress');
    await expect(page).toHaveURL(/\/have-it-made\?q=green(%20|\+)dress/);
    const product = PRODUCTS.find((p) => p.maker.id === halde.id)!;
    await page.goto(`/makers/${halde.slug}/commission?product=${product.id}`);
    await expect(page).toHaveURL(new RegExp(`/have-it-made\\?source_listing_id=${product.id}`));
    await expect(page.getByTestId('source-chip')).toContainText(product.title);

    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    const still = await ctx.newPage();
    await login(still, BUYERS[12]!.email, '/have-it-made');
    await fillBrief(still);
    await next(still).click();
    await expect(still.getByTestId('finding')).toBeVisible();
    const animation = await still
      .locator('.loop-draw ellipse')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
    await ctx.close();
  });
});
