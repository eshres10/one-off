/**
 * Site-wide product decisions. Change them here rather than in components.
 */
export const SITE = {
  /** Makers from anywhere in Australia can apply; buyers can order from anywhere in Australia. */
  makerRegions: ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'] as const,
  /** Cities in the "By city" menu, linking to Discover filtered by the maker's city. */
  cities: ['Melbourne', 'Sydney', 'Brisbane', 'Adelaide', 'Perth', 'Hobart'] as const,
  /**
   * [DECIDE] What the "Fit promise" on made-to-order pieces actually promises. Until this has
   * text, nothing called a fit promise is shown (and it must not read as a returns promise).
   */
  fitPromise: null as string | null,
  /**
   * Pre-launch: `waitlist` keeps checkout closed ("Opening soon. Join the waitlist.") while shops
   * and pieces can be live; `open` makes everything public. The admin switches it in
   * /admin/launch (stored in site_settings); this is the default until they do.
   */
  launchMode: 'waitlist' as LaunchMode,
  /** The admin's time zone, for the daily applications summary. */
  adminTimeZone: 'Australia/Melbourne',
  /** Local hour the daily applications summary goes out. */
  adminDigestHour: 9,
};

export type LaunchMode = 'waitlist' | 'open';
export type MakerRegion = (typeof SITE.makerRegions)[number];

/** The capital of each state: a maker's starting city for "By city" (the admin can change it). */
export const STATE_CAPITAL: Record<MakerRegion, string> = {
  ACT: 'Canberra',
  NSW: 'Sydney',
  NT: 'Darwin',
  QLD: 'Brisbane',
  SA: 'Adelaide',
  TAS: 'Hobart',
  VIC: 'Melbourne',
  WA: 'Perth',
};
