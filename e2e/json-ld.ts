import type { Page } from '@playwright/test';

/** The page's JSON-LD block of the given @type (a page can have several). */
export function jsonLd(page: Page, type: string) {
  return page.$$eval(
    'script[type="application/ld+json"]',
    (els, t) =>
      els
        .map((e) => JSON.parse(e.textContent ?? '{}') as Record<string, unknown>)
        .find((d) => d['@type'] === t),
    type,
  ) as Promise<Record<string, any> | undefined>;
}
