import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { LOGOS } from '@/components/ui/Wordmark';

export const runtime = 'nodejs';

const GROUND = '#F6F4F0';
const INK = '#111111';
const MUTED = '#4A4743';

const svgUri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const WORDMARK = svgUri(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGOS.horizontal.viewBox}"><path fill="${INK}" d="${LOGOS.horizontal.d}"/></svg>`,
);

/** The survey's link preview: the off-white background, OFF ONE and the one-line invitation. */
export async function GET() {
  const fonts = await Promise.all(
    [
      ['Instrument Serif', 'InstrumentSerif-Regular.woff', 400],
      ['Jost', 'Jost-Regular.woff', 400],
    ].map(async ([name, file, weight]) => ({
      name: name as string,
      data: await readFile(path.join(process.cwd(), 'public', 'fonts', file as string)),
      weight: weight as 400,
      style: 'normal' as const,
    })),
  );
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: GROUND,
          color: INK,
          padding: 80,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={WORDMARK} width={300} height={83} alt="" />
        <div
          style={{
            marginTop: 56,
            fontFamily: 'Instrument Serif',
            fontSize: 64,
            lineHeight: 1.05,
            textAlign: 'center',
            maxWidth: 980,
          }}
        >
          5 minutes to help shape a marketplace for Australian makers
        </div>
        <div
          style={{
            marginTop: 36,
            fontFamily: 'Jost',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: MUTED,
          }}
        >
          Maker survey · survey.offone.world
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts,
      headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
    },
  );
}
