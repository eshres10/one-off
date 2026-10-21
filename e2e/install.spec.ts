import { PRODUCTS } from '../scripts/seed-data';
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  instagram:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  desktop:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
};

const phone = (userAgent: string): BrowserContextOptions => ({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent,
});

async function open(browser: Browser, opts: BrowserContextOptions, init?: () => void) {
  const ctx = await browser.newContext(opts);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}

/** Saves the nth piece on Discover (a heart tap is the "saved_piece" trigger). */
async function save(page: Page, nth = 0) {
  await page.getByTestId('save-button').nth(nth).click();
}

// The last plain ready-to-ship piece: earlier specs buy the first ones.
const product = PRODUCTS.filter(
  (p) =>
    p.productType === 'ready_to_ship' &&
    p.colours.length === 1 &&
    p.variants.some((v) => v.stock >= 4),
).at(-1)!;
const size = product.variants.find((v) => v.stock >= 4)!.size;

const sheet = (page: Page) => page.getByTestId('install-sheet');
const QUIET = 3_000; // longer than the 1.5 s delay after a save

/** A mocked Android install prompt, fired after load like Chrome does. */
function mockAndroidPrompt() {
  (window as unknown as { __prompted: boolean }).__prompted = false;
  window.addEventListener('load', () =>
    setTimeout(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: string }>;
      };
      e.prompt = async () => {
        (window as unknown as { __prompted: boolean }).__prompted = true;
      };
      e.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(e);
    }, 100),
  );
}

test('1. desktop: the sheet never appears', async ({ browser }) => {
  const { ctx, page } = await open(
    browser,
    { viewport: { width: 1280, height: 860 }, userAgent: UA.desktop },
    mockAndroidPrompt,
  );
  await page.goto('/search?q=maxi');
  const heart = page.getByTestId('search-results').getByTestId('save-button').first();
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(QUIET);
  await expect(sheet(page)).toHaveCount(0);
  await ctx.close();
});

test('2. first page view: nothing on its own; a save shows it after about 1.5 s', async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, phone(UA.ios));
  await page.goto('/discover');
  await page.waitForTimeout(QUIET);
  await expect(sheet(page)).toHaveCount(0);
  const at = Date.now();
  await save(page);
  await page.waitForTimeout(1000);
  await expect(sheet(page)).toHaveCount(0);
  await expect(sheet(page)).toBeVisible();
  expect(Date.now() - at).toBeGreaterThanOrEqual(1400);
  await ctx.close();
});

test('3. never paths: no sheet even when a trigger fires', async ({ browser }) => {
  const { ctx, page } = await open(browser, phone(UA.ios));
  // Something in the bag, so /checkout opens rather than sending us back to the bag.
  await page.goto(`/products/${product.slug}`);
  await page.getByTestId('add-to-bag').click();
  await page.getByRole('button', { name: `Size ${size}`, exact: true }).click();
  await page.getByTestId('size-sheet-add').click();
  await expect(page.getByTestId('view-bag')).toBeVisible();
  for (const path of ['/login', '/signup', '/sell/apply', '/checkout', '/studio']) {
    await page.goto(path);
    // Signed out, /studio sends you to sign in, which is a never path too.
    expect(new URL(page.url()).pathname).toMatch(/^\/(login|signup|sell\/apply|checkout)/);
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent('oo:install', { detail: { trigger: 'saved_piece' } })),
    );
    await page.waitForTimeout(800);
    await expect(sheet(page), path).toHaveCount(0);
  }
  await ctx.close();
});

test('4. Not now: quiet for 14 days, never after 3 dismissals', async ({ browser }) => {
  const { ctx, page } = await open(browser, phone(UA.ios));
  await page.goto('/discover');
  await save(page);
  await expect(sheet(page)).toBeVisible();
  await page.getByTestId('install-not-now').first().click();
  await expect(sheet(page)).toHaveCount(0);

  // New session, same day: still cooling down.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await save(page, 1);
  await page.waitForTimeout(QUIET);
  await expect(sheet(page)).toHaveCount(0);

  // 15 days later (clock moved by rewriting when it was dismissed): shows again.
  const back = (days: number, dismissals: number) =>
    page.evaluate(
      ([d, n]) => {
        const s = JSON.parse(localStorage.getItem('oo:install')!);
        localStorage.setItem(
          'oo:install',
          JSON.stringify({ ...s, dismissals: n, lastDismissedAt: Date.now() - d! * 86_400_000 }),
        );
        sessionStorage.clear();
      },
      [days, dismissals],
    );
  await back(15, 1);
  await page.reload();
  await save(page, 2);
  await expect(sheet(page)).toBeVisible();
  await page.keyboard.press('Escape');

  // Three dismissals: never again, however long ago.
  await back(400, 3);
  await page.reload();
  await save(page, 3);
  await page.waitForTimeout(QUIET);
  await expect(sheet(page)).toHaveCount(0);
  await ctx.close();
});

test('5. Android: the button calls prompt(); accepted closes it and it never shows again', async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, phone(UA.android), mockAndroidPrompt);
  await page.goto('/discover');
  await save(page);
  await expect(sheet(page)).toHaveAttribute('data-variant', 'android');
  await expect(page.getByTestId('install-sub')).toHaveText('No app store. Takes two seconds.');
  await page.getByTestId('install-primary').click();
  await expect(sheet(page)).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __prompted: boolean }).__prompted)).toBe(
    true,
  );
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('oo:install')!).installedAt),
  ).toBeGreaterThan(0);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await save(page, 1);
  await page.waitForTimeout(QUIET);
  await expect(sheet(page)).toHaveCount(0);
  await ctx.close();
});

test('6. detection: iOS and Instagram versions; nothing in standalone', async ({ browser }) => {
  const ios = await open(browser, phone(UA.ios));
  await ios.page.goto('/discover');
  await save(ios.page);
  await expect(sheet(ios.page)).toHaveAttribute('data-variant', 'ios');
  await expect(ios.page.getByTestId('install-sub')).toHaveText('Two taps, no app store.');
  await ios.ctx.close();

  const ig = await open(browser, phone(UA.instagram));
  await ig.page.goto('/discover');
  await save(ig.page);
  await expect(sheet(ig.page)).toHaveAttribute('data-variant', 'in-app');
  await expect(ig.page.getByTestId('install-sub')).toContainText('Instagram’s browser');
  await ig.ctx.close();

  const app = await open(browser, phone(UA.ios), () =>
    Object.defineProperty(navigator, 'standalone', { get: () => true }),
  );
  await app.page.goto('/discover');
  await save(app.page);
  await app.page.waitForTimeout(QUIET);
  await expect(sheet(app.page)).toHaveCount(0);
  await app.ctx.close();
});

test('7. copy link: source and a one-time restore token that brings saved pieces back once', async ({
  browser,
}) => {
  const ig = await open(browser, phone(UA.instagram));
  await ig.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ig.page.goto('/discover');
  await save(ig.page);
  const saved = await ig.page.evaluate(() => localStorage.getItem('oneoff:saved'));
  expect(JSON.parse(saved!)).toHaveLength(1);
  await ig.page.getByTestId('install-primary').click();
  await expect(ig.page.getByTestId('install-copied')).toHaveText(
    'Link copied. Paste it into Safari or Chrome.',
  );
  const url = new URL(await ig.page.evaluate(() => navigator.clipboard.readText()));
  expect(url.searchParams.get('source')).toBe('inapp');
  expect(url.searchParams.get('restore')).toMatch(/^[A-Za-z0-9_-]{24}$/);
  await ig.ctx.close();

  const safari = await open(browser, phone(UA.ios));
  await safari.page.goto(url.pathname + url.search);
  await expect(safari.page.getByText('Your bag and saved pieces are here.')).toBeVisible();
  expect(await safari.page.evaluate(() => localStorage.getItem('oneoff:saved'))).toBe(saved);
  await expect(safari.page).not.toHaveURL(/restore=/);
  await safari.ctx.close();

  const again = await open(browser, phone(UA.ios));
  await again.page.goto(url.pathname + url.search);
  await again.page.waitForTimeout(1500);
  await expect(again.page.getByText('Your bag and saved pieces are here.')).toHaveCount(0);
  await again.ctx.close();
});

test('8. storage blocked: nothing breaks, and the sheet shows at most once per session', async ({
  browser,
}) => {
  const { ctx, page, errors } = await open(browser, phone(UA.ios), () => {
    for (const name of ['localStorage', 'sessionStorage'])
      Object.defineProperty(window, name, {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
  });
  await page.goto('/discover');
  await save(page);
  await expect(sheet(page)).toBeVisible();
  await page.getByTestId('install-not-now').first().click();
  await save(page, 1);
  await page.waitForTimeout(QUIET);
  await expect(sheet(page)).toHaveCount(0);
  expect(errors.filter((e) => /install|storage/i.test(e))).toEqual([]);
  await ctx.close();
});

test('9. accessibility: dialog, focus trap, Escape, focus back, reduced motion', async ({
  browser,
}) => {
  const { ctx, page } = await open(browser, { ...phone(UA.ios), reducedMotion: 'reduce' });
  await page.goto('/discover');
  const heart = page.getByTestId('save-button').first();
  await heart.click();
  const dialog = page.getByRole('dialog', { name: 'Off One, on your home screen.' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('install-primary')).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  expect(await dialog.evaluate((d) => getComputedStyle(d).animationName)).toBe('install-fade');
  expect(
    await page
      .locator('.install-bob')
      .first()
      .evaluate((d) => getComputedStyle(d).animationName),
  ).toBe('none');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(heart).toBeFocused();
  await ctx.close();
});
