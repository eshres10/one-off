import { expect, type Page } from '@playwright/test';
import { MAKERS, PASSWORD } from '../scripts/seed-data';

// The Have it made brief, step by step: shared by the Have it made and phone app specs.

export const halde = MAKERS.find((m) => m.slug === 'halde-studio')!;
export const fern = MAKERS.find((m) => m.slug === 'fern-and-thread')!;
const WORDS =
  'Like the butter slip, but floor-length with a low back and fluttery sleeves. Something I can dance in at my sister’s wedding.';

export async function login(page: Page, email: string, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => u.pathname === next.split('?')[0]);
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 768;
export const next = (page: Page) =>
  page.getByTestId(isPhone(page) ? 'flow-next-phone' : 'flow-next');

/** The seven steps, as a guest, up to "Find my makers". */
export async function fillBrief(
  page: Page,
  opts: { fitting?: boolean; budget?: number; date?: string } = {},
) {
  await page.goto('/have-it-made');
  await expect(page.getByRole('heading', { name: /Have something made/ })).toBeVisible();
  await next(page).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 1 of 7');
  const dress = page.getByTestId('kind-dress');
  await expect(dress).toHaveAttribute('aria-pressed', 'false');
  await dress.click();
  await expect(dress).toHaveAttribute('aria-pressed', 'true');
  await next(page).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuetext', 'Step 2 of 7');
  await page.getByTestId('occasion-wedding_guest').click();
  await expect(page.getByTestId('occasion-wedding_guest')).toHaveAttribute('aria-pressed', 'true');
  if (opts.date) {
    await page.getByTestId('date-custom').click();
    await page.getByTestId('date-custom-input').fill(opts.date);
  } else await page.getByTestId('date-later').click();
  await next(page).click();
  // Fewer than 20 characters can't go on.
  await page.getByTestId('brief-words').fill('Short');
  await expect(next(page)).toBeDisabled();
  await page.getByTestId('brief-words').fill(WORDS);
  await next(page).click();
  await page.getByTestId('fabric-silk').click();
  await page.getByRole('button', { name: 'Low back' }).click();
  await page.getByTestId('colour-butter').click();
  await expect(page.getByTestId('colour-name')).toHaveText('Butter');
  await next(page).click();
  if (opts.fitting) await page.getByTestId('fit-fitting').click();
  else {
    await page.getByTestId('fit-measurements').click();
    for (const [k, v] of [
      ['bust', '88'],
      ['waist', '70'],
      ['hips', '96'],
      ['height', '168'],
    ])
      await page.getByTestId(`measure-${k}`).fill(v!);
  }
  await next(page).click();
  const band = opts.budget ?? 1;
  await page.getByTestId(`budget-${band}`).click();
  if (band === 1) await expect(page.getByTestId('budget-big')).toHaveText('A$450–700');
  await next(page).click();
  await page.getByTestId('postcode').fill('3065');
  await expect(page.getByTestId('postcode-hint')).toContainText('Fitzroy, VIC');
  await expect(page.getByTestId('anonymous')).toHaveAttribute('role', 'switch');
  await expect(page.getByTestId('anonymous')).toHaveAttribute('aria-checked', 'true');
}

/** From "Find my makers" as a guest: the sign-in page, then back into the brief at the finding screen. */
export async function signInAtFind(page: Page, email: string) {
  await next(page).click();
  await page.waitForURL(/\/login\?next=/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/have-it-made\?resume=1/);
  await expect(page.getByTestId('finding')).toBeVisible();
  await expect(page.getByTestId('matches')).toBeVisible({ timeout: 20_000 });
}

export async function sendToThree(page: Page) {
  const cards = page.getByTestId('matches').locator('[data-testid^=match-]');
  await expect(cards).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(cards.nth(i)).toHaveAttribute('aria-pressed', 'true');
  // A fourth pick: there are only three, so unpick one and re-pick to show the limit line stays quiet,
  // then prove the cap with the button label.
  await cards.nth(0).click();
  await expect(cards.nth(0)).toHaveAttribute('aria-pressed', 'false');
  await expect(next(page)).toHaveText(/Send to 2 makers/);
  await cards.nth(0).click();
  await expect(next(page)).toHaveText(/Send to 3 makers/);
  await next(page).click();
  await expect(page.getByTestId('sent')).toBeVisible({ timeout: 20_000 });
  const cap = await page.getByTestId('sent').innerText();
  const number = /OO-C-\d+/.exec(cap)![0];
  await expect(page.getByTestId('timeline')).toBeVisible();
  return number;
}
