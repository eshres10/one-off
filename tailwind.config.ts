import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#FAF8F5',
        ink: { DEFAULT: '#1C1A17', soft: '#4A453F', muted: '#6B645B' },
        stone: { DEFAULT: '#D9D3CA', light: '#EDE8E1', dark: '#B8AFA3' },
        clay: { DEFAULT: '#8A5A44', light: '#F3E9E2' },
        moss: { DEFAULT: '#4F5D47', light: '#E8ECE3' },
        alert: { DEFAULT: '#9B2C2C', light: '#FBEAEA' },
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      aspectRatio: { '4/5': '4 / 5' },
    },
  },
  plugins: [],
};

export default config;
