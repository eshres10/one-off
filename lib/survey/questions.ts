/**
 * The maker survey (survey.offone.com.au): ten tap questions, one optional text question and a
 * follow-up opt-in. Option keys are what's stored; labels are what's shown. Shared by the screens,
 * the API validation, the database constraints (see 0021_maker_survey.sql) and the admin page.
 */

export interface SurveyOption {
  key: string;
  label: string;
}

export interface SurveyQuestion {
  /** Column name. */
  key: SingleKey | 'q9_blockers' | 'q11_wish';
  n: number;
  question: string;
  hint?: string;
  options: readonly SurveyOption[];
  kind: 'single' | 'multi' | 'text';
}

const opts = (pairs: ReadonlyArray<readonly [string, string]>): SurveyOption[] =>
  pairs.map(([key, label]) => ({ key, label }));

export const QUESTIONS: readonly SurveyQuestion[] = [
  {
    key: 'q1_instagram_share',
    n: 1,
    question: 'Roughly how much of your sales come from Instagram or DMs?',
    kind: 'single',
    options: opts([
      ['none', 'None'],
      ['lt25', 'Under 25%'],
      ['25_50', '25–50%'],
      ['50_75', '50–75%'],
      ['most', 'Most of it'],
    ]),
  },
  {
    key: 'q2_monthly_volume',
    n: 2,
    question: 'In a typical month, how many pieces do you sell?',
    kind: 'single',
    options: opts([
      ['0_5', '0–5'],
      ['6_20', '6–20'],
      ['21_50', '21–50'],
      ['50p', '50+'],
    ]),
  },
  {
    key: 'q3_typical_price',
    n: 3,
    question: 'What’s the typical price of one of your pieces?',
    kind: 'single',
    options: opts([
      ['lt100', 'Under A$100'],
      ['100_250', 'A$100–250'],
      ['250_500', 'A$250–500'],
      ['500p', 'A$500+'],
    ]),
  },
  {
    key: 'q4_commission',
    n: 4,
    question:
      'What share of a sale would you happily pay a marketplace that brings you new customers?',
    kind: 'single',
    options: opts([
      ['lt8', 'Under 8%'],
      ['8_12', '8–12%'],
      ['12_18', '12–18%'],
      ['18_25', '18–25%'],
      ['free_only', 'Only if it’s free to list'],
    ]),
  },
  {
    key: 'q5_mto_share',
    n: 5,
    question: 'How much of your work is made to order or custom?',
    kind: 'single',
    options: opts([
      ['none', 'None'],
      ['some', 'Some'],
      ['half', 'About half'],
      ['most', 'Most of it'],
      ['want_more', 'I’d do more if the orders came through'],
    ]),
  },
  {
    key: 'q6_custom_today',
    n: 6,
    question: 'When someone asks for a custom piece today, what usually happens?',
    kind: 'single',
    options: opts([
      ['make', 'I make it'],
      ['quote_drop', 'I quote but they rarely go ahead'],
      ['decline', 'I say no, it’s too much back and forth'],
      ['none', 'Nobody asks'],
    ]),
  },
  {
    key: 'q7_biggest_cost',
    n: 7,
    question: 'Which of these costs you the most, in time or money?',
    kind: 'single',
    options: opts([
      ['returns', 'Returns and exchanges'],
      ['sizing', 'Sizing questions'],
      ['payments', 'Chasing payments or deposits'],
      ['ghosting', 'Customers who disappear'],
      ['shipping', 'Shipping'],
      ['visibility', 'Being seen at all'],
    ]),
  },
  {
    key: 'q8_payout_need',
    n: 8,
    question: 'How soon after a sale do you need the money?',
    kind: 'single',
    options: opts([
      ['same_day', 'Same day'],
      ['week', 'Within a week'],
      ['3_after', '3 days after delivery is fine'],
      ['deposit_ok', 'I’d accept longer for a deposit upfront'],
    ]),
  },
  {
    key: 'q9_blockers',
    n: 9,
    question: 'What would stop you joining a new marketplace?',
    hint: 'Pick up to 2',
    kind: 'multi',
    options: opts([
      ['fees', 'Fees'],
      ['buyers', 'Not enough buyers yet'],
      ['brand', 'Losing my brand or customer contact'],
      ['admin', 'Admin time'],
      ['returns', 'Return rules'],
      ['fast_fashion', 'Sitting next to cheap or fast fashion'],
      ['nothing', 'Nothing, I’d try it'],
    ]),
  },
  {
    key: 'q10_founding',
    n: 10,
    question: 'If Off One launched next month with 20 founding makers, would you…',
    kind: 'single',
    options: opts([
      ['want_in', 'Want in'],
      ['wait', 'Wait and see who else joins'],
      ['more', 'Want to hear more'],
      ['no', 'Not for me'],
    ]),
  },
  {
    key: 'q11_wish',
    n: 11,
    question: 'What’s one thing you wish a platform did for you?',
    hint: 'Optional',
    kind: 'text',
    options: [],
  },
] as const;

export const SINGLE_KEYS = [
  'q1_instagram_share',
  'q2_monthly_volume',
  'q3_typical_price',
  'q4_commission',
  'q5_mto_share',
  'q6_custom_today',
  'q7_biggest_cost',
  'q8_payout_need',
  'q10_founding',
] as const;
export type SingleKey = (typeof SINGLE_KEYS)[number];

export const FOLLOW_UP: readonly SurveyOption[] = opts([
  ['no', 'No thanks'],
  ['chat', 'Yes, a quick 15-minute chat'],
  ['founding', 'Yes, and I’d like a founding maker spot'],
]);

export const Q9_MAX = 2;
/** Picking this clears the others. */
export const Q9_NOTHING = 'nothing';
export const WISH_MAX = 500;
/** A submission finished faster than this is a bot. */
export const MIN_SECONDS = 20;
/** Submissions per IP hash per day. */
export const PER_DAY = 5;
/** `?src=` and `?ref=` on the link: which invite or post someone came from. */
export const TAG_RE = /^[a-z0-9_-]{1,40}$/;

export const COMMISSION_ABOVE_12 = ['12_18', '18_25'] as const;

export function question(key: SurveyQuestion['key']): SurveyQuestion {
  return QUESTIONS.find((q) => q.key === key)!;
}

export function optionKeys(key: SurveyQuestion['key']): string[] {
  return question(key).options.map((o) => o.key);
}

/** The label for a stored key, or the key itself when it isn't one (never for valid rows). */
export function label(key: SurveyQuestion['key'] | 'follow_up', value: string | null): string {
  if (value == null) return '';
  const options = key === 'follow_up' ? FOLLOW_UP : question(key).options;
  return options.find((o) => o.key === value)?.label ?? value;
}

/** The screens, in order: intro, the 11 questions, the follow-up, thanks. */
export const STEP_COUNT = QUESTIONS.length + 1;
