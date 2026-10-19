import type { Metadata } from 'next';
import Link from 'next/link';
import { SIZE_GUIDE } from '@/content/pages/size-guide';
import { getSessionUser } from '@/lib/auth/session';
import { getMeasurements } from '@/lib/queries/account';
import { SizeTable } from '@/components/size-guide/SizeTable';

export function generateMetadata(): Metadata {
  return { title: SIZE_GUIDE.meta.title, description: SIZE_GUIDE.meta.description };
}

const TAPE = '#8A2E1C';

/** A line drawing of a figure with the four measurements dashed in. */
function MeasureFigure() {
  return (
    <svg
      viewBox="0 0 240 420"
      role="img"
      aria-label="Where to measure bust, waist, hips and height"
      className="mx-auto h-auto w-full max-w-[220px]"
    >
      <g fill="none" stroke="#111" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="110" cy="40" rx="22" ry="27" />
        <path d="M100 66v12M120 66v12" />
        <path d="M100 78c-22 2-38 10-44 26-6 18-8 50-12 86M120 78c22 2 38 10 44 26 6 18 8 50 12 86" />
        <path d="M70 110c4 28 6 46 4 66-3 22-14 38-16 64-2 30 4 58 10 100 3 20 4 40 4 60M150 110c-4 28-6 46-4 66 3 22 14 38 16 64 2 30-4 58-10 100-3 20-4 40-4 60" />
        <path d="M107 270c-1 50 -2 100 -3 130M113 270c1 50 2 100 3 130" />
      </g>
      <g stroke={TAPE} strokeWidth={1.2} strokeDasharray="4 3" fill="none">
        <path d="M58 128h104" />
        <path d="M70 172h80" />
        <path d="M62 218h96" />
        <path d="M206 14v386" />
      </g>
    </svg>
  );
}

/** Size guide. */
export default async function SizeGuidePage() {
  const g = SIZE_GUIDE;
  const user = await getSessionUser();
  const saved = user ? await getMeasurements(user).catch(() => null) : null;
  return (
    <div data-testid="size-guide-page">
      <header className="container-page grid gap-6 border-b border-line pb-14 pt-12 md:grid-cols-2 md:items-end md:pb-20 md:pt-20">
        <div>
          <p className="eyebrow">{g.kicker}</p>
          <h1 className="mt-4 text-[56px] leading-[0.95] md:text-[88px]">
            {g.title}
            <br />
            <em>{g.titleItalic}</em>
          </h1>
        </div>
        <p className="max-w-[46ch] text-[15px] leading-relaxed text-text2 md:justify-self-end">
          {g.intro}
        </p>
      </header>

      <section className="container-page pt-14 md:pt-20">
        <SizeTable
          title={g.tableTitle}
          sizes={g.sizes}
          rows={g.rows}
          highlight={saved?.usualSize ?? null}
        />
        <p className="mt-3 text-[12px] text-muted">{g.note}</p>
      </section>

      <section className="container-page grid gap-10 py-16 md:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] md:gap-16 md:py-24">
        <div className="bg-stone px-6 py-10">
          <MeasureFigure />
        </div>
        <div>
          <h2 className="text-[40px] leading-none md:text-[48px]">{g.measure.title}</h2>
          <p className="mt-4 text-[14px] text-text2">{g.measure.intro}</p>
          <ol className="mt-6 border-t border-line">
            {g.measure.steps.map((s, i) => (
              <li
                key={s.title}
                className="grid grid-cols-[48px_minmax(0,1fr)] gap-4 border-b border-line py-5"
              >
                <span className="pt-1 text-[11px] tracking-label" style={{ color: TAPE }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="block font-display text-[24px] leading-tight">{s.title}</span>
                  <span className="mt-1 block text-[13px] text-text2">{s.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-page">
        <div className="flex flex-col gap-6 bg-ink px-6 py-10 text-ground md:flex-row md:items-center md:justify-between md:px-14">
          <div>
            <h2 className="text-[34px] leading-tight md:text-[40px]">{g.banner.title}</h2>
            <p className="mt-2 max-w-[60ch] text-[14px] text-ground/80">{g.banner.body}</p>
          </div>
          <Link
            href={user ? '/account/sizes' : '/login?next=%2Faccount%2Fsizes'}
            className="flex min-h-[52px] shrink-0 items-center justify-center bg-ground px-8 text-[11px] uppercase tracking-[0.2em] text-ink"
            data-testid="save-my-sizes"
          >
            {g.banner.cta}
          </Link>
        </div>
      </section>
    </div>
  );
}
