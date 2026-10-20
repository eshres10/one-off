import { fmtDayLong } from '@/lib/custom/brief';
import { formatPrice } from '@/lib/domain/money';
import type { CustomOrderFacts } from '@/lib/services/custom-orders';

const STEPS = [
  { key: 'sketch_shared', label: 'Sketch shared', pending: 'Sketch within 3 days' },
  { key: 'fabric_bought', label: 'Fabric bought', pending: 'Fabric' },
  { key: 'fitting', label: 'Fitting', pending: 'Fitting, if any' },
  { key: 'made', label: 'Made', pending: 'Made' },
  { key: 'sent', label: 'Sent', pending: 'Sent with tracking' },
] as const;

const when = (iso: string) =>
  new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Melbourne',
  });

/** The buyer's view of a custom order: the maker's steps and the quote they accepted. */
export function CustomProgress({
  facts,
  shippedAt,
}: {
  facts: CustomOrderFacts;
  shippedAt: Date | null;
}) {
  const m = { ...facts.milestones } as Record<
    string,
    { at: string; photo?: string | null; note?: string | null }
  >;
  if (shippedAt && !m.sent) m.sent = { at: new Date(shippedAt).toISOString() };
  return (
    <section
      className="border-t border-line py-6"
      aria-label="In the making"
      data-testid="custom-progress"
    >
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
        In the making · {facts.makerName}
      </p>
      <ol className="ml-1.5 mt-4 flex flex-col gap-4 border-l border-ink">
        {STEPS.map((s) => {
          const e = m[s.key];
          return (
            <li
              key={s.key}
              className="relative pl-5"
              data-testid={`progress-${s.key}`}
              data-done={e ? '' : undefined}
            >
              <span
                aria-hidden
                className={`absolute -left-[6px] top-1 h-[11px] w-[11px] rounded-circle border border-ink ${e ? 'bg-ink' : 'bg-ground'}`}
              />
              <b className="font-medium">{e ? s.label : s.pending}</b>
              <br />
              <span className="text-[12px] text-muted-2">
                {e ? `${when(e.at)}${e.note ? ` · “${e.note}”` : ''}` : 'Coming up'}
              </span>
              {e?.photo && (
                <a href={e.photo} target="_blank" rel="noreferrer" className="mt-2 block w-24">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={e.photo}
                    alt={`${s.label} photo`}
                    className="aspect-4/5 w-full object-cover"
                  />
                </a>
              )}
            </li>
          );
        })}
      </ol>
      <dl className="mt-6 grid grid-cols-[92px_1fr] gap-x-2 gap-y-1 border-t border-line pt-4 text-[12px]">
        <dt className="text-muted-2">Quote</dt>
        <dd>{formatPrice(facts.quote.price)}, fabric included</dd>
        <dt className="text-muted-2">Ready by</dt>
        <dd>{fmtDayLong(facts.quote.readyBy)}</dd>
        {facts.quote.fabric && (
          <>
            <dt className="text-muted-2">Fabric</dt>
            <dd>{facts.quote.fabric}</dd>
          </>
        )}
      </dl>
      <p className="mt-3 font-display text-[18px] leading-[1.2]">“{facts.quote.note}”</p>
      <p className="mt-3 text-[12px] text-muted">
        Made just for you, so it can’t be returned for a change of mind. Faulty or not what you
        agreed? Report a problem on the piece below.
      </p>
    </section>
  );
}
