import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { BUYERS, PASSWORD } from '../scripts/seed-data';

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { max: 1, onnotice: () => {} },
);
test.afterAll(() => db.end());

const PAGES = ['/about', '/how-it-works', '/help', '/size-guide', '/legal/returns', '/legal/terms'];
const ACK =
  'One Off acknowledges the Traditional Custodians of the lands across Australia on which our makers live and work, and pays respect to Elders past and present.';

/** How far the page reaches past the right edge, ignoring content inside sideways scrollers. */
const overflow = (page: Page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    let widest = 0;
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      let p = el.parentElement;
      let inScroller = false;
      while (p) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'auto' || o === 'scroll' || o === 'hidden') {
          inScroller = true;
          break;
        }
        p = p.parentElement;
      }
      if (!inScroller) widest = Math.max(widest, el.getBoundingClientRect().right);
    }
    return Math.round(widest - vw);
  });

test.describe('content pages', () => {
  for (const width of [390, 1280]) {
    test(`every page fits ${width}px with no sideways scroll, and the footer has the Acknowledgement`, async ({
      browser,
    }) => {
      const ctx = await browser.newContext({
        viewport: { width, height: 900 },
        ...(width < 768 ? { isMobile: true, hasTouch: true } : {}),
      });
      const page = await ctx.newPage();
      for (const url of PAGES) {
        const res = await page.goto(url);
        expect(res?.status(), url).toBe(200);
        expect(await overflow(page), url).toBeLessThanOrEqual(1);
        await expect(page.getByTestId('acknowledgement')).toHaveText(ACK);
      }
      await ctx.close();
    });
  }

  test('Our story is signed by the founder', async ({ page }) => {
    await page.goto('/about');
    await expect(page.getByTestId('founder-signature')).toHaveText('Ena Shrestha');
  });

  test('FAQ search finds Afterpay and opens it; the accordion works from the keyboard', async ({
    page,
  }) => {
    await page.goto('/help');
    await page.getByTestId('help-search').fill('Afterpay');
    const q = page.getByTestId('faq-question').first();
    await expect(q).toContainText('How can I pay?');
    await expect(q).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('faq-answer').first()).toContainText('Afterpay');
    await expect(page.locator('mark').first()).toHaveText(/afterpay/i);

    await page.getByTestId('help-search').fill('');
    const second = page.getByTestId('faq-question').nth(1);
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press(' ');
    await expect(second).toHaveAttribute('aria-expanded', 'false');

    await page.getByTestId('help-search').fill('zzzz nothing');
    await expect(page.getByTestId('help-no-results')).toContainText(
      'No answers for “zzzz nothing”',
    );
  });

  test('a link to a question opens it, and the page has valid FAQPage data', async ({ page }) => {
    await page.goto('/help#made-to-order');
    await expect(page.locator('#made-to-order [data-testid=faq-question]')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    const json = await page.locator('script[type="application/ld+json"]').first().textContent();
    const data = JSON.parse(json!);
    expect(data['@type']).toBe('FAQPage');
    expect(data.mainEntity.length).toBeGreaterThan(10);
    expect(data.mainEntity[0]).toMatchObject({
      '@type': 'Question',
      acceptedAnswer: { '@type': 'Answer' },
    });
  });

  test('Message us stores a request', async ({ page }) => {
    await page.goto('/help');
    await page.getByTestId('message-us').click();
    const form = page.getByTestId('contact-form');
    await form.getByLabel('Your name').fill('Content Test');
    await form.getByLabel('Email').fill('content.test@buyer.test');
    await form.getByLabel('Message').fill('Where can I see my order tracking please?');
    await page.getByTestId('contact-send').click();
    await expect(page.getByTestId('contact-sent')).toBeVisible();
    const [row] = await db<{ n: number }[]>`
      select count(*)::int as n from public.support_requests where email = 'content.test@buyer.test'`;
    expect(row!.n).toBe(1);
  });

  test('size guide switches cm/in and highlights a signed-in buyer’s saved size', async ({
    page,
  }) => {
    await page.goto('/size-guide');
    await expect(page.getByTestId('cell-bust-10')).toHaveText('87');
    await page.getByTestId('unit-in').click();
    await expect(page.getByTestId('cell-bust-10')).toHaveText('34.3');
    // Remembered on this device.
    await page.reload();
    await expect(page.getByTestId('cell-bust-10')).toHaveText('34.3');

    const buyer = BUYERS[4]!;
    await db`insert into public.customer_prefs (user_id, usual_size) values (${buyer.id}, '12')
      on conflict (user_id) do update set usual_size = '12'`;
    await page.goto('/login?next=%2Fsize-guide');
    await page.getByLabel('Email', { exact: true }).fill(buyer.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/size-guide/);
    await expect(page.locator('[data-testid=size-table] th[data-highlight]')).toHaveText('12');
  });

  test('legal pages show the draft banner, old addresses forward, and the PDF downloads', async ({
    page,
    request,
  }) => {
    await page.goto('/returns');
    await expect(page).toHaveURL(/\/legal\/returns$/);
    await expect(page.getByTestId('legal-draft-banner')).toContainText(
      'Draft layout for legal review. Wording to be written by a lawyer before launch.',
    );
    await expect(page.getByTestId('legal-in-short')).toContainText('Ready-to-ship pieces');
    await expect(page.getByRole('heading', { name: '5. Change-of-mind returns' })).toBeVisible();
    for (const [from, to] of [
      ['/terms', '/legal/terms'],
      ['/help/about', '/about'],
      ['/help/how-it-works', '/how-it-works'],
    ]) {
      await page.goto(from!);
      await expect(page).toHaveURL(new RegExp(`${to}$`));
    }
    const pdf = await request.get('/legal/returns/pdf');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
