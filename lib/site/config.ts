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
  /** The admin's time zone, for the daily applications summary. */
  adminTimeZone: 'Australia/Melbourne',
  /** Local hour the daily applications summary goes out. */
  adminDigestHour: 9,

  /**
   * Default delivery prices in cents, per maker parcel. Same state when the maker and the buyer
   * are in the same state, interstate otherwise. Makers can set their own in Shop settings.
   */
  shipping: {
    rates: {
      sameState: { standard: 1000, express: 1400 },
      interstate: { standard: 1200, express: 1500 },
    },
    /** Business days in transit after dispatch. */
    transitBusinessDays: { sameState: [1, 3], interstate: [2, 5] } as Record<
      'sameState' | 'interstate',
      [number, number]
    >,
    /** Express saves this many business days on the later end of the range. */
    expressSavesBusinessDays: 1,
  },

  payments: {
    /**
     * Shown in this order when Stripe enables them for the account in AUD (the Payment Element
     * only ever shows what Stripe enables). PayPal through Stripe isn't offered to Australian
     * businesses, so it stays hidden; see the checkout summary.
     */
    methods: ['card', 'apple_pay', 'google_pay', 'afterpay_clearpay', 'paypal'] as const,
    /** [DECIDE] Who pays Afterpay's fee: 'platform' (One Off) or 'maker'. */
    afterpayFeePaidBy: 'platform' as 'platform' | 'maker',
    /** Afterpay: 4 interest-free payments. */
    afterpayInstalments: 4,
  },

  cases: {
    /**
     * [DECIDE] A problem reported within this many days of delivery pauses that maker's payout
     * until it's resolved. Needs a clause in the Seller Agreement.
     */
    pausePayoutIfReportedWithinDays: 3,
    makerReplyBusinessDays: 2,
    platformDecisionBusinessDays: 5,
  },

  tax: {
    /**
     * [DECIDE] Confirm with the accountant how GST is shown when some makers aren't
     * GST-registered. Until then, totals show "includes A$x GST" (1/11 of the total).
     */
    showGstIncludedLine: true,
  },

  /** One-of-one pieces are held for a buyer at payment for this long. */
  reservationMinutes: 10,
};

/**
 * Pre-launch: `waitlist` keeps checkout closed ("Opening soon. Join the waitlist.") while shops
 * and pieces can be live; `open` makes everything public. The admin switches it in /admin/launch
 * (site_settings, see lib/site/launch.ts); until then it follows PREVIEW_MODE.
 */
export type LaunchMode = 'waitlist' | 'open';
export type MakerRegion = (typeof SITE.makerRegions)[number];

/** Each state's time zone: a maker's starting time zone (they can change it in Shop settings). */
export const STATE_TIMEZONE: Record<MakerRegion, string> = {
  ACT: 'Australia/Sydney',
  NSW: 'Australia/Sydney',
  NT: 'Australia/Darwin',
  QLD: 'Australia/Brisbane',
  SA: 'Australia/Adelaide',
  TAS: 'Australia/Hobart',
  VIC: 'Australia/Melbourne',
  WA: 'Australia/Perth',
};

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
