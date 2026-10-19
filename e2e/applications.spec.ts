import path from 'node:path';
import postgres from 'postgres';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PASSWORD } from '../scripts/seed-data';

// Seller applications: apply, review (changes, approve, decline), setup and going live, invited
// shops, returns copy, founding spots and launch mode, against the e2e server and its database.
const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { transform: postgres.camel, max: 2, onnotice: () => {} },
);
test.afterAll(() => db.end());

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESK = { viewport: { width: 1280, height: 900 } };
const photo = (n: string) => path.join(__dirname, '..', 'public', 'seed', `${n}.jpg`);
const PHOTOS = ['tangerine-bias-maxi', 'draped-satin-midi', 'lace-trim-maxi-dress'].map(photo);
const ADMIN = 'admin@oneoff.test';

async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname === next.split('?')[0]);
}

async function adminPage(browser: Browser, next: string) {
  const page = await (await browser.newContext(DESK)).newPage();
  await login(page, ADMIN, next);
  return page;
}

const shopOf = async (email: string) =>
  (
    await db<
      {
        id: string;
        shopStatus: string;
        stripeAccountId: string | null;
        foundingNumber: number | null;
      }[]
    >`
      select m.id, m.shop_status, m.stripe_account_id, m.founding_number
      from public.makers m join public.users u on u.id = m.user_id where u.email = ${email}`
  )[0]!;

/** A maker applies at /sell/apply on a phone, from the welcome screen to Submitted. */
async function apply(browser: Browser, label: string) {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  const email = `${label.toLowerCase().replace(/\W+/g, '.')}.${Date.now()}@maker.test`;
  await page.goto('/sell/apply');
  await page.getByTestId('apply-start').click();
  const usePassword = page.getByTestId('join-use-password');
  if (await usePassword.isVisible()) await usePassword.click();
  await page.getByLabel('Name').fill('Jo Maker');
  await page.locator('input[name=email]:visible').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page
    .getByRole('button', { name: /Create account/ })
    .last()
    .click();

  await expect(page.getByTestId('apply-step-1')).toBeVisible();
  await page.getByLabel('Label name').fill(label);
  await page.getByLabel('Mobile').fill('0400 123 456');
  await page.getByLabel('Suburb').fill('Fremantle');
  await page.getByLabel('State').selectOption('WA');
  await page.getByLabel('Instagram').fill('@saltbush.studio');
  await page.getByText('Dresses', { exact: true }).click();
  await page.getByTestId('mode-made_to_order').click();
  await page.getByTestId('label-continue').click();

  await expect(page.getByTestId('apply-step-2')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles(PHOTOS);
  await expect(page.getByTestId('work-form').locator('img')).toHaveCount(3, { timeout: 30_000 });
  await page.getByTestId('made-by-self').click();
  await page
    .getByLabel('Tell us about your process')
    .fill('I drape and draft every pattern, then cut and sew in small runs.');
  await page.getByTestId('declaration').check({ force: true });
  await page.getByTestId('work-continue').click();

  await expect(page.getByTestId('apply-step-3')).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByTestId('sell-cards-next').click();
  await page.getByTestId('submit-application').click();
  await expect(page.getByTestId('apply-submitted')).toContainText(
    `Thanks, ${label}. Your application is in.`,
  );
  return { page, ctx, email };
}

async function openApplication(admin: Page, makerId: string) {
  await admin.goto('/admin/applications');
  await admin.goto(`/admin/applications/${makerId}`);
  await expect(admin.getByTestId('application-status')).toContainText('Waiting for review');
}

test.describe.serial('seller applications', () => {
  test('1. a maker applies; the shop waits for review, without Stripe, and can’t publish', async ({
    browser,
  }) => {
    const { page, email } = await apply(browser, 'Saltbush Studio');
    const shop = await shopOf(email);
    expect(shop.shopStatus).toBe('applied');
    expect(shop.stripeAccountId).toBeNull();

    await page.goto('/sell/apply');
    await expect(page.getByTestId('apply-status')).toContainText('Under review · submitted');
    await expect(page.getByTestId('application-summary')).toContainText('Saltbush Studio');

    // The app keeps applicants out of Studio, so the editor (and its publish) isn't reachable…
    await page.goto('/studio/listings/new');
    await page.waitForURL(/\/sell\/apply/);

    // …and the database refuses a publish even if one got through.
    const [user] = await db<{ id: string }[]>`select id from public.users where email = ${email}`;
    const [piece] = await db<{ id: string }[]>`
      insert into public.products (maker_id, slug, title, category, price_cents, product_type, status)
      values (${shop.id}, ${`apply-test-${Date.now()}`}, 'Applicant Slip', 'dresses', 25000, 'ready_to_ship', 'draft')
      returning id`;
    const claims = JSON.stringify({ sub: user!.id, role: 'authenticated', app_role: 'seller' });
    await expect(
      db.begin(async (tx) => {
        await tx`select set_config('request.jwt.claims', ${claims}, true)`;
        await tx`set local role authenticated`;
        await tx`update public.products set status = 'approved' where id = ${piece!.id}`;
      }),
    ).rejects.toThrow(/once your shop is approved/);
  });

  test('2. the admin asks for changes; the maker sees the note, edits and resubmits', async ({
    browser,
  }) => {
    const { page, email } = await apply(browser, 'Tidewater Knits');
    const shop = await shopOf(email);
    const admin = await adminPage(browser, '/admin/applications');
    await expect(admin.getByTestId('applications-queue')).toContainText('Tidewater Knits');
    await openApplication(admin, shop.id);
    await admin.getByTestId('decide-changes').click();
    await admin.getByTestId('changes-note').fill('Could you add photos of finished pieces?');
    await admin.getByTestId('request-changes').click();
    await expect(admin.getByTestId('decided')).toBeVisible();
    expect((await shopOf(email)).shopStatus).toBe('changes_requested');

    await page.goto('/sell/apply');
    await expect(page.getByTestId('review-note')).toContainText(
      'Could you add photos of finished pieces?',
    );
    await page.getByLabel('Label name').fill('Tidewater Knitwear');
    await page.getByTestId('label-continue').click();
    await page.getByTestId('work-continue').click();
    for (let i = 0; i < 3; i++) await page.getByTestId('sell-cards-next').click();
    await expect(page.getByTestId('submit-application')).toHaveText('Resubmit');
    await page.getByTestId('submit-application').click();
    await expect(page.getByTestId('apply-submitted')).toBeVisible();
    expect((await shopOf(email)).shopStatus).toBe('applied');
    const [count] = await db<{ n: number }[]>`
      select count(*)::int as n from public.shop_applications where maker_id = ${shop.id}`;
    expect(count!.n).toBe(2);
  });

  test('3. approved: the email goes out, setup works, and the shop goes live only with payouts and a piece', async ({
    browser,
  }) => {
    const { ctx, email } = await apply(browser, 'Harbour Linen');
    const shop = await shopOf(email);
    const admin = await adminPage(browser, '/admin/applications');
    await openApplication(admin, shop.id);
    await admin.getByTestId('approve').click();
    await expect(admin.getByTestId('decided')).toContainText('Approved');
    expect((await shopOf(email)).shopStatus).toBe('approved');
    const [mail] = await db<{ subject: string }[]>`
      select subject from public.email_outbox where to_email = ${email} and template = 'application_approved'`;
    expect(mail!.subject).toBe('You’re in. Welcome to One Off');

    const page = await (
      await browser.newContext({ ...DESK, storageState: await ctx.storageState() })
    ).newPage();
    await page.goto('/studio/setup');
    await expect(page.getByTestId('setup-banner')).toContainText('0 of 4 done');
    await page.getByTestId('agree-box').check({ force: true });
    await page.getByRole('button', { name: /agree/i }).last().click();
    await page.waitForURL(/step=2/);

    // A published piece before payouts: approved, but not live.
    await page.goto('/studio/listings/new');
    await page.getByTestId('photo-input').first().setInputFiles(PHOTOS);
    await expect(page.getByTestId('photo-grid').locator('img')).toHaveCount(3, { timeout: 30_000 });
    await page.getByTestId('piece-title').filter({ visible: true }).first().fill('Harbour Shirt');
    await page.getByTestId('cat-dresses').filter({ visible: true }).first().click();
    await page
      .getByTestId('piece-description')
      .filter({ visible: true })
      .first()
      .fill(
        'A linen shirt dress cut generously, with French seams and horn buttons down the front.',
      );
    await page.getByTestId('piece-price').filter({ visible: true }).first().fill('260');
    await page.getByTestId('size-10-plus').filter({ visible: true }).first().click();
    await page.getByTestId('publish-piece').filter({ visible: true }).first().click();
    await expect(page.getByTestId('piece-live')).toContainText('once your shop goes live');
    expect((await shopOf(email)).shopStatus).toBe('approved');

    // Payouts (mock Stripe): the account is created now, and the shop goes live.
    await page.goto('/studio/setup?step=2');
    await page.getByTestId('setup-stripe').click();
    await page.getByTestId('mock-connect-complete').click();
    await page.waitForURL(/studio\/setup/);
    await expect(page.getByTestId('setup-live')).toBeVisible();
    const live = await shopOf(email);
    expect(live.shopStatus).toBe('live');
    expect(live.stripeAccountId).not.toBeNull();
  });

  test('4. declined: a kind screen, and no resubmitting before the reapply date', async ({
    browser,
  }) => {
    const { page, email } = await apply(browser, 'Quarry Leather');
    const shop = await shopOf(email);
    const admin = await adminPage(browser, '/admin/applications');
    await openApplication(admin, shop.id);
    await admin.getByTestId('decide-decline').click();
    await admin.getByTestId('decline-categories').check();
    await admin.getByTestId('decline').click();
    await expect(admin.getByTestId('decided')).toContainText('Declined');

    await page.goto('/sell/apply?step=1');
    await expect(page.getByTestId('apply-declined')).toContainText('outside the categories');
    await expect(page.getByTestId('reapply-after')).toContainText('You can apply again after');
    await page.goto('/sell/apply?step=3');
    await expect(page.getByTestId('apply-declined')).toBeVisible();
    await expect(page.getByTestId('submit-application')).toHaveCount(0);
    expect((await shopOf(email)).shopStatus).toBe('declined');
  });

  test('5. an invited maker (/claim) never enters the queue', async ({ browser }) => {
    const invited = await db<{ id: string; displayName: string }[]>`
      select id, display_name from public.makers where source = 'invite' and user_id is not null`;
    expect(invited.length).toBeGreaterThan(0);
    const ids = invited.map((m) => m.id);
    const [count] = await db<{ n: number }[]>`
      select count(*)::int as n from public.shop_applications where maker_id = any(${ids})`;
    expect(count!.n).toBe(0);
    const admin = await adminPage(browser, '/admin/applications');
    for (const m of invited)
      await expect(admin.getByTestId('applications-queue')).not.toContainText(m.displayName);
    await admin.goto('/admin/shops');
    await expect(admin.getByTestId('pipeline')).toContainText('Invite');
  });

  test('6. product page, quick view and bag show the returns line for the piece type', async ({
    browser,
  }) => {
    const [p] = await db<{ slug: string; variant: string; size: string }[]>`
      select p.slug, v.id as variant, v.size from public.products p
      join public.makers m on m.id = p.maker_id
      join public.product_variants v on v.product_id = p.id and v.stock_quantity > 0 and v.is_active
      where p.status = 'approved' and m.shop_status = 'live' and p.product_type = 'ready_to_ship'
        and not ('preview-only' = any(p.tags))
      limit 1`;
    for (const opts of [DESK, PHONE]) {
      const page = await (await browser.newContext(opts)).newPage();
      await page.goto(`/products/${p!.slug}`);
      await expect(page.getByTestId('returns-row')).toContainText(
        'Return it unworn, with tags, within 14 days of delivery',
      );
    }
    const page = await (await browser.newContext(DESK)).newPage();
    await page.goto('/discover');
    const card = page.locator('[data-masonry] [data-testid=discover-piece]:visible').first();
    await card.hover();
    await card.getByRole('link', { name: /Quick view/ }).click();
    await expect(page.getByTestId('quick-view')).toBeVisible();
    await expect(page.getByTestId('qv-returns')).toHaveText(
      /^(Return within 14 days of delivery if unworn, with tags\.|No change-of-mind returns on (made-to-order pieces|one-of-ones|custom pieces)\.)$/,
    );

    await page.goto(`/products/${p!.slug}`);
    await page.getByRole('button', { name: `Size ${p!.size}`, exact: true }).click();
    await page
      .getByRole('button', { name: /^Add to bag/ })
      .filter({ visible: true })
      .click();
    await page.getByTestId('view-bag').click();
    await expect(page.getByTestId('bag-returns-note').first()).toHaveText(
      'Return within 14 days of delivery if unworn, with tags.',
    );
  });

  test('7. with founding spots full, the 0% offer disappears and new shops get no founding panel', async ({
    browser,
  }) => {
    const visitor = await (await browser.newContext(DESK)).newPage();
    const free = async () =>
      (
        await db<{ n: number }[]>`
          select n from generate_series(1, 20) n
          where not exists (select 1 from public.makers m where m.founding_number = n)`
      ).map((r) => r.n);
    const filled: string[] = [];
    const fillers: string[] = [];
    try {
      // Fill all but one spot directly, then award the last one through the admin.
      const open = await free();
      for (const n of open.slice(0, -1)) {
        const [m] = await db<{ id: string }[]>`
          insert into public.makers (slug, display_name, status, shop_status, source, founding_number)
          values (${`founding-filler-${n}-${Date.now()}`}, 'Founding filler', 'draft', 'invited', 'invite', ${n})
          returning id`;
        fillers.push(m!.id);
      }
      expect((await free()).length).toBe(1);

      const first = await apply(browser, 'Last Spot Studio');
      const firstShop = await shopOf(first.email);
      const admin = await adminPage(browser, '/admin/applications');
      await openApplication(admin, firstShop.id);
      await admin.getByTestId('approve-founding').check();
      await admin.getByTestId('approve').click();
      await expect(admin.getByTestId('decided')).toBeVisible();
      expect((await shopOf(first.email)).foundingNumber).not.toBeNull();
      filled.push(firstShop.id);

      await visitor.goto('/help/sell-with-us');
      await expect(visitor.getByTestId('start-selling')).toBeVisible();
      await expect(visitor.getByTestId('founding-offer')).toHaveCount(0);

      const second = await apply(browser, 'No Spot Studio');
      const secondShop = await shopOf(second.email);
      await openApplication(admin, secondShop.id);
      await expect(admin.getByTestId('approve-founding')).toBeDisabled();
      await admin.getByTestId('approve').click();
      await expect(admin.getByTestId('decided')).toBeVisible();
      expect((await shopOf(second.email)).foundingNumber).toBeNull();

      const studio = await (
        await browser.newContext({ ...DESK, storageState: await second.ctx.storageState() })
      ).newPage();
      await studio.goto('/studio');
      await expect(studio.getByTestId('month-panel').filter({ visible: true })).toHaveCount(1);
      await expect(studio.getByTestId('founding-panel')).toHaveCount(0);
    } finally {
      if (fillers.length) await db`delete from public.makers where id = any(${fillers})`;
      if (filled.length)
        await db`update public.makers set founding_number = null where id = any(${filled})`;
    }
  });

  test('8. in waitlist mode buyers can’t check out and are pointed to the waitlist', async ({
    browser,
  }) => {
    const admin = await adminPage(browser, '/admin/launch');
    const setMode = async (mode: 'waitlist' | 'open') => {
      await admin.goto('/admin/launch');
      await admin.getByTestId(`launch-${mode}`).check();
      await admin.getByTestId('launch-form').getByRole('button', { name: 'Save' }).click();
      await expect(admin.getByTestId('launch-form').getByRole('status')).toHaveText('Saved.');
    };
    await setMode('waitlist');
    try {
      const page = await (await browser.newContext(PHONE)).newPage();
      const [p] = await db<{ slug: string }[]>`
        select p.slug from public.products p join public.makers m on m.id = p.maker_id
        where p.status = 'approved' and m.shop_status = 'live' and p.product_type = 'ready_to_ship'
          and not ('preview-only' = any(p.tags)) limit 1`;
      await page.goto(`/products/${p!.slug}`);
      await expect(page.locator('body')).toContainText('Opening soon. Join the waitlist.');
      await page.goto('/bag');
      await expect(page.getByTestId('checkout-closed')).toBeVisible();
      await page.getByRole('link', { name: 'Join the waitlist' }).click();
      await page.waitForURL(/\/waitlist/);
    } finally {
      await setMode('open');
    }
  });
});
