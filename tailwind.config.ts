import type { Config } from 'tailwindcss';

/**
 * Off One design tokens. Colours are CSS variables defined in app/globals.css; see the
 * living style guide at /design (development only). Legacy aliases (paper, ink-soft,
 * stone-light, clay, moss, alert) map onto the same palette so no new colours exist.
 */
const v = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    // Square corners everywhere; circles only for avatars.
    borderRadius: {
      none: '0',
      DEFAULT: '0',
      sm: '0',
      md: '0',
      lg: '0',
      xl: '0',
      '2xl': '0',
      '3xl': '0',
      full: '0',
      circle: '9999px',
    },
    extend: {
      borderColor: { DEFAULT: 'var(--line)' },
      colors: {
        ground: v('ground'),
        surface: v('surface'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: { DEFAULT: v('ink'), soft: v('text-2'), muted: v('muted-2') },
        text2: v('text-2'),
        muted: { DEFAULT: v('muted'), 2: v('muted-2') },
        disabled: v('disabled'),
        error: { DEFAULT: v('error'), bg: v('error-bg') },
        // legacy aliases
        paper: v('ground'),
        stone: { DEFAULT: v('line'), light: v('stone'), dark: v('line-strong'), panel: v('stone') },
        clay: { DEFAULT: v('muted'), light: v('stone') },
        moss: { DEFAULT: v('text-2'), light: v('stone') },
        alert: { DEFAULT: v('error'), light: v('error-bg') },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      letterSpacing: { label: '0.16em', wide2: '0.2em' },
      aspectRatio: { '4/5': '4 / 5' },
      spacing: { gutter: 'clamp(16px, 3vw, 40px)' },
      maxWidth: { page: '1280px' },
    },
  },
  plugins: [],
};

export default config;
