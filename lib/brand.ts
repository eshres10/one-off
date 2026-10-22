/**
 * Single place to rename the marketplace. The old domain redirects here once
 * APP_URL is set to the new domain (next.config.mjs).
 */
export const BRAND = {
  name: 'Off One',
  /** The wordmark's text, for alt text and anywhere the logo can't be drawn. */
  wordmark: 'OFF ONE',
  domain: 'offone.world',
  url: 'https://offone.world',
  tagline: 'Discover and buy original fashion made by independent Australian makers.',
  supportEmail: 'hello@offone.com.au',
  instagram: 'offone___',
  /** Black strip above the header. Edit for drops and events. */
  announcement: 'Original pieces from independent Australian makers · Shipping Australia-wide',
} as const;
