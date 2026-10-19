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
    await expect(page.getByTestId('search-empty')).toContainText('Nothing yet for “qwxzyplk”');
    await expect(page.getByRole('link', { name: 'Request a custom piece' })).toHaveAttribute(
      'href',
      '/custom',
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
    await seller.goto('/studio/messages?tab=needs-reply');
    await expect(seller).toHaveURL(/\/seller\/messages\?tab=needs-reply/);
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
    await seller.goto('/seller/messages');
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

  test('the maker sends a quote and the buyer sees Accept quote', async ({ browser }) => {
    const mara = MAKERS.find((m) => m.slug === 'mara-kovac')!;
    const seller = await signedIn(browser, mara.email);
    await seller.goto('/seller/messages?tab=requests');
    await seller
      .getByTestId('inbox-row')
      .filter({ hasText: firstName(0) })
      .click();
    await seller.getByTestId('send-quote-toggle').click();
    await seller.getByTestId('quote-price').fill('500');
    await expect(seller.getByTestId('quote-net')).toContainText(
      'You receive A$425 after the 15% fee · deposit A$150 is paid upfront',
    );
    await seller.getByTestId('send-quote').click();
    await expect(seller.getByTestId('quote-card').last()).toContainText('A$500');

    const buyer = await signedIn(browser, BUYERS[0]!.email);
    await buyer.goto('/messages?tab=requests');
    await buyer.getByTestId('inbox-row').first().click();
    await expect(buyer.getByTestId('quote-card').last()).toContainText('A$500');
    await expect(buyer.getByTestId('accept-quote')).toContainText('Accept quote & pay deposit');
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
    await seller.goto('/seller/messages?tab=needs-reply');
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
    await expect(buyer.getByTestId('tab-messages-count')).toHaveText('1');

    // Reading the thread clears both.
    await buyer.getByTestId('tab-messages').click();
    await buyer
      .getByTestId('inbox-row')
      .filter({ hasText: enquiryPiece.maker.displayName })
      .click();
    await expect(buyer.getByTestId('bubble-theirs').last()).toContainText('Australia-wide');
    await buyer.goto('/search');
    await expect(buyer.getByTestId('tab-messages-count')).toHaveCount(0);
  });
});
