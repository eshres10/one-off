import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import {
  MEASURE_FIELDS,
  colourHex,
  colourLabel,
  fmtDayLong,
  patternName,
} from '@/lib/custom/brief';
import { CUSTOM } from '@/lib/custom/config';
import type { MakerRequestDetail } from '@/lib/services/custom-studio';

function Fact({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

/** The middle column: who, why you matched, their photos and words, the facts, measurements. */
export function RequestDetail({ r }: { r: MakerRequestDetail }) {
  const hex = colourHex(r.colour);
  const fit =
    r.fitMode === 'fitting'
      ? 'In-person fitting'
      : r.fitMode === 'saved'
        ? 'Their saved sizes (below)'
        : r.measurements
          ? `Their measurements (below)${r.measurements.height ? ` · height ${r.measurements.height} cm` : ''}`
          : '—';
  const delivery =
    r.fitMode === 'fitting'
      ? 'Nearby, for fittings'
      : r.reach === 'near'
        ? 'Nearby only'
        : 'Posted or nearby, either is fine';
  return (
    <div className="flex flex-col gap-6" data-testid="request-detail">
      <div className="flex flex-col gap-2">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
          {r.occasion}
          {r.neededBy ? ` · Needed by ${fmtDayLong(r.neededBy)}` : ' · Flexible on the date'}
        </span>
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-[40px] leading-[1.02] md:text-[52px]">
            {r.title[0]!.toUpperCase() + r.title.slice(1)}
          </h2>
          <div
            className="shrink-0 bg-stone-light px-4 py-3 text-right text-[13px]"
            data-testid="time-left"
          >
            {r.hoursLeft != null ? (
              <span className="block text-[14px]">{r.hoursLeft} hours left to reply</span>
            ) : (
              <span className="block text-[14px]">
                {r.recipientStatus === 'quoted'
                  ? 'Quote sent'
                  : r.recipientStatus === 'chosen'
                    ? 'Accepted'
                    : 'Closed'}
              </span>
            )}
            <span className="text-muted">
              {r.otherMakers > 0
                ? `Sent to you + ${r.otherMakers} other${r.otherMakers === 1 ? '' : 's'}`
                : 'Sent to you only'}
            </span>
          </div>
        </div>
        <p className="text-[14px] text-muted">
          {r.who}
          {r.anonymous && r.recipientStatus !== 'chosen'
            ? ' · anonymous until they accept a quote'
            : ''}
        </p>
      </div>

      {r.matchReasons.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Why you matched
          </span>
          {r.matchReasons.map((w) => (
            <span key={w} className="border border-ink px-2.5 py-1.5 text-[13px]">
              {w}
            </span>
          ))}
        </div>
      )}

      {r.inspiration.length > 0 && (
        <div className="grid grid-cols-3 gap-1" data-testid="request-photos">
          {r.inspiration.map((src) => (
            <a
              key={src}
              href={src}
              target="_blank"
              rel="noreferrer"
              className="relative aspect-4/5 overflow-hidden bg-[#D2CBC1]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
              />
            </a>
          ))}
        </div>
      )}

      {r.words && (
        <p
          className="font-display text-[26px] leading-[1.15] md:text-[32px]"
          data-testid="request-words"
        >
          “{r.words}”
        </p>
      )}
      {r.link && (
        <a
          href={r.link}
          target="_blank"
          rel="noreferrer"
          className="text-[13px] underline underline-offset-[3px]"
        >
          Their inspiration link ↗
        </a>
      )}

      <dl className="grid grid-cols-[110px_1fr] gap-x-6 gap-y-2.5 border-t border-line pt-5 text-[15px]">
        <Fact k="Fabric" v={r.fabrics.join(', ') || 'Maker suggests'} />
        <Fact k="Details" v={r.details.join(', ') || '—'} />
        <Fact
          k="Colour"
          v={
            <span className="inline-flex items-center gap-2">
              {hex && (
                <span
                  aria-hidden
                  className="inline-block h-4 w-4 rounded-circle border border-black/10"
                  style={{ background: hex }}
                />
              )}
              {colourLabel(r.colour)}
              {r.pattern !== 'plain' ? ` · ${patternName(r.pattern)}` : ''}
            </span>
          }
        />
        <Fact k="Budget" v={r.budget} />
        <Fact k="Fit" v={fit} />
        <Fact k="Delivery" v={delivery} />
        {r.sourceListing && (
          <Fact
            k="Started from"
            v={
              <Link
                href={`/products/${r.sourceListing.slug}`}
                className="underline underline-offset-[3px]"
              >
                {r.sourceListing.title}
              </Link>
            }
          />
        )}
      </dl>

      {r.measurements && Object.keys(r.measurements).length > 0 && (
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
              Their measurements, cm
            </span>
            <span className="text-[12px] text-muted">Shared only with the makers they picked</span>
          </div>
          <div
            className="mt-2 grid grid-cols-4 border border-line bg-surface"
            data-testid="request-measurements"
          >
            {MEASURE_FIELDS.map((f) => (
              <div
                key={f.key}
                className="border-b border-r border-line p-3 last:border-r-0 [&:nth-child(4n)]:border-r-0 [&:nth-child(n+5)]:border-b-0"
              >
                <span className="block text-[12px] text-muted">{f.label}</span>
                <span className="font-display text-[28px] leading-none">
                  {r.measurements?.[f.key] ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted-2">
        Reply within {CUSTOM.replyHours} hours to keep your response badge. Quotes stay open to the
        buyer for {CUSTOM.quoteValidDays} days.
      </p>
    </div>
  );
}

export function RequestThumb({ src }: { src: string | null }) {
  return (
    <span className="relative block h-[100px] w-20 shrink-0 overflow-hidden bg-[#D2CBC1]">
      {src && (
        <Image src={src} alt="" fill sizes="80px" className="object-cover object-[center_20%]" />
      )}
    </span>
  );
}
