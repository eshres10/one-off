/**
 * Generates deterministic placeholder photography (SVG) into public/seed so local development
 * never depends on a paid or remote image service. Garments are drawn as simple silhouettes in
 * the product's colour and pattern on warm studio backdrops.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  BACKDROPS,
  COLLECTIONS,
  COLOURS,
  MAKERS,
  PRODUCTS,
  rng,
  type Pattern,
  type Shape,
} from './seed-data';

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

const STRAPS: Partial<Record<Shape, string>> = {
  slip: 'M352,120 L360,236 M448,120 L440,236',
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * (1 + amount));
  const g = clamp(((n >> 8) & 255) * (1 + amount));
  const b = clamp((n & 255) * (1 + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function patternDef(id: string, pattern: Pattern, base: string, seed: string): string {
  const r = rng(seed);
  const dark = shade(base, -0.25);
  const light = shade(base, 0.35);
  switch (pattern) {
    case 'stripes':
      return `<pattern id="${id}" width="36" height="36" patternUnits="userSpaceOnUse" patternTransform="rotate(${r.pick([0, 90, 45])})"><rect width="36" height="36" fill="${base}"/><rect width="12" height="36" fill="${light}"/></pattern>`;
    case 'dots':
      return `<pattern id="${id}" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="${base}"/><circle cx="10" cy="10" r="5" fill="${light}"/><circle cx="30" cy="30" r="5" fill="${light}"/></pattern>`;
    case 'gingham':
      return `<pattern id="${id}" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="48" height="48" fill="${light}"/><rect width="24" height="48" fill="${base}" opacity="0.55"/><rect width="48" height="24" fill="${base}" opacity="0.55"/></pattern>`;
    case 'floral': {
      const petals = Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return `<circle cx="${30 + Math.cos(a) * 9}" cy="${30 + Math.sin(a) * 9}" r="7" fill="${light}"/>`;
      }).join('');
      return `<pattern id="${id}" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(${r.int(0, 40)})"><rect width="60" height="60" fill="${base}"/>${petals}<circle cx="30" cy="30" r="5" fill="${dark}"/></pattern>`;
    }
    case 'pleats':
      return `<pattern id="${id}" width="44" height="20" patternUnits="userSpaceOnUse"><rect width="44" height="20" fill="${base}"/><rect width="4" height="20" fill="${dark}" opacity="0.6"/><rect x="22" width="2" height="20" fill="${light}" opacity="0.5"/></pattern>`;
    case 'patchwork': {
      const palette = Object.values(COLOURS);
      const cells: string[] = [];
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const fill = x === y ? base : r.pick(palette);
          cells.push(`<rect x="${x * 60}" y="${y * 60}" width="60" height="60" fill="${fill}"/>`);
          if (r.chance(0.4))
            cells.push(
              `<circle cx="${x * 60 + 30}" cy="${y * 60 + 30}" r="10" fill="${light}" opacity="0.7"/>`,
            );
        }
      }
      return `<pattern id="${id}" width="240" height="240" patternUnits="userSpaceOnUse" patternTransform="rotate(${r.int(-8, 8)})">${cells.join('')}<path d="M0,60 H240 M0,120 H240 M0,180 H240 M60,0 V240 M120,0 V240 M180,0 V240" stroke="#fff" stroke-width="2" stroke-dasharray="6 5" opacity="0.6"/></pattern>`;
    }
    default:
      return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.45" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>`;
  }
}

function productSvg(p: (typeof PRODUCTS)[number], view: number): string {
  const r = rng(`${p.slug}:${view}`);
  const base = COLOURS[p.colours[0]!] ?? '#888888';
  const bg = BACKDROPS[(p.slug.length + view) % BACKDROPS.length]!;
  const fillId = `f${view}`;
  const defs = patternDef(fillId, p.pattern, base, p.slug);
  const shape = SHAPES[p.shape];
  const straps = STRAPS[p.shape]
    ? `<path d="${STRAPS[p.shape]}" stroke="${shade(base, -0.3)}" stroke-width="5" fill="none"/>`
    : '';
  const hanger = `<path d="M400,90 q0,-26 18,-26 q16,0 16,16 M400,92 L300,150 L500,150 Z" stroke="#7a6f62" stroke-width="5" fill="none" stroke-linejoin="round"/>`;
  const shadow = `<ellipse cx="400" cy="955" rx="230" ry="18" fill="#000" opacity="0.08"/>`;
  const garment = (transform = '') =>
    `<g ${transform}>${p.shape === 'maxi' || p.shape === 'jacket' ? '' : hanger}${straps}<path d="${shape}" fill="url(#${fillId})" stroke="${shade(base, -0.35)}" stroke-width="3" stroke-linejoin="round"/><path d="${shape}" fill="url(#sheen)"/></g>`;

  let body: string;
  switch (view) {
    case 1: // back
      body = `<rect width="800" height="1000" fill="${shade(bg, -0.03)}"/>${shadow}${garment('transform="translate(800,0) scale(-1,1)"')}<path d="M400,200 L400,520" stroke="${shade(base, -0.4)}" stroke-width="3" stroke-dasharray="2 6"/>`;
      break;
    case 2: // fabric detail
      body = `<rect width="800" height="1000" fill="url(#${fillId})"/><g opacity="0.25">${Array.from({ length: 30 }, (_, i) => `<path d="M${i * 30},0 Q${i * 30 + 15},500 ${i * 30 - 10},1000" stroke="#000" stroke-width="1" fill="none"/>`).join('')}</g><path d="M60,${r.int(560, 760)} H740" stroke="${shade(base, 0.5)}" stroke-width="3" stroke-dasharray="10 8"/>`;
      break;
    case 3: // styled under an arch
      body = `<rect width="800" height="1000" fill="${shade(bg, -0.12)}"/><path d="M120,1000 V380 A280,280 0 0 1 680,380 V1000 Z" fill="${shade(bg, 0.06)}"/>${shadow}${garment('transform="translate(80,60) scale(0.8)"')}<circle cx="${r.int(150, 650)}" cy="${r.int(120, 220)}" r="36" fill="${shade(base, 0.4)}" opacity="0.4"/>`;
      break;
    case 4: // flat lay
      body = `<rect width="800" height="1000" fill="#F4EFE8"/><g opacity="0.07">${Array.from({ length: 20 }, (_, i) => `<rect x="0" y="${i * 50}" width="800" height="1" fill="#000"/>`).join('')}</g>${garment(`transform="rotate(${r.int(-9, 9)} 400 520) translate(40,30) scale(0.9)"`)}`;
      break;
    default:
      body = `<rect width="800" height="1000" fill="${bg}"/><rect y="760" width="800" height="240" fill="${shade(bg, -0.05)}"/>${shadow}${garment()}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000" width="800" height="1000"><defs>${defs}<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.18"/><stop offset="0.5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient></defs>${body}</svg>`;
}

function avatarSvg(name: string, accent: string): string {
  const initials = name
    .replace(/&/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><rect width="200" height="200" fill="${accent}"/><circle cx="100" cy="100" r="78" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2"/><text x="100" y="118" text-anchor="middle" font-family="Georgia, serif" font-size="60" fill="#FAF8F5">${initials}</text></svg>`;
}

function coverSvg(seed: string, colours: string[]): string {
  const r = rng(seed);
  const shapes: string[] = [];
  for (let i = 0; i < 9; i++) {
    const c = COLOURS[colours[i % colours.length]!] ?? '#999';
    const x = i * 190 + r.int(-30, 30);
    shapes.push(
      `<path d="M${x},700 V${r.int(220, 380)} A${80 + r.int(0, 20)},${80 + r.int(0, 20)} 0 0 1 ${x + 170},${r.int(220, 380)} V700 Z" fill="${c}" opacity="${0.55 + r.next() * 0.4}"/>`,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 700" width="1600" height="700"><rect width="1600" height="700" fill="#EDE6DC"/>${shapes.join('')}<rect y="620" width="1600" height="80" fill="#D9D3CA" opacity="0.6"/></svg>`;
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
