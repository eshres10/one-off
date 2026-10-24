import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, PASSWORD } from '../scripts/seed-data';
import postgres from 'postgres';
import {
  FIXTURE_MAKER_ID,
  installFeaturedFixture,
  removeFeaturedFixture,
} from '../scripts/featured-fixture';

// The homepage hero featuring a maker (Dramalicious) and rotating through eight pieces. Desktop at
// 1280×800 and phone at 390×844. Screenshots go to e2e/__screenshots__/featured-hero/.

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { max: 1, onnotice: () => {} },
);

test.beforeAll(async () => {
  await installFeaturedFixture(db);
});
test.afterAll(async () => {
  await removeFeaturedFixture(db);
  await db.end();
});

const caption = (page: Page, phone = false) =>
  page.getByTestId(phone ? 'hero-caption-phone' : 'hero-caption');

/** The page may serve the cached "no feature" hero for a second after the fixture goes in. */
async function open(page: Page, phone = false) {
  const hero = page.locator(phone ? '[data-testid="hero-card"]' : '[data-testid="featured-hero"]');
  await expect(async () => {
    await page.goto('/');
    await expect(hero).toHaveAttribute('data-running', 'true', { timeout: 4000 });
  }).toPass({ timeout: 40_000 });
}

/** The original hero: no featured hero, and the "Shop the edit" button. */
async function expectStaticHero(page: Page) {
  await expect(async () => {
    await page.goto('/');
    await expect(page.getByTestId('featured-hero')).toHaveCount(0, { timeout: 1000 });
    await expect(page.getByRole('link', { name: 'Shop the edit', exact: true })).toBeVisible({
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
}

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(__dirname, '__screenshots__', 'featured-hero', `${name}.png`),
  });
}

test.describe('desktop 1280×800', () => {
  test('shows the maker, the pieces rotate, and the caption follows the photo', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __cls: number }).__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
        }[])
          if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await open(page);
    // The original hero messaging, plus a small note naming the featured brand.
    const hero = page.getByTestId('featured-hero');
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
      'Bespoke pieces made just for you',
    );
    await expect(hero.getByRole('link', { name: 'Shop the edit', exact: true })).toBeVisible();
    await expect(hero.getByRole('link', { name: 'Meet the makers', exact: true })).toBeVisible();
    const note = page.getByTestId('hero-featured-note');
    await expect(note).toContainText('Featured brand of the month: Explore Dramalicious');
    await expect(note.getByRole('link')).toHaveAttribute('href', '/makers/dramalicious');
    await expect(hero.getByText('Founding maker')).toHaveCount(0);
    await expect(caption(page)).toContainText('Sparkle dress · A$320');
    await expect(caption(page)).toHaveAttribute('href', '/products/sparkle-dress');
    await shot(page, 'desktop-rest');

    // 1. Each piece stays 3.4s, so by 4s the caption has moved from Sparkle dress to Trench coat.
    await page.waitForTimeout(4000);
    await expect(caption(page)).toContainText('Trench coat');
    await expect(caption(page)).toHaveAttribute('href', '/products/trench-coat');
    // Segment 1 is done (full), segment 2 is filling.
    await expect(page.getByTestId('hero-segment').nth(1)).toHaveAttribute('aria-current', 'true');
    await shot(page, 'desktop-after-switch');
    // No layout shift from the rotation.
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(
      0.01,
    );
  });

  test('mid-transition: two photos are mounted, the old one fading out', async ({ page }) => {
    await open(page);
    await expect(page.locator('[data-testid="featured-hero"]')).toHaveAttribute('data-index', '1', {
      timeout: 6_000,
    });
    await page.waitForTimeout(100);
    const states = await page
      .getByTestId('featured-hero')
      .locator('.fh-img')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    expect(states).toContain('out');
    expect(states).toContain('current');
    expect(states.length).toBeLessThanOrEqual(3);
    await shot(page, 'desktop-transition');
  });

  test('2. the pause button stops the slideshow, and play resumes it', async ({ page }) => {
    await open(page);
    await page.getByTestId('hero-pause').click();
    await expect(page.getByTestId('hero-pause')).toHaveAttribute('aria-label', 'Play slideshow');
    await expect(page.getByTestId('featured-hero')).toHaveAttribute('data-running', 'false');
    const before = await caption(page).textContent();
    await page.waitForTimeout(5000);
    expect(await caption(page).textContent()).toBe(before);
    await expect(caption(page)).toContainText('Sparkle dress');
    // The pause button wins over hover and focus as well.
    await page.mouse.move(640, 400);
    await page.mouse.move(640, 50);
    await expect(page.getByTestId('featured-hero')).toHaveAttribute('data-running', 'false');
    await page.getByTestId('hero-pause').click();
    await expect(page.getByTestId('featured-hero')).toHaveAttribute('data-running', 'true');
    await expect(caption(page)).toContainText('Trench coat', { timeout: 6000 });
  });

  test('pauses on hover, in a hidden tab and once the shutter covers the hero, then resumes', async ({
    page,
  }) => {
    await open(page);
    const hero = page.getByTestId('featured-hero');
    await page.mouse.move(640, 400);
    await expect(hero).toHaveAttribute('data-running', 'false');
    await page.mouse.move(640, 50); // the header sits over the hero, so this leaves it
    await expect(hero).toHaveAttribute('data-running', 'true');
    // Scrolled until the sheet has covered the hero.
    await page.evaluate(() => window.scrollTo(0, 760));
    await expect(hero).toHaveAttribute('data-running', 'false');
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(hero).toHaveAttribute('data-running', 'true');
    // Hidden tab.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(hero).toHaveAttribute('data-running', 'false');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(hero).toHaveAttribute('data-running', 'true');
  });

  test('a paused slide resumes where it left off instead of restarting', async ({ page }) => {
    await open(page);
    await page.waitForTimeout(1800);
    await page.getByTestId('hero-pause').click();
    await page.waitForTimeout(3000);
    await page.getByTestId('hero-pause').click();
    // 1.8s were used, so the switch comes about 1.6s later, not 3.4s later.
    await expect(page.getByTestId('featured-hero')).toHaveAttribute('data-index', '1', {
      timeout: 2000,
    });
  });

  test('segments jump to a piece, with a label that names it', async ({ page }) => {
    await open(page);
    const seg = page.getByRole('button', { name: 'Show piece 4 of 8: Yellow skirt' });
    await seg.click();
    await expect(caption(page)).toContainText('Yellow skirt · A$175');
    await expect(seg).toHaveAttribute('aria-current', 'true');
  });

  test('arrow keys move between pieces while the hero has keyboard focus, which also pauses it', async ({
    page,
  }) => {
    await open(page);
    await page.getByTestId('hero-segment').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(caption(page)).toContainText('Trench coat');
    await page.keyboard.press('ArrowRight');
    await expect(caption(page)).toContainText('Tan double breasted suit');
    await page.keyboard.press('ArrowLeft');
    await expect(caption(page)).toContainText('Trench coat');
    await expect(page.getByTestId('featured-hero')).toHaveAttribute('data-running', 'false');
  });

  test('without an active feature the original hero shows, unchanged', async ({ page }) => {
    await db`update public.home_features set is_active = false where maker_id = ${FIXTURE_MAKER_ID}`;
    try {
      await expectStaticHero(page);
      await expect(page.getByTestId('hero-featured-note')).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 })).toContainText('Bespoke pieces');
    } finally {
      await db`update public.home_features set is_active = true where maker_id = ${FIXTURE_MAKER_ID}`;
    }
  });

  test('falls back to the original hero when fewer than two pieces are approved', async ({
    page,
  }) => {
    await db`update public.products set status = 'draft' where maker_id = ${FIXTURE_MAKER_ID} and slug <> 'sparkle-dress'`;
    try {
      await expectStaticHero(page);
    } finally {
      await db`update public.products set status = 'approved' where maker_id = ${FIXTURE_MAKER_ID}`;
    }
  });
});

test.describe('reduced motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('3. nothing rotates by itself; the segments still change the piece', async ({ page }) => {
    await expect(async () => {
      await page.goto('/');
      await expect(page.getByTestId('featured-hero')).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 40_000 });
    await expect(caption(page)).toContainText('Sparkle dress');
    await page.waitForTimeout(6000);
    await expect(caption(page)).toContainText('Sparkle dress');
    await expect(page.getByTestId('featured-hero')).toHaveAttribute('data-running', 'false');
    await expect(page.getByTestId('hero-pause')).toBeHidden();
    // The photos neither scale nor blur.
    const anim = await page
      .locator('.fh-img')
      .first()
      .evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe('none');
    await page.getByTestId('hero-segment').nth(2).click();
    await expect(caption(page)).toContainText('Tan double breasted suit');
    await page.waitForTimeout(1500);
    await expect(caption(page)).toContainText('Tan double breasted suit');
  });
});

test.describe('phone 390×844', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });

  test('the hero card rotates, and a swipe moves to the next and previous piece', async ({
    page,
  }) => {
    await open(page, true);
    const card = page.getByTestId('hero-card');
    await expect(card.getByRole('heading', { level: 1 })).toHaveText(
      'Bespoke pieces made just for you',
    );
    await expect(page.getByTestId('hero-featured-note-phone')).toContainText(
      'Explore Dramalicious',
    );
    await expect(caption(page, true)).toContainText('Sparkle dress');
    await shot(page, 'phone-rest');

    const cdp = await page.context().newCDPSession(page);
    const swipe = async (fromX: number, toX: number) => {
      const y = 250;
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: fromX, y }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: (fromX + toX) / 2, y }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: toX, y }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    await swipe(300, 80);
    await expect(caption(page, true)).toContainText('Trench coat');
    await page.waitForTimeout(100);
    await shot(page, 'phone-transition');
    await swipe(80, 300);
    await expect(caption(page, true)).toContainText('Sparkle dress');
    // A swipe restarts the timer: the next automatic change is a full 3.4s away.
    await page.waitForTimeout(1500);
    await expect(caption(page, true)).toContainText('Sparkle dress');
    await expect(caption(page, true)).toContainText('Trench coat', { timeout: 4000 });
  });
});

test.describe('admin card', () => {
  test('an admin picks pieces, orders them and features the maker; the homepage follows', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto('/login?next=/admin/collections');
    await page.getByLabel('Email', { exact: true }).fill(ADMIN.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => u.pathname === '/admin/collections');
    const card = page.getByTestId('featured-maker-card');
    // The fixture's feature is running: eight thumbnails.
    await expect(card.getByTestId('feature-active')).toContainText('Dramalicious');
    await expect(card.getByTestId('feature-order').getByRole('listitem')).toHaveCount(8);
    // Drop all but three, then put the skirt first.
    for (const name of [
      'Moss suit',
      'Olive leather jacket',
      'Sparkle bag',
      'Pointed heel shoes',
      'Tan double breasted suit',
    ])
      await card.getByRole('button', { name: `Remove ${name}` }).click();
    await expect(card.getByTestId('feature-order').getByRole('listitem')).toHaveCount(3);
    await card.getByRole('button', { name: 'Move Yellow skirt up' }).click();
    await card.getByRole('button', { name: 'Move Yellow skirt up' }).click();
    await card.getByTestId('feature-submit').click();
    await expect(card.getByTestId('feature-message')).toContainText('Featured on the homepage');

    // Fewer than two pieces cannot be submitted.
    await card.getByRole('button', { name: 'Remove Trench coat' }).click();
    await card.getByRole('button', { name: 'Remove Sparkle dress' }).click();
    await expect(card.getByTestId('feature-submit')).toBeDisabled();

    // The homepage shows the new feature: skirt first, three segments.
    await expect(async () => {
      await page.goto('/');
      await expect(page.getByTestId('hero-segment')).toHaveCount(3, { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.getByTestId('hero-caption')).toContainText('Yellow skirt');
    await expect(page.getByTestId('hero-segment')).toHaveCount(3);

    // Stopping brings the original hero back.
    await page.goto('/admin/collections');
    await page.getByRole('button', { name: 'Stop featuring' }).click();
    await expect(page.getByTestId('feature-none')).toBeVisible();
    await expectStaticHero(page);
  });
});
