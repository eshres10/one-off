import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import postgres from 'postgres';
import { ADMIN, BUYERS, PASSWORD } from '../scripts/seed-data';

// The maker survey at survey.localhost:<port> (survey.offone.com.au in production), on a 390px
// phone: routing, saved progress, keyboard-only completion, axe on every step, and the admin page
// on the main host. Screenshots of each screen go to e2e/__screenshots__/survey/.

const PORT = Number(process.env.E2E_PORT ?? 3100);
const SURVEY = `http://survey.localhost:${PORT}`;
const MAIN = `http://localhost:${PORT}`;

const db = postgres(
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e',
  { transform: postgres.camel, max: 1, onnotice: () => {} },
);
test.afterAll(() => db.end());

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: path.join(__dirname, '__screenshots__', 'survey', `${name}.png`),
    fullPage: false,
  });
}

async function axe(page: Page, where: string) {
  // Colour transitions mid-flight read as low contrast: let them finish first.
  await page.waitForTimeout(350);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(
    results.violations,
    `${where}: ${JSON.stringify(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) })))}`,
  ).toEqual([]);
}

/** Taps a single-choice option and waits for the auto-advance. */
async function tap(page: Page, key: string, nextQ: number) {
  await page.getByTestId(`opt-${key}`).click();
  await expect(page.getByTestId(`survey-q${nextQ}`)).toBeVisible();
}

async function login(page: Page, email: string, next: string) {
  await page.goto(`${MAIN}/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname === next.split('?')[0]);
}

test.describe.serial('maker survey', () => {
  test('1. routing: the survey host serves only the survey; the main host keeps /survey', async ({
    page,
    request,
  }) => {
    await page.goto(`${SURVEY}/anything/at/all?src=ig-dm&ref=fern-thread`);
    await expect(page.getByTestId('survey-intro')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('made for makers');
    // Nothing else from the main site shows: no header, footer, bag or login.
    await expect(page.getByTestId('site-header')).toHaveCount(0);
    await expect(page.locator('[data-site-footer]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /log in|bag/i })).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle('Off One · Maker survey');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /\/og\/survey/,
    );
    for (const p of ['/discover', '/login', '/admin', '/products/x', '/studio']) {
      await page.goto(`${SURVEY}${p}`);
      await expect(page.getByTestId('survey-intro'), p).toBeVisible();
      await expect(page.getByTestId('site-header'), p).toHaveCount(0);
    }
    // Node's resolver doesn't know survey.localhost (Chromium does): the host header stands in.
    const og = await request.get(`${MAIN}/og/survey`, {
      headers: { host: `survey.localhost:${PORT}` },
    });
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
    // On the production domain /survey redirects to the survey host.
    const redirect = await request.get(`${MAIN}/survey?src=ig-dm`, {
      headers: { host: 'www.offone.com.au' },
      maxRedirects: 0,
    });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location).toBe('https://survey.offone.com.au/?src=ig-dm');
  });

  test('2. a maker taps through, leaves their details, and the answers land with the tags', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto(`${SURVEY}/?src=ig-dm&ref=fern-thread`);
    await axe(page, 'intro');
    await shot(page, 'intro');
    await page.getByTestId('survey-start').click();
    await expect(page.getByTestId('survey-q1')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '1 of 12');
    await axe(page, 'q1');
    await shot(page, 'question');
    await tap(page, 'most', 2);
    await tap(page, '6_20', 3);
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '3 of 12');
    await tap(page, '250_500', 4);
    await tap(page, '12_18', 5);
    await tap(page, 'half', 6);
    await tap(page, 'quote_drop', 7);
    await tap(page, 'visibility', 8);
    await tap(page, '3_after', 9);
    // Q9: up to two, "Nothing" clears the others, the rest disable at two.
    await page.getByTestId('opt-fees').click();
    await page.getByTestId('opt-buyers').click();
    await expect(page.getByTestId('opt-admin')).toBeDisabled();
    await page.getByTestId('opt-nothing').click();
    await expect(page.getByTestId('opt-fees')).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('opt-admin')).toBeEnabled();
    await page.getByTestId('opt-fees').click();
    await expect(page.getByTestId('opt-nothing')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('opt-buyers').click();
    await axe(page, 'q9');
    await page.getByTestId('survey-next').click();
    await tap(page, 'want_in', 11);
    // Q11: optional, with a counter.
    await expect(page.getByTestId('survey-skip')).toBeVisible();
    await page.getByTestId('wish').fill('Handle sizing questions for me.');
    await expect(page.getByText('31/500')).toBeVisible();
    await axe(page, 'q11');
    await page.getByTestId('survey-next').click();
    await expect(page.getByTestId('survey-follow-up')).toBeVisible();
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', '12 of 12');
    await page.getByTestId('follow-founding').click();
    await expect(page.getByTestId('contact-fields')).toBeVisible();
    await expect(page.getByTestId('survey-next')).toBeDisabled();
    await page.getByTestId('contact_name').fill('Fern');
    await page.getByTestId('label_name').fill('Fern & Thread');
    await page.getByTestId('contact_email').fill('fern@example.com');
    await page.getByTestId('instagram').fill('@fernandthread');
    await page.getByTestId('consent').check();
    await axe(page, 'follow-up');
    await shot(page, 'follow-up');
    // Under 20 seconds is refused as a bot; wait it out (the clock started at "Start").
    await page.waitForTimeout(20_000);
    await page.getByTestId('survey-next').click();
    await expect(page.getByTestId('survey-thanks')).toBeVisible();
    await expect(page.getByTestId('founding-note')).toBeVisible();
    await axe(page, 'thanks');
    await shot(page, 'thank-you');
    expect(await page.evaluate(() => localStorage.getItem('oo:survey'))).toBeNull();

    const [row] = await db<Record<string, unknown>[]>`
      select * from public.maker_survey_responses where contact_email = 'fern@example.com'`;
    expect(row).toMatchObject({
      src: 'ig-dm',
      ref: 'fern-thread',
      q1InstagramShare: 'most',
      q4Commission: '12_18',
      q9Blockers: ['fees', 'buyers'],
      q10Founding: 'want_in',
      q11Wish: 'Handle sizing questions for me.',
      followUp: 'founding',
      contactName: 'Fern',
      instagram: 'fernandthread',
      consentContact: true,
    });
    expect(Number(row!.durationSeconds)).toBeGreaterThanOrEqual(20);
  });

  test('3. saved progress survives a reload; submitting clears it', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${SURVEY}/`);
    await page.getByTestId('survey-start').click();
    await tap(page, 'lt25', 2);
    await tap(page, '0_5', 3);
    await page.reload();
    await expect(page.getByTestId('survey-q3')).toBeVisible();
    await page.getByTestId('survey-back').click();
    await expect(page.getByTestId('opt-0_5')).toHaveAttribute('aria-checked', 'true');
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('oo:survey') ?? 'null'),
    );
    expect(saved.answers.q1_instagram_share).toBe('lt25');
  });

  test('4. the whole survey can be done with the keyboard alone', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`${SURVEY}/`);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.keyboard.press('Tab'); // Start
    await expect(page.getByTestId('survey-start')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('survey-q1')).toBeVisible();
    const choose = async (nth: number, nextQ: number) => {
      for (let i = 0; i < nth; i++) await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId(`survey-q${nextQ}`)).toBeVisible();
    };
    // The heading takes focus on each screen, so the first Tab lands on the first option.
    await choose(1, 2);
    await choose(2, 3);
    await choose(1, 4);
    await choose(3, 5);
    await choose(1, 6);
    await choose(1, 7);
    await choose(2, 8);
    await choose(1, 9);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space'); // fees
    await page.getByTestId('survey-next').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('survey-q10')).toBeVisible();
    await choose(1, 11);
    await page.getByTestId('survey-skip').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('survey-follow-up')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space'); // No thanks
    await expect(page.getByTestId('follow-no')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('survey-next').focus();
    await page.waitForTimeout(20_000);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('survey-thanks')).toBeVisible();
    await expect(page.getByTestId('founding-note')).toHaveCount(0);
    const [row] = await db<{ contactEmail: string | null; followUp: string }[]>`
      select contact_email, follow_up from public.maker_survey_responses order by created_at desc limit 1`;
    expect(row).toEqual({ contactEmail: null, followUp: 'no' });
  });

  test('5. admin: non-admins get a 404; the page shows results; the CSV hides contacts unless ticked', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    let res = await page.goto(`${MAIN}/admin/survey`);
    expect(res?.status()).toBe(404);
    await login(page, BUYERS[0]!.email, '/');
    res = await page.goto(`${MAIN}/admin/survey`);
    expect(res?.status()).toBe(404);
    await context.clearCookies();
    await login(page, ADMIN.email, '/admin/survey');
    await expect(page.getByTestId('stat-total')).toContainText(/[2-9]/);
    // Test 2 asked for a founding spot and test 4 chose "Want in".
    await expect(page.getByTestId('stat-founding')).toContainText('2');
    await expect(page.getByTestId('chart-q4_commission')).toContainText('12–18%');
    await expect(page.getByTestId('optin-row')).toHaveCount(1);
    await expect(page.getByTestId('optin-row')).toContainText('fern@example.com');
    await page.getByTestId('link-src').fill('ig dm');
    await page.getByTestId('link-ref').fill('Fern Thread');
    await expect(page.getByTestId('link-url')).toHaveText(
      'https://survey.offone.com.au/?src=ig-dm&ref=fern-thread',
    );
    await page.setViewportSize({ width: 1280, height: 900 });
    await shot(page, 'admin');
    // Mark contacted sticks.
    await page.getByTestId('mark-contacted').click();
    await expect(page.getByTestId('mark-contacted')).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByTestId('mark-contacted')).toHaveAttribute('aria-checked', 'true');
    // Filters narrow by src.
    await page.goto(`${MAIN}/admin/survey?src=nope`);
    await expect(page.getByTestId('stat-total')).toContainText('0');
    await page.goto(`${MAIN}/admin/survey?src=ig-dm`);
    await expect(page.getByTestId('stat-total')).toContainText('1');
    // CSV: labels, and contact columns only when asked for.
    const plain = await page.request.get(`${MAIN}/admin/survey/export`);
    expect(plain.status()).toBe(200);
    const plainText = await plain.text();
    expect(plainText.split('\r\n')[0]).not.toContain('email');
    expect(plainText).not.toContain('fern@example.com');
    expect(plainText).toContain('12–18%');
    const withContacts = await page.request.get(`${MAIN}/admin/survey/export?contact=1`);
    const withText = await withContacts.text();
    expect(withText.split('\r\n')[0]).toContain('email');
    expect(withText).toContain('fern@example.com');
    await context.clearCookies();
    const anon = await page.request.get(`${MAIN}/admin/survey/export?contact=1`);
    expect(anon.status()).toBe(404);
  });
});
