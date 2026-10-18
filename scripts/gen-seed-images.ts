/**
 * Generates deterministic placeholder imagery (SVG) into public/seed so local development never
 * depends on a paid or remote image service: flat 4:5 product tiles toned to each garment's
 * colour, and warm-grey editorial placeholders for heroes, covers and editorial tiles.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { COLLECTIONS, COLOURS, MAKERS, PRODUCTS, rng, type Shape } from './seed-data';

const OUT = path.resolve(__dirname, '../public/seed');

const SHAPES: Record<Shape, string> = {
  dress:
    'M330,170 Q400,205 470,170 L505,188 L522,330 Q492,362 482,420 L628,880 Q400,925 172,880 L318,420 Q308,362 278,330 L295,188 Z',
  slip: 'M342,232 Q400,252 458,232 L472,420 L566,905 Q400,935 234,905 L328,420 Z',
  maxi: 'M332,175 Q400,205 468,175 L498,195 L512,340 Q486,370 478,430 L660,955 Q400,990 140,955 L322,430 Q314,370 288,340 L302,195 Z',
  skirt: 'M292,250 L508,250 L522,300 L648,860 Q400,905 152,860 L278,300 Z',
  top: 'M300,250 Q400,282 500,250 L606,322 L566,392 L522,362 L522,640 L278,640 L278,362 L234,392 L194,322 Z',
  set: 'M308,170 Q400,198 492,170 L560,215 L530,270 L498,250 L498,410 L302,410 L302,250 L270,270 L240,215 Z M300,440 L500,440 L512,480 L612,900 Q400,935 188,900 L288,480 Z',
  jacket:
    'M296,190 L370,170 L400,260 L430,170 L504,190 L622,262 L656,640 L596,648 L566,370 L540,360 L548,720 L252,720 L260,360 L234,370 L204,648 L144,640 L178,262 Z',
};

function mix(hex: string, toward: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const ch = (n: number, shift: number) => (n >> shift) & 255;
  const m = (shift: number) => Math.round(ch(a, shift) * (1 - amount) + ch(b, shift) * amount);
  return `#${((m(16) << 16) | (m(8) << 8) | m(0)).toString(16).padStart(6, '0')}`;
}

const GROUND = '#F6F4F0';

/**
 * Product placeholder: a flat 4:5 tile toned to the garment colour with a faint hairline
 * silhouette — imagery carries the colour, the UI stays neutral. Replaced by real photos.
 */
function productSvg(p: (typeof PRODUCTS)[number], view: number): string {
  const base = COLOURS[p.colours[0]!] ?? '#B8AFA3';
  const tone = [0.0, 0.08, 0.16, 0.04, 0.12][view] ?? 0;
  const bg = mix(mix(base, '#B8AFA3', 0.6), GROUND, tone);
  const dark =
    (parseInt(base.slice(1, 3), 16) +
      parseInt(base.slice(3, 5), 16) +
      parseInt(base.slice(5, 7), 16)) /
      3 <
    110;
  const stroke = dark ? '#FFFFFF' : '#111111';
  const shape = SHAPES[p.shape];
  const transforms = [
    '',
    'translate(800,0) scale(-1,1)',
    'translate(-400,-420) scale(2)',
    'translate(120,90) scale(0.7)',
    'rotate(-6 400 520)',
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><rect width="800" height="1000" fill="${bg}"/><g transform="${transforms[view] ?? ''}" opacity="0.22"><path d="${shape}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>${
    p.pattern === 'patchwork'
      ? `<path d="${shape}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="6 8" transform="translate(6,6)"/>`
      : ''
  }</g></svg>`;
}

function avatarSvg(name: string, accent: string): string {
  const initials = name
    .replace(/&/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  const bg = mix(accent, '#8E857B', 0.6);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" fill="${bg}"/><text x="100" y="116" text-anchor="middle" font-family="Didot, Georgia, serif" font-size="56" fill="#F6F4F0" letter-spacing="-2">${initials}</text></svg>`;
}

/** Warm-grey editorial placeholder with a soft wash, for heroes, covers and editorial tiles. */
function editorialSvg(seed: string, w: number, h: number, accentName?: string): string {
  const r = rng(seed);
  const accent = accentName ? (COLOURS[accentName] ?? '#9C978F') : r.pick(Object.values(COLOURS));
  const top = mix(mix(accent, '#A39A8F', 0.7), GROUND, 0.15);
  const bottom = mix(top, '#2F2C29', 0.35);
  const cx = r.int(Math.round(w * 0.35), Math.round(w * 0.65));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient><radialGradient id="l" cx="${cx / w}" cy="0.3" r="0.6"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.18"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#l)"/><path d="M${cx - w * 0.12},${h} V${h * 0.42} a${w * 0.12},${w * 0.12} 0 0 1 ${w * 0.24},0 V${h}" fill="none" stroke="#FFFFFF" stroke-opacity="0.16" stroke-width="2"/></svg>`;
}

function coverSvg(seed: string, colours: string[]): string {
  return editorialSvg(seed, 1600, 900, colours[0]);
}

export function generateSeedImages(): number {
  mkdirSync(path.join(OUT, 'products'), { recursive: true });
  mkdirSync(path.join(OUT, 'makers'), { recursive: true });
  mkdirSync(path.join(OUT, 'collections'), { recursive: true });
  let count = 0;
  for (const p of PRODUCTS) {
    for (const img of p.images) {
      writeFileSync(
        path.join(OUT, 'products', `${p.slug}-${img.view + 1}.svg`),
        productSvg(p, img.view),
      );
      count++;
    }
  }
  for (const m of MAKERS) {
    writeFileSync(
      path.join(OUT, 'makers', `${m.slug}-avatar.svg`),
      avatarSvg(m.displayName, m.accent),
    );
    writeFileSync(path.join(OUT, 'makers', `${m.slug}-cover.svg`), coverSvg(m.slug, m.palette));
    count += 2;
  }
  mkdirSync(path.join(OUT, 'editorial'), { recursive: true });
  const editorial: Array<[string, number, number, string]> = [
    ['hero', 1600, 1100, 'Rust'],
    ['hero-mobile', 800, 1200, 'Oat'],
    ['race-day', 1000, 1250, 'Terracotta'],
    ['made-to-order', 1000, 1250, 'Blush'],
    ['studio', 1000, 1250, 'Oat'],
    ['pop-up', 1000, 1000, 'Scarlet'],
  ];
  for (const [name, w, h, accent] of editorial) {
    writeFileSync(path.join(OUT, 'editorial', `${name}.svg`), editorialSvg(name, w, h, accent));
    count++;
  }
  for (const c of COLLECTIONS) {
    const palette = PRODUCTS.filter(c.match)
      .slice(0, 6)
      .map((p) => p.colours[0]!);
    writeFileSync(
      path.join(OUT, 'collections', `${c.slug}.svg`),
      coverSvg(c.slug, palette.length ? palette : ['Oat']),
    );
    count++;
  }
  return count;
}

if (require.main === module) {
  const n = generateSeedImages();
  console.log(`Generated ${n} seed images in public/seed`);
}
