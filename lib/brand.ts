/**
 * Single place to rename the marketplace. The domain and email addresses stay on
 * shoponeoff.com.au until offone.com.au is set up (then change them here and in env).
 */
export const BRAND = {
  name: 'Off One',
  /** The wordmark's text, for alt text and anywhere the logo can't be drawn. */
  wordmark: 'OFF ONE',
  domain: 'shoponeoff.com.au',
  url: 'https://shoponeoff.com.au',
  tagline: 'Discover and buy original fashion made by independent Australian makers.',
  supportEmail: 'hello@shoponeoff.com.au',
  instagram: 'offone___',
  /** Black strip above the header. Edit for drops and events. */
  announcement: 'Original pieces from independent Australian makers · Shipping Australia-wide',
} as const;
