/** Swatch colours for common colour names used in listings. Unknown names fall back to neutral. */
const MAP: Record<string, string> = {
  ivory: '#EFE6D6',
  black: '#24211E',
  ink: '#22252B',
  sage: '#9FAE8A',
  terracotta: '#C2694A',
  cobalt: '#2F51A0',
  blush: '#E5B3AC',
  butter: '#EDD48A',
  chocolate: '#5A3A2A',
  emerald: '#2E6A4E',
  lilac: '#B6A3D1',
  rust: '#A3552D',
  navy: '#1F2A44',
  scarlet: '#A8322D',
  oat: '#D8C8AE',
  olive: '#6C6A3A',
  moss: '#5E6B4E',
  white: '#FFFFFF',
  cream: '#F1E9D8',
  red: '#A8322D',
  green: '#4E6B4A',
  blue: '#2F51A0',
  pink: '#E5B3AC',
  brown: '#5A3A2A',
  grey: '#9C978F',
};

export function swatchColour(name: string): string {
  return MAP[name.trim().toLowerCase()] ?? '#CFCAC2';
}
