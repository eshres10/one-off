import { formatPrice } from '@/lib/domain/money';

export interface AgreedSpecData {
  garmentType?: string | null;
  occasion?: string | null;
  measurements?: string | null;
  fabricPreferences?: string | null;
  colourPreferences?: string | null;
  notes?: string | null;
  deadlineDate?: string | null;
  quote?: {
    totalPriceCents?: number;
    depositCents?: number;
    productionDays?: number;
    revisionsIncluded?: number;
    shippingCents?: number;
    estimatedDeliveryDate?: string | null;
    message?: string | null;
  };
}

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

/** The locked snapshot of a custom piece: shown to buyer and maker under "What was agreed". */
export function AgreedSpec({ spec, agreedAt }: { spec: AgreedSpecData; agreedAt?: Date | null }) {
  const q = spec.quote ?? {};
  const rows: Array<[string, string | null | undefined]> = [
    ['Garment', spec.garmentType],
    ['Occasion', spec.occasion],
    ['Measurements', spec.measurements],
    ['Fabric', spec.fabricPreferences],
    ['Colour', spec.colourPreferences],
    ['Notes', spec.notes],
    ['Needed by', fmtDate(spec.deadlineDate)],
    ['Price', q.totalPriceCents != null ? formatPrice(q.totalPriceCents) : null],
    ['Deposit', q.depositCents != null ? formatPrice(q.depositCents) : null],
    ['Shipping', q.shippingCents != null ? formatPrice(q.shippingCents) : null],
    ['Production', q.productionDays != null ? `${q.productionDays} days` : null],
    ['Alterations included', q.revisionsIncluded != null ? String(q.revisionsIncluded) : null],
    ['Estimated delivery', fmtDate(q.estimatedDeliveryDate)],
    ['Maker’s note', q.message],
  ];
  return (
    <section
      aria-labelledby="agreed-spec"
      className="border border-line bg-surface p-5"
      data-testid="agreed-spec"
    >
      <h2 id="agreed-spec" className="text-[28px] leading-none">
        What was agreed
      </h2>
      {agreedAt && (
        <p className="mt-1 text-[12px] text-muted-2">
          Locked on {agreedAt.toLocaleDateString('en-AU', { dateStyle: 'medium' })}. It can’t be
          changed, so it’s what the finished piece is checked against.
        </p>
      )}
      <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-[13px]">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-2">{k}</dt>
              <dd className="whitespace-pre-line">{v}</dd>
            </div>
          ))}
      </dl>
    </section>
  );
}
