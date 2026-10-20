import { expect, test } from '@playwright/test';
import { jsonLd } from './json-ld';

test.describe('Off One', () => {
  test('2. the header wordmark reads Off One on Home, Discover and a product', async ({ page }) => {
    for (const path of ['/', '/discover', '/products/butter-silk-slip']) {
      await page.goto(path);
      await expect(
        page.locator('header').getByRole('img', { name: 'Off One' }).first(),
        path,
      ).toBeAttached();
    }
  });

  test('3. the footer has the new © line and Acknowledgement', async ({ page }) => {
    await page.goto('/about');
    const footer = page.locator('footer').last();
    await expect(footer).toContainText(
      `© ${new Date().getFullYear()} Off One · Australian-made, delivered Australia-wide`,
    );
    await expect(footer).toContainText('Off One acknowledges the Traditional Custodians');
    await expect(footer.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/offone___',
    );
    await expect(footer).not.toContainText('One Off');
  });

  test('4. title, og:site_name, the manifest and the Organization data say Off One', async ({
    page,
    request,
  }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Off One — A new marketplace for emerging designers');
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      'content',
      'Off One',
    );
    const org = await jsonLd(page, 'Organization');
    expect(org).toMatchObject({ name: 'Off One', sameAs: ['https://www.instagram.com/offone___'] });
    await page.goto('/about');
    await expect(page).toHaveTitle(/ — Off One$/);
    const manifest = await (await request.get('/manifest.webmanifest')).json();
    expect(manifest).toMatchObject({ name: 'Off One', short_name: 'Off One' });
  });

  test('5. the product share image renders', async ({ request }) => {
    const res = await request.get('/og/products/butter-silk-slip');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/image\/(png|jpeg)/);
    expect((await res.body()).length).toBeGreaterThan(10_000);
  });

  test('6. storage keys and the cart cookie are unchanged, so bags and saves survive', async ({
    page,
  }) => {
    await page.goto('/search?q=maxi');
    await page.getByTestId('search-results').getByTestId('save-button').first().click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('oneoff:saved')))
      .toMatch(/^\["/);
  });
});
