/** Size guide (/size-guide). Copy and the size chart; edit freely. */
export const SIZE_GUIDE = {
  meta: {
    title: 'Size guide',
    description:
      'Womenswear AU sizes 6–18: bust, waist and hips in cm or inches, and how to measure yourself.',
  },
  kicker: 'Size guide',
  title: 'Find your fit,',
  titleItalic: 'once.',
  intro:
    'This is the standard Australian guide most of our makers use. Some cut their own way, so always check the maker’s notes on a piece. Made-to-order pieces use your own measurements.',
  tableTitle: 'Womenswear, AU sizes',
  sizes: ['6', '8', '10', '12', '14', '16', '18'],
  /** Centimetres, per size above. */
  rows: [
    { label: 'Bust', cm: [78, 82, 87, 92, 97, 102, 107] },
    { label: 'Waist', cm: [60, 64, 69, 74, 79, 84, 89] },
    { label: 'Hips', cm: [86, 90, 95, 100, 105, 110, 115] },
  ],
  note: 'Between sizes? For fitted pieces, size up. For relaxed pieces, choose the size closest to your bust.',
  measure: {
    title: 'How to measure yourself',
    intro:
      'Use a soft tape, wear thin clothing, and keep the tape snug but not tight. It’s easier with a friend.',
    steps: [
      { title: 'Bust', body: 'Around the fullest part of your chest, tape level under your arms.' },
      {
        title: 'Waist',
        body: 'Around the narrowest part of your waist, usually just above the belly button.',
      },
      { title: 'Hips', body: 'Around the fullest part of your hips, feet together.' },
      { title: 'Height', body: 'Standing straight against a wall, without shoes.' },
    ],
  },
  banner: {
    title: 'Save your sizes once.',
    body: 'We’ll filter the feed to your size and send your measurements to makers when you order made to order.',
    cta: 'Save my sizes',
  },
};

/** cm → inches, one decimal (87 cm → 34.3 in). */
export function toInches(cm: number): number {
  return Math.round((cm / 2.54) * 10) / 10;
}
