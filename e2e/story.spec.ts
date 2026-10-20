import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { MAKERS, PASSWORD } from '../scripts/seed-data';
import { jsonLd } from './json-ld';

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { max: 1, onnotice: () => {} },
);
test.afterAll(() => db.end());

const halde = MAKERS.find((m) => m.slug === 'halde-studio')!;
const DESKTOP = { viewport: { width: 1280, height: 860 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function login(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(halde.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next);
}

/** A live piece from a maker with no team size and no story yet. */
async function plainPiece(maker = 'mara-kovac') {
  const [p] = await db<{ id: string; slug: string }[]>`
    select p.id, p.slug from public.products p join public.makers m on m.id = p.maker_id
    where m.slug = ${maker} and p.status = 'approved' and p.product_type = 'ready_to_ship'
      and not exists (select 1 from public.product_stories s where s.product_id = p.id)
    order by p.slug limit 1`;
  return p!;
}

test.describe('story of the garment', () => {
  test('1. no story: no link, no section, and the checklist says optional', async ({ browser }) => {
    const piece = await plainPiece();
    const page = await (await browser.newContext(DESKTOP)).newPage();
    await page.goto(`/products/${piece.slug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('story-link')).toHaveCount(0);
    await expect(page.locator('#story')).toHaveCount(0);

    const studio = await (await browser.newContext(DESKTOP)).newPage();
    const [mine] = await db<{ id: string }[]>`
      select p.id from public.products p join public.makers m on m.id = p.maker_id
      where m.slug = 'halde-studio' and p.status = 'approved'
        and not exists (select 1 from public.product_stories s where s.product_id = p.id)
        and (select count(*) from public.product_images i where i.product_id = p.id) >= 3
      order by p.slug limit 1`;
    await login(studio, '/studio');
    await studio.goto(`/studio/listings/${mine!.id}`);
    const line = studio.getByRole('complementary').getByTestId('checklist-story');
    await expect(line).toHaveText('Story of the garment · optional');
    await expect(studio.getByTestId('publish-piece')).toBeEnabled();
  });

  test('2. only hours: the link shows, and the section shows only the hours stat', async ({
    browser,
  }) => {
    const piece = await plainPiece();
    await db`insert into public.product_stories (product_id, hours_to_make) values (${piece.id}, 9)`;
    try {
      const page = await (await browser.newContext(DESKTOP)).newPage();
      await page.goto(`/products/${piece.slug}`);
      await expect(page.getByTestId('story-link')).toContainText('9 hours of making');
      const section = page.getByTestId('story');
      await expect(section.getByTestId('story-stats')).toHaveText(/9 hrs/);
      await expect(section.getByTestId('story-stats').locator('dd')).toHaveCount(1);
      for (const part of ['story-quote', 'story-inspiration', 'story-fabric', 'story-details'])
        await expect(section.getByTestId(part)).toHaveCount(0);
      await expect(section.getByTestId('story-closeups')).toHaveCount(0);
    } finally {
      await db`delete from public.product_stories where product_id = ${piece.id}`;
    }
  });

  test('5. phone: "Skip · sizes & price" goes to step 4 without saving a story', async ({
    browser,
  }) => {
    const [piece] = await db<{ id: string }[]>`
      select p.id from public.products p join public.makers m on m.id = p.maker_id
      where m.slug = 'halde-studio' and p.status = 'approved'
        and not exists (select 1 from public.product_stories s where s.product_id = p.id)
        and (select count(*) from public.product_images i where i.product_id = p.id) >= 3
      order by p.slug desc limit 1`;
    const page = await (await browser.newContext(PHONE)).newPage();
    await login(page, '/studio');
    await page.goto(`/studio/listings/${piece!.id}`);
    await page.getByTestId('step-next').click();
    await page.getByTestId('step-next').click();
    await expect(page.getByText('Step 3 of 5 · The story')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Every piece has a story' })).toBeVisible();
    await expect(page.getByTestId('story-quote')).toBeHidden();
    await expect(page.getByTestId('step-next')).toHaveText('Skip · sizes & price');
    await page.getByTestId('step-next').click();
    await expect(page.getByText('Step 4 of 5 · Sizes & price')).toBeVisible();
    await page.getByTestId('step-next').click();
    await expect(page.getByTestId('check-it')).toContainText('Not added · optional');
    await page.waitForTimeout(2000);
    expect(
      await db`select 1 from public.product_stories where product_id = ${piece!.id}`,
    ).toHaveLength(0);
    // Filling anything in turns Skip into Next.
    await page.getByRole('button', { name: 'Edit Story' }).click();
    await page.getByTestId('story-hours').fill('3');
    await expect(page.getByTestId('step-next')).toHaveText('Next · sizes & price');
    await page.getByTestId('story-hours').fill('');
  });

  test('6. a sold one-of-one keeps its story', async ({ browser }) => {
    const [piece] = await db<{ id: string; slug: string }[]>`
      select p.id, p.slug from public.products p
      where p.product_type = 'one_of_one' and p.status = 'approved'
      order by p.slug desc limit 1`;
    const stock = await db<{ id: string; stock_quantity: number }[]>`
      select id, stock_quantity from public.product_variants where product_id = ${piece!.id}`;
    await db`update public.product_variants set stock_quantity = 0 where product_id = ${piece!.id}`;
    await db`
      insert into public.product_stories (product_id, quote, hours_to_make)
      values (${piece!.id}, 'Cut from the last of the roll.', 20)
      on conflict (product_id) do update set quote = excluded.quote`;
    try {
      const page = await (await browser.newContext(DESKTOP)).newPage();
      await page.goto(`/products/${piece!.slug}`);
      await expect(page.getByText('Sold').first()).toBeVisible();
      await expect(page.getByTestId('story-quote')).toHaveText('“Cut from the last of the roll.”');
    } finally {
      await db`delete from public.product_stories where product_id = ${piece!.id}`;
      for (const v of stock)
        await db`update public.product_variants set stock_quantity = ${v.stock_quantity} where id = ${v.id}`;
    }
  });

  test('7. the editor holds the length limits', async ({ browser }) => {
    const page = await (await browser.newContext(DESKTOP)).newPage();
    await login(page, '/studio/listings/new');
    await expect(page.getByTestId('story-quote')).toHaveAttribute('maxlength', '160');
    await expect(page.getByTestId('story-inspiration')).toHaveAttribute('maxlength', '1200');
    await expect(page.getByTestId('story-fabric')).toHaveAttribute('maxlength', '240');
    await expect(page.getByTestId('story-hours')).toHaveAttribute('max', '500');
    await page.getByTestId('story-quote').fill('q'.repeat(200));
    await expect(page.getByTestId('story-quote')).toHaveValue('q'.repeat(160));
    await page.getByTestId('story-detail-add').click();
    await expect(page.getByTestId('story-detail-input')).toHaveAttribute('maxlength', '40');
  });

  test('9. accessibility: a real anchor, an h2, captions as alt text', async ({ browser }) => {
    const page = await (await browser.newContext(DESKTOP)).newPage();
    await page.goto('/products/butter-silk-slip');
    const link = page.getByRole('link', { name: /Read the story of this piece/ });
    await expect(link).toHaveAttribute('href', '#story');
    await expect(
      page.locator('#story').getByRole('heading', { level: 2, name: 'The story of this piece' }),
    ).toBeVisible();
    const closeups = page.getByTestId('story-closeups');
    await expect(closeups.getByRole('img')).toHaveCount(3);
    await expect(
      closeups.getByRole('img', { name: 'French seams inside, so nothing frays or scratches.' }),
    ).toBeAttached();
    await link.click();
    await expect(page).toHaveURL(/#story$/);
    await expect(page.locator('#story')).toBeInViewport();
    // The inspiration goes into the product's structured data.
    const ld = (await jsonLd(page, 'Product'))!;
    expect(ld['@type']).toBe('Product');
    expect(ld.description).toContain('my nan’s 1970s nightdress');
    expect(ld.description.length).toBeLessThanOrEqual(5000);
  });
});

test('8. Discover header scrolls away; Home’s comes back on the way up', async ({ browser }) => {
  const page = await (await browser.newContext(DESKTOP)).newPage();
  const header = page.locator('.site-header').first();
  const bottom = async () => (await header.boundingBox())?.y ?? -1000;

  await page.goto('/discover');
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(600);
  await expect(header).not.toBeInViewport();
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(600);
  await expect(header).not.toBeInViewport();

  await page.goto('/');
  await page.mouse.wheel(0, 1000);
  await page.waitForTimeout(600);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(800);
  await expect(header).toBeInViewport();
  expect(await bottom()).toBeLessThanOrEqual(1);
});
