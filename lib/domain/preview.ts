/**
 * Sample listings shown while One Off gets ready to launch. A product tagged `preview-only` is
 * labelled on cards and its page, and can never be added to a bag, even after checkout opens.
 */
export const PREVIEW_ONLY_TAG = 'preview-only';
export const PREVIEW_ONLY_LABEL = 'Preview only — not for sale';
export const PREVIEW_ONLY_NOTE =
  'This is a sample piece showing how listings will look at launch. It isn’t available to buy.';

export function isPreviewOnly(tags: readonly string[] | null | undefined): boolean {
  return Boolean(tags?.includes(PREVIEW_ONLY_TAG));
}

/** Listed in Discover and on the shop page, but kept out of the home page's main grid. */
export const DISCOVER_ONLY_TAG = 'discover-only';
