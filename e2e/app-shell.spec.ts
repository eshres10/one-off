import { expect, test, type Browser, type Page } from '@playwright/test';
import { BUYERS, MAKERS, PASSWORD, PRODUCTS } from '../scripts/seed-data';

// The app shell: glass header, rails, search, saved, conversations and badges (desktop 1280).

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/login');
}

async function signedIn(browser: Browser, email: string, viewport = { width: 1280, height: 860 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await login(page, email);
  return page;
}

const enquiryPiece = PRODUCTS.find(
  (p) => p.productType === 'ready_to_ship' && p.maker.slug === MAKERS[3]!.slug,
)!;
const firstName = (i: number) => BUYERS[i]!.name.split(' ')[0]!;

test.describe.serial('app shell', () => {
  test('header is transparent at the top and frosted after scrolling', async ({ page }) => {
    await page.goto('/');
    const header = page.getByTestId('site-header');
    await expect(header).not.toHaveClass(/glass-nav/);
    expect(await header.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgba(0, 0, 0, 0)',
    );
    // White over the hero while transparent.
    expect(await header.evaluate((el) => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
    await page.mouse.wheel(0, 50);
    await expect(header).toHaveClass(/glass-nav/);
    await expect
      .poll(() => header.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgba(246, 244, 240, 0.55)');
  });

  test('on the homepage the content pushes the header up; scrolling up brings it back', async ({
    page,
  }) => {
    await page.goto('/');
    const header = page.getByTestId('site-header');
    const top = () => header.evaluate((el) => Math.round(el.getBoundingClientRect().top));
    const sheetTop = () =>
      page.evaluate(() =>
        Math.round(document.querySelector('[data-shutter]')!.getBoundingClientRect().top),
      );
    const h = await header.evaluate((el) => (el as HTMLElement).offsetHeight);
    // Bring the content up to the header, then 40px into it: the header moves up 40px with it.
    await page.evaluate((y) => window.scrollTo(0, y), (await sheetTop()) - h + 40);
    await expect.poll(top).toBe(-40);
    // Past it, the header is gone; a small scroll up slides it back.
    await page.evaluate(() => window.scrollBy(0, 600));
    await expect.poll(top).toBe(-h);
    await page.evaluate(() => window.scrollBy(0, -60));
    await expect.poll(top).toBe(0);
  });

  test('on Discover the header scrolls away with the page', async ({ page }) => {
    await page.goto('/discover');
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
    expect(
      await page
        .getByTestId('site-header')
        .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
    ).toBeLessThan(-1000);
  });

  test('rail arrows scroll the track', async ({ page }) => {
    await page.goto('/');
    const rail = page.getByTestId('rail-under-300');
    await rail.scrollIntoViewIfNeeded();
    const track = rail.getByTestId('rail-track');
    await expect(rail.getByTestId('rail-prev')).toBeDisabled();
    await rail.getByTestId('rail-next').click();
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(rail.getByTestId('rail-prev')).toBeEnabled();
    await rail.getByTestId('rail-prev').click();
    await expect.poll(() => track.evaluate((el) => el.scrollLeft)).toBeLessThan(5);
  });

  test('search finds slips and offers a custom piece when nothing matches', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: 'Shop by' })).toBeVisible();
    await page.getByTestId('search-input').fill('slip');
    await expect(page).toHaveURL(/q=slip/);
    await expect(page.getByTestId('search-count')).toContainText('for “slip”');
    expect(
      await page.getByTestId('search-results').getByTestId('product-card').count(),
    ).toBeGreaterThan(0);

    await page.getByTestId('search-input').fill('qwxzyplk');
    await expect(page.getByTestId('search-empty')).toContainText('Nothing for “qwxzyplk”, yet.');
    await expect(page.getByTestId('have-it-made')).toHaveAttribute(
      'href',
      '/have-it-made?q=qwxzyplk',
    );
  });

  test('saving and unsaving from search shows on /saved', async ({ browser }) => {
    const page = await signedIn(browser, BUYERS[3]!.email);
    await page.goto('/search?q=maxi');
    const card = page.getByTestId('search-results').getByTestId('product-card').first();
    const title = (await card.getByRole('heading').innerText()).trim();
    const heart = card.getByTestId('save-button');
    if ((await heart.getAttribute('aria-pressed')) === 'true') {
      await heart.click();
      await expect(heart).toHaveAttribute('aria-pressed', 'false');
    }
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/saved');
    const saved = page.getByTestId('saved-card').filter({ hasText: title });
    await expect(saved).toHaveCount(1);

    await page.goto('/search?q=maxi');
    await page
      .getByTestId('search-results')
      .getByTestId('product-card')
      .filter({ hasText: title })
      .getByTestId('save-button')
      .click();
    await page.waitForTimeout(500);
    await page.goto('/saved');
    await expect(page.getByTestId('saved-card').filter({ hasText: title })).toHaveCount(0);
  });

  test('Ask the maker opens a conversation the maker sees under Needs reply', async ({
    browser,
  }) => {
    const buyer = await signedIn(browser, BUYERS[4]!.email);
    await buyer.goto(`/products/${enquiryPiece.slug}`);
    await buyer.getByTestId('ask-the-maker').filter({ visible: true }).first().click();
    await buyer.waitForURL(/\/messages\/[0-9a-f-]{36}/);
    await buyer.getByTestId('message-input').fill('Is this lined?');
    await buyer.getByTestId('send-message').click();
    await expect(buyer.getByTestId('bubble-mine').last()).toContainText('Is this lined?');

    const seller = await signedIn(browser, enquiryPiece.maker.email);
    await seller.goto('/seller/messages?tab=needs-reply');
    // Old /seller links redirect to Studio.
    await expect(seller).toHaveURL(/\/studio\/messages\?tab=needs-reply/);
    const row = seller.getByTestId('inbox-row').filter({ hasText: firstName(4) });
    await expect(row).toContainText(enquiryPiece.title, { ignoreCase: true });
    await expect(row.getByTestId('needs-reply-tag')).toContainText(/Reply · \d h left/);
  });

  test('messages with an email address are blocked for both sides', async ({ browser }) => {
    const buyer = await signedIn(browser, BUYERS[4]!.email);
    await buyer.goto('/messages');
    await buyer.getByTestId('inbox-row').first().click();
    await buyer.getByTestId('message-input').fill('email me at ava.smith@example.com');
    await expect(buyer.getByTestId('moderation-error')).toContainText(
      'Contact details, bank details and payment links can’t be sent.',
    );
    await expect(buyer.getByTestId('send-message')).toBeDisabled();

    const seller = await signedIn(browser, enquiryPiece.maker.email);
    await seller.goto('/studio/messages');
    await seller
      .getByTestId('inbox-row')
      .filter({ hasText: firstName(4) })
      .click();
    await seller.getByTestId('message-input').fill('reach me at studio@example.com');
    await expect(seller.getByTestId('moderation-error')).toContainText(
      'Off-platform sales can get your shop paused.',
    );
    await expect(seller.getByTestId('send-message')).toBeDisabled();
  });

  test('unread badges update in the header and the tab bar', async ({ browser }) => {
    const buyer = await signedIn(browser, BUYERS[5]!.email);
    await buyer.goto(`/products/${enquiryPiece.slug}`);
    await buyer.getByTestId('ask-the-maker').filter({ visible: true }).first().click();
    await buyer.waitForURL(/\/messages\/[0-9a-f-]{36}/);
    await buyer.getByTestId('message-input').fill('Do you ship to Hobart?');
    await buyer.getByTestId('send-message').click();
    await expect(buyer.getByTestId('bubble-mine').last()).toBeVisible();
    await buyer.goto('/');
    await expect(buyer.getByTestId('header-messages')).toHaveText('Messages (0)');

    const seller = await signedIn(browser, enquiryPiece.maker.email);
    await seller.goto('/studio/messages?tab=needs-reply');
    await seller
      .getByTestId('inbox-row')
      .filter({ hasText: firstName(5) })
      .click();
    await seller.getByTestId('message-input').fill('Yes, Australia-wide.');
    await seller.getByTestId('send-message').click();
    await expect(seller.getByTestId('bubble-mine').last()).toContainText('Australia-wide');

    await buyer.goto('/');
    await expect(buyer.getByTestId('header-messages')).toHaveText('Messages (1)');
    await buyer.setViewportSize({ width: 390, height: 844 });
    await buyer.goto('/search');
    await expect(buyer.getByTestId('phone-tabbar').getByTestId('tab-inbox-count')).toHaveText('1');

    // Reading the thread clears both.
    await buyer.getByTestId('phone-tabbar').getByTestId('tab-inbox').click();
    await buyer
      .getByTestId('inbox-row')
      .filter({ hasText: enquiryPiece.maker.displayName })
      .click();
    await expect(buyer.getByTestId('bubble-theirs').last()).toContainText('Australia-wide');
    await buyer.goto('/search');
    await expect(buyer.getByTestId('phone-tabbar').getByTestId('tab-inbox-count')).toHaveCount(0);
  });
});
