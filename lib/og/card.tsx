import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ImageResponse } from 'next/og';
import sharp from 'sharp';
import { LOGOS } from '@/components/ui/Wordmark';
import { D as MONOGRAM } from '@/components/ui/Monogram';
import { log } from '@/lib/log';

/**
 * Link share previews (Open Graph / Twitter) for products and makers, 1200×630: the photo on the
 * left half; on the right, on the ground colour, the wordmark and monogram, the name in Instrument
 * Serif, a line about the maker, the price and a small-caps type line.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;
const GROUND = '#F6F4F0';
const INK = '#111111';
const MUTED = '#4A4743';

let fonts: Promise<
  Array<{ name: string; data: Buffer; weight: 400 | 500; style: 'normal' }>
> | null = null;
function loadFonts() {
  fonts ??= Promise.all(
    [
      ['Instrument Serif', 'InstrumentSerif-Regular.woff', 400],
      ['Jost', 'Jost-Regular.woff', 400],
      ['Jost', 'Jost-Medium.woff', 500],
    ].map(async ([name, file, weight]) => ({
      name: name as string,
      data: await readFile(path.join(process.cwd(), 'public', 'fonts', file as string)),
      weight: weight as 400 | 500,
      style: 'normal' as const,
    })),
  );
  return fonts;
}

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const WORDMARK = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGOS.horizontal.viewBox}"><path fill="${INK}" fill-rule="evenodd" d="${LOGOS.horizontal.d}"/></svg>`,
);
const MONO = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000"><path fill="${INK}" fill-rule="evenodd" transform="translate(0,2000) scale(0.1,-0.1)" d="${MONOGRAM}"/></svg>`,
);

/** A photo from /public or a full URL, cropped to the left half (greyed when sold). */
async function photo(src: string | null, sold: boolean): Promise<string | null> {
  if (!src) return null;
  try {
    let bytes: Buffer;
    if (src.startsWith('/')) {
      const file = path.join(
        process.cwd(),
        'public',
        path.normalize(src).replace(/^(\.\.[/\\])+/, ''),
      );
      bytes = await readFile(file);
    } else {
      const res = await fetch(src, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      bytes = Buffer.from(await res.arrayBuffer());
    }
    let img = sharp(bytes).resize(600, 630, { fit: 'cover', position: 'attention' });
    if (sold) img = img.grayscale();
    const out = await img.jpeg({ quality: 82 }).toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch (err) {
    log.warn({ err, src }, 'share image photo failed');
    return null;
  }
}

export interface ShareCard {
  photoUrl: string | null;
  title: string;
  /** "Halde Studio · Melbourne VIC" */
  line: string;
  /** "A$245" or "12 pieces" */
  detail: string | null;
  /** "Made to order", "One of one", "Ready to ship" (small caps) */
  kind: string | null;
  sold?: boolean;
}

/** A short hash of what's on the card: changes when the photo, name or price changes. */
export function cardVersion(parts: Array<string | number | boolean | null | undefined>): string {
  return createHash('sha1').update(parts.map(String).join('|')).digest('hex').slice(0, 10);
}

export async function renderShareCard(card: ShareCard): Promise<ImageResponse> {
  const [img, fontData] = await Promise.all([photo(card.photoUrl, !!card.sold), loadFonts()]);
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: GROUND }}>
        <div
          style={{
            display: 'flex',
            position: 'relative',
            width: 600,
            height: 630,
            background: '#EEEAE3',
          }}
        >
          {img && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} width={600} height={630} alt="" style={{ objectFit: 'cover' }} />
          )}
          {card.sold && (
            <div
              style={{
                position: 'absolute',
                top: 250,
                left: 150,
                width: 300,
                display: 'flex',
                justifyContent: 'center',
                border: `4px solid ${INK}`,
                background: 'rgba(246,244,240,0.85)',
                color: INK,
                fontFamily: 'Instrument Serif',
                fontSize: 84,
                letterSpacing: 10,
                transform: 'rotate(-12deg)',
              }}
            >
              SOLD
            </div>
          )}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 600,
            height: 630,
            padding: '56px 56px 52px',
            color: INK,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={WORDMARK} width={176} height={49} alt="" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={MONO} width={52} height={52} alt="" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
            {card.kind && (
              <div
                style={{
                  fontFamily: 'Jost',
                  fontWeight: 500,
                  fontSize: 18,
                  letterSpacing: 4,
                  textTransform: 'uppercase',
                  color: MUTED,
                }}
              >
                {card.sold ? 'Sold · One of one' : card.kind}
              </div>
            )}
            <div
              style={{
                fontFamily: 'Instrument Serif',
                fontSize: 64,
                lineHeight: 1.02,
                marginTop: 14,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {card.title}
            </div>
            <div style={{ fontFamily: 'Jost', fontSize: 24, color: MUTED, marginTop: 18 }}>
              {card.line}
            </div>
            {card.detail && (
              <div style={{ fontFamily: 'Jost', fontWeight: 500, fontSize: 26, marginTop: 10 }}>
                {card.detail}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: await fontData,
      headers: {
        // Each version (photo, name, price) has its own URL, so it can be cached for a long time.
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      },
    },
  );
}
