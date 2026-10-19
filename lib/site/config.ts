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
   * [DECIDE] What a shop on holiday does. 'accept_orders' (default): buyers can still order; a
   * banner says when pieces ship and checkout dates move past the holiday. 'pause_orders': "Add to
   * bag" is hidden until they're back.
   */
  holidayMode: 'accept_orders' as 'accept_orders' | 'pause_orders',
  /** "Popular right now" chips on a search with no results. Edit freely. */
  popularSearches: [
    'Satin slip',
    'Linen set',
    'Made to order',
    'Halter',
    'Wedding guest',
    'Under $200',
  ],
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

  /**
   * Returns. Ready-to-ship pieces can come back for a change of mind; made-to-order, custom and
   * one-of-one pieces can't (faults are always covered). The policy text lives in
   * lib/returns/policy.ts and is copied onto each order item at checkout.
   */
  returns: {
    readyToShipWindowDays: 14,
    condition: 'unworn, with tags and original packaging',
    /** [DECIDE] Who pays to post a change-of-mind return back: 'buyer' or 'maker'. */
    returnPostagePaidBy: 'buyer' as 'buyer' | 'maker',
    /** The refund goes out when the maker marks the return received. */
    refundTrigger: 'maker_receives' as const,
    /** Business days a maker has to confirm a delivered return before it's refunded anyway. */
    makerConfirmDays: 3,
    /** Days the buyer has to post it once they've started a return. */
    sendWithinDays: 7,
    /**
     * [DECIDE] false (default): makers are paid 3 days after delivery as usual, and a later
     * return comes back out of their balance or next payout. true: ready-to-ship payouts wait
     * until the return window closes. Either way the Seller Agreement needs a clause.
     */
    holdReadyToShipPayoutUntilWindowCloses: false,
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

/** Time zones a maker can pick in Shop settings. */
export const MAKER_TIMEZONES = [
  { value: 'Australia/Melbourne', label: 'Melbourne (VIC)' },
  { value: 'Australia/Sydney', label: 'Sydney (NSW, ACT)' },
  { value: 'Australia/Hobart', label: 'Hobart (TAS)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (QLD)' },
  { value: 'Australia/Adelaide', label: 'Adelaide (SA)' },
  { value: 'Australia/Darwin', label: 'Darwin (NT)' },
  { value: 'Australia/Perth', label: 'Perth (WA)' },
] as const;

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
