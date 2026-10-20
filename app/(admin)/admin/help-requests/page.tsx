import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { MEASURE_FIELDS, colourLabel, fmtDayLong, patternName } from '@/lib/custom/brief';
import { assignHelpAction, closeHelpAction, noteHelpAction } from '@/lib/actions/help-requests';
import { getHelpRequest, listHelpRequests, liveShops } from '@/lib/services/help-requests';
import { SendToMaker } from '@/components/admin/SendToMaker';

export const metadata = { title: 'Help requests' };

const when = (d: Date) =>
  new Date(d).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Melbourne',
  });

const STATUS: Record<string, string> = {
  open: 'Open',
  in_progress: 'In progress',
  matched: 'Sent to a maker',
  closed: 'Closed',
};

/** "Ask Off One for help" from Have it made: the brief, the measurements, and who to send it to. */
export default async function HelpRequestsPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const admin = await requireAdmin();
  const [rows, detail] = await Promise.all([
    listHelpRequests(),
    searchParams.id ? getHelpRequest(searchParams.id) : Promise.resolve(null),
  ]);
  const shops = detail ? await liveShops() : [];
  return (
    <div className="space-y-6">
      <h1 className="text-[40px] leading-none md:text-[48px]">Help requests</h1>
      <p className="text-[13px] text-muted">
        Buyers who asked us to find a maker. Send the brief to a shop and it lands in their Studio
        like any request.
      </p>
      <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
        {rows.length === 0 ? (
          <p className="text-[14px] text-muted">Nothing open.</p>
        ) : (
          <ul
            className="divide-y divide-line border-y border-line"
            role="list"
            data-testid="help-list"
          >
            {rows.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/admin/help-requests?id=${r.id}`}
                  aria-current={detail?.id === r.id ? 'page' : undefined}
                  className={`block px-2 py-3 text-[13px] ${detail?.id === r.id ? 'bg-surface' : 'hover:bg-surface'}`}
                  data-testid={`help-${r.number}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[14px]">{r.number}</span>
                    <span className="text-[10px] uppercase tracking-label text-muted">
                      {STATUS[r.status] ?? r.status}
                    </span>
                  </span>
                  <span className="block">{r.summary}</span>
                  <span className="block text-muted">
                    {r.buyerName} · {when(r.createdAt)}
                    {r.assignedName ? ` · ${r.assignedName}` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {detail && (
          <section className="space-y-6" aria-label="Help request" data-testid="help-detail">
            <header>
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
                {detail.number} · {STATUS[detail.status] ?? detail.status}
                {detail.assignedName ? ` · ${detail.assignedName}` : ''}
              </p>
              <h2 className="mt-1 text-[32px] leading-none">{detail.summary}</h2>
              <p className="mt-2 text-[13px] text-muted">
                {detail.buyerName} ·{' '}
                <a
                  href={`mailto:${detail.buyerEmail}`}
                  className="underline underline-offset-[3px]"
                >
                  {detail.buyerEmail}
                </a>{' '}
                · {when(detail.createdAt)}
              </p>
              {detail.note && (
                <p className="mt-3 bg-stone-light px-3 py-2.5 text-[13px]">
                  <span className="text-muted-2">Their note: </span>“{detail.note}”
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.assignedTo !== admin.id && detail.status !== 'closed' && (
                  <form action={assignHelpAction}>
                    <input type="hidden" name="id" value={detail.id} />
                    <button
                      className="min-h-[40px] border border-ink px-4 text-[11px] uppercase tracking-label"
                      data-testid="assign-me"
                    >
                      Assign to me
                    </button>
                  </form>
                )}
                {detail.status !== 'closed' && (
                  <form action={closeHelpAction}>
                    <input type="hidden" name="id" value={detail.id} />
                    <button
                      className="min-h-[40px] border border-line-strong px-4 text-[11px] uppercase tracking-label"
                      data-testid="close-help"
                    >
                      Close
                    </button>
                  </form>
                )}
              </div>
            </header>

            {detail.brief.words && (
              <p className="font-display text-[24px] leading-[1.2]">“{detail.brief.words}”</p>
            )}
            {detail.brief.inspiration.length > 0 && (
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-6">
                {detail.brief.inspiration.map((src) => (
                  <a
                    key={src}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="relative aspect-4/5 overflow-hidden bg-stone"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-[13px]">
              <dt className="text-muted">Piece</dt>
              <dd>{detail.brief.kindLabel}</dd>
              <dt className="text-muted">For</dt>
              <dd>
                {detail.brief.occasion}
                {detail.brief.neededBy
                  ? ` · by ${fmtDayLong(detail.brief.neededBy)}`
                  : ' · flexible'}
              </dd>
              <dt className="text-muted">Fabric</dt>
              <dd>{detail.brief.fabrics.join(', ') || 'Maker suggests'}</dd>
              <dt className="text-muted">Details</dt>
              <dd>{detail.brief.details.join(', ') || '—'}</dd>
              <dt className="text-muted">Colour</dt>
              <dd>
                {colourLabel(detail.brief.colour)}
                {detail.brief.pattern !== 'plain' ? ` · ${patternName(detail.brief.pattern)}` : ''}
              </dd>
              <dt className="text-muted">Budget</dt>
              <dd>
                A${detail.brief.budgetMin}
                {detail.brief.budgetMax != null ? `–${detail.brief.budgetMax}` : '+'}
              </dd>
              <dt className="text-muted">Where</dt>
              <dd>
                {[detail.brief.suburb, detail.brief.state, detail.brief.postcode]
                  .filter(Boolean)
                  .join(' ')}{' '}
                ·{' '}
                {detail.brief.fitMode === 'fitting'
                  ? 'wants an in-person fitting'
                  : detail.brief.reach === 'near'
                    ? 'nearby only'
                    : 'posted or nearby'}
              </dd>
              <dt className="text-muted">Shown as</dt>
              <dd>{detail.brief.anonymous ? 'Anonymous to makers' : 'Their name'}</dd>
              {detail.brief.link && (
                <>
                  <dt className="text-muted">Link</dt>
                  <dd>
                    <a
                      href={detail.brief.link}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-[3px]"
                    >
                      {detail.brief.link}
                    </a>
                  </dd>
                </>
              )}
            </dl>
            {detail.brief.measurements && (
              <div
                className="grid grid-cols-4 border border-line bg-surface text-[13px] sm:grid-cols-8"
                data-testid="help-measurements"
              >
                {MEASURE_FIELDS.map((f) => (
                  <div key={f.key} className="border-r border-line p-2 last:border-r-0">
                    <span className="block text-[11px] text-muted">{f.label}</span>
                    <span className="font-display text-[22px] leading-none">
                      {detail.brief.measurements?.[f.key] ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-line pt-5">
              <h3 className="text-[11px] uppercase tracking-label text-muted-2">Sent to</h3>
              {detail.recipients.length === 0 ? (
                <p className="mt-2 text-[13px] text-muted">No makers yet.</p>
              ) : (
                <ul className="mt-2 text-[13px]" role="list">
                  {detail.recipients.map((x) => (
                    <li key={x.makerId}>
                      {x.name} · {x.status}
                    </li>
                  ))}
                </ul>
              )}
              {detail.status !== 'closed' && <SendToMaker id={detail.id} shops={shops} />}
            </div>

            <form action={noteHelpAction} className="border-t border-line pt-5">
              <label
                htmlFor="help-note"
                className="text-[11px] uppercase tracking-label text-muted-2"
              >
                Internal note
              </label>
              <input type="hidden" name="id" value={detail.id} />
              <textarea
                id="help-note"
                name="note"
                defaultValue={detail.internalNote ?? ''}
                rows={3}
                maxLength={4000}
                className="input mt-2 min-h-[80px]"
                data-testid="help-internal-note"
              />
              <button className="mt-2 min-h-[40px] border border-ink px-4 text-[11px] uppercase tracking-label">
                Save note
              </button>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}
