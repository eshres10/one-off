/** Making steps on a made-to-order piece (fulfilments.mto_step); READY_STEP is "finishing", i.e. ready. */
export const MAKING_STEPS = ['Ordered', 'Fabric bought', 'Cutting', 'Sewing', 'Finishing'] as const;
export const READY_STEP = 4;
/** What the maker taps next, worded as the step ("I've bought the fabric"), per current step. */
export const NEXT_STEP_LABEL: Record<number, string> = {
  0: 'I’ve bought the fabric',
  1: 'I’ve started cutting',
  2: 'I’ve started sewing',
  3: 'I’m finishing it',
};
/** The buyer's line for each step reached. */
export const STEP_BUYER_LINE: Record<number, string> = {
  1: 'I’ve bought the fabric for your piece.',
  2: 'I’ve started cutting your piece.',
  3: 'Your piece is being sewn.',
  4: 'Your piece is finished and ready to send.',
};
