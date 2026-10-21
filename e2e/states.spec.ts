import { expect, test } from '@playwright/test';
import postgres from 'postgres';
import { PRODUCTS } from '../scripts/seed-data';

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { max: 1, onnotice: () => {} },
);
test.afterAll(() => db.end());

test.describe('empty and edge states', () => {
  test('a missing page is a real 404 with "This one got away."', async ({ page }) => {
    const res = await page.goto('/does-not-exist');
    expect(res?.status()).toBe(404);
    await expect(page.getByTestId('not-found')).toContainText('This one got away.');
    await expect(page.getByTestId('not-found-search')).toBeVisible();
  });

  test('a thrown error shows "A dropped stitch." and Try again re-renders', async ({ page }) => {
    await page.goto('/dev/error');
    await expect(page.getByTestId('error-state')).toContainText('A dropped stitch.');
    await expect(page.getByText('Error 500 · We’ve been notified')).toBeVisible();
    // reset() re-renders the segment, which asks the server for it again.
    const again = page.waitForRequest((r) => r.url().includes('/dev/error'));
    await page.getByTestId('error-retry').click();
    await again;
    await expect(page.getByTestId('error-state')).toBeVisible();
  });

  test('a search with no results offers "Have it made" with the query', async ({ page }) => {
    await page.goto('/search?q=velvet%20opera%20cape');
    await expect(page.getByTestId('search-empty')).toContainText(
      'Nothing for “velvet opera cape”, yet.',
    );
    await expect(page.getByTestId('search-words')).toContainText('velvet');
    await expect(page.getByTestId('have-it-made')).toHaveAttribute(
      'href',
      '/have-it-made?q=velvet%20opera%20cape',
    );
    await expect(page.getByTestId('popular-searches')).toBeVisible();
  });

  test('filters with nothing to show suggest one to remove, and the button applies it', async ({
    page,
  }) => {
    await page.goto('/discover?colour=navy&size=10&max=120');
    await expect(page.getByTestId('discover-empty')).toContainText('A little too specific.');
    const relax = page.getByTestId('relax-filter');
    await expect(relax).toContainText(/^Show \d+ navy size 10 pieces?$/);
    await relax.click();
    await expect(page).toHaveURL(/colour=navy/);
    await expect(page).not.toHaveURL(/max=/);
    await expect(page.getByTestId('discover-empty')).toHaveCount(0);
  });

  test('a sold one-of-one keeps its page: 200, "Sold", no Add to bag', async ({ page }) => {
    const ooo = PRODUCTS.find((p) => p.productType === 'one_of_one')!;
    await db`update public.product_variants set stock_quantity = 0 where product_id = ${ooo.id}`;
    const res = await page.goto(`/products/${ooo.slug}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId('sold-stamp').filter({ visible: true })).toBeVisible();
    await expect(page.getByTestId('sold-panel').filter({ visible: true })).toContainText(
      'This one found its person.',
    );
    await expect(page.getByRole('button', { name: /Add to bag/ })).toHaveCount(0);
  });

  test('a sold-out size can be picked to ask for a restock alert', async ({ page }) => {
    const ready = PRODUCTS.find(
      (p) =>
        p.productType === 'ready_to_ship' &&
        p.variants.length > 1 &&
        !p.tags?.includes('preview-only'),
    )!;
    const [v] = await db<{ id: string; size: string }[]>`
      update public.product_variants set stock_quantity = 0
      where id = (select id from public.product_variants where product_id = ${ready.id} order by sort_order limit 1)
      returning id, size`;
    await page.goto(`/products/${ready.slug}`);
    // On a phone the sizes live in the size sheet.
    await page.getByTestId('add-to-bag').click();
    await page.getByRole('button', { name: `Size ${v!.size}, sold out` }).click();
    await expect(page.getByTestId('size-sold-out')).toContainText(`Size ${v!.size} is sold out`);
    await page.getByTestId('notify-restock').click();
    await page.getByTestId('restock-email').fill('e2e.restock@buyer.test');
    await page.getByTestId('notify-restock').click();
    await expect(page.getByTestId('restock-confirmed')).toBeVisible();
    const [n] = await db<{ n: number }[]>`
      select count(*)::int as n from public.restock_alerts where variant_id = ${v!.id}`;
    expect(n!.n).toBe(1);
  });

  test('a shop on holiday shows the banner', async ({ page }) => {
    const p = PRODUCTS.find((x) => x.productType === 'ready_to_ship')!;
    await db`update public.makers set shop_status = 'holiday', holiday_until = current_date + 10
      where id = ${p.maker.id}`;
    try {
      await page.goto(`/makers/${p.maker.slug}`);
      await expect(page.getByTestId('holiday-banner')).toContainText('You can still order.');
    } finally {
      await db`update public.makers set shop_status = 'live', holiday_until = null where id = ${p.maker.id}`;
    }
  });

  test('icons, manifest and the product share image are served', async ({ request }) => {
    for (const path of [
      '/favicon.ico',
      '/favicon.svg',
      '/apple-touch-icon.png',
      '/manifest.webmanifest',
    ])
      expect((await request.get(path)).status(), path).toBe(200);
    const p = PRODUCTS[0]!;
    const og = await request.get(`/og/products/${p.slug}?v=test`);
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
    const png = await og.body();
    // PNG header: width and height are big-endian at bytes 16–23.
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
});

test.describe('long press to add', () => {
  const hold = async (page: import('@playwright/test').Page, slug: string) => {
    const card = page.locator(`[data-long-press-add="${slug}"]:visible`).first();
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(800);
    await page.mouse.up();
  };

  test('holding a piece opens size choice, adds it, and doesn’t open the piece', async ({
    page,
  }) => {
    const [p] = await db<{ slug: string; title: string }[]>`
      select p.slug, p.title from public.products p join public.makers m on m.id = p.maker_id
      where p.status = 'approved' and m.shop_status = 'live' and p.product_type = 'ready_to_ship'
        and not ('preview-only' = any(p.tags))
        and (select count(*) from public.product_variants v
             where v.product_id = p.id and v.is_active and v.stock_quantity > 0) >= 3
      order by p.slug limit 1`;
    await page.goto(`/discover?q=${encodeURIComponent(p!.title)}`);
    await hold(page, p!.slug);
    await expect(page.getByTestId('quick-add-size').first()).toBeVisible({ timeout: 20_000 });
    expect(new URL(page.url()).pathname).toBe('/discover');
    await page.locator('[data-testid=quick-add-size]:not([disabled])').first().click();
    await page.getByTestId('quick-add-submit').click();
    await expect(page.getByTestId('quick-add-done')).toContainText('Added to your bag');
    await page.goto('/bag');
    await expect(page.getByTestId('bag-line-phone')).toHaveCount(1);
  });

  test('a one-of-one goes straight in, and a tap still opens the piece', async ({ page }) => {
    const [p] = await db<{ slug: string; title: string }[]>`
      select p.slug, p.title from public.products p join public.makers m on m.id = p.maker_id
      join public.product_variants v on v.product_id = p.id and v.is_active and v.stock_quantity > 0
      where p.status = 'approved' and m.shop_status = 'live' and p.product_type = 'one_of_one'
        and not ('preview-only' = any(p.tags))
      order by p.slug desc limit 1`;
    await page.goto(`/discover?q=${encodeURIComponent(p!.title)}`);
    await hold(page, p!.slug);
    await expect(page.getByTestId('quick-add-done')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Keep looking' }).click();
    await page.locator(`[data-long-press-add="${p!.slug}"]:visible`).first().tap();
    await expect(page).toHaveURL(new RegExp(`/products/${p!.slug}`));
  });
});
