import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { ContactedToggle, MakeLink } from '@/components/survey/AdminBits';
import { listResponses, surveyStats, type SurveyFilter } from '@/lib/services/survey';
import { QUESTIONS, TAG_RE, label } from '@/lib/survey/questions';

export const metadata = { title: 'Maker survey', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const tag = (v: string | string[] | undefined) => (TAG_RE.test(str(v)) ? str(v) : null);
const day = (v: string | string[] | undefined) =>
  /^\d{4}-\d{2}-\d{2}$/.test(str(v)) ? str(v) : null;

/** Survey results: counts, headline cards, per-question bars, opt-ins and the CSV. Admin only. */
export default async function AdminSurveyPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await getSessionUser();
  if (!user || user.role !== 'admin') notFound();

  const filter: SurveyFilter = {
    src: tag(searchParams.src),
    ref: tag(searchParams.ref),
    from: day(searchParams.from),
    to: day(searchParams.to),
  };
  const [stats, rows] = await Promise.all([surveyStats(filter), listResponses(filter)]);
  const optIns = rows.filter((r) => r.followUp && r.followUp !== 'no' && r.contactEmail);
  const qs = new URLSearchParams(
    Object.entries(filter).filter((e): e is [string, string] => Boolean(e[1])),
  ).toString();

  return (
    <DashboardShell
      title="Admin"
      links={[
        { href: '/admin', label: '← All admin' },
        { href: '/admin/survey', label: 'Maker survey' },
      ]}
    >
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[40px] leading-none md:text-[48px]">Maker survey</h1>
        <form
          action="/admin/survey/export"
          method="get"
          className="flex items-center gap-3 text-sm"
        >
          {filter.src && <input type="hidden" name="src" value={filter.src} />}
          {filter.ref && <input type="hidden" name="ref" value={filter.ref} />}
          {filter.from && <input type="hidden" name="from" value={filter.from} />}
          {filter.to && <input type="hidden" name="to" value={filter.to} />}
          <label className="flex items-center gap-2">
            <input type="checkbox" name="contact" value="1" data-testid="csv-contact" />
            include contact details
          </label>
          <button type="submit" className="text-link" data-testid="csv-download">
            Download CSV
          </button>
        </form>
      </div>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 text-sm"
        data-testid="filters"
      >
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          Source
          <select
            name="src"
            defaultValue={filter.src ?? ''}
            className="min-h-[36px] border border-line bg-surface px-2"
          >
            <option value="">All</option>
            {stats.sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          Ref
          <select
            name="ref"
            defaultValue={filter.ref ?? ''}
            className="min-h-[36px] border border-line bg-surface px-2"
          >
            <option value="">All</option>
            {stats.refs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          From
          <input
            type="date"
            name="from"
            defaultValue={filter.from ?? ''}
            className="min-h-[36px] border border-line bg-surface px-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          To
          <input
            type="date"
            name="to"
            defaultValue={filter.to ?? ''}
            className="min-h-[36px] border border-line bg-surface px-2"
          />
        </label>
        <button
          type="submit"
          className="min-h-[36px] border border-ink px-4 text-[11px] uppercase tracking-[0.14em]"
        >
          Apply
        </button>
        {qs && (
          <Link href="/admin/survey" className="text-link">
            Clear
          </Link>
        )}
      </form>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          label="Responses"
          value={String(stats.total)}
          sub={`${stats.last7} in the last 7 days`}
          testId="stat-total"
        />
        <Card
          label="Would pay 12% or more"
          value={stats.commissionAbove12Pct == null ? '—' : `${stats.commissionAbove12Pct}%`}
          sub="of those who answered the commission question"
          testId="stat-commission"
        />
        <Card
          label="Founding interest"
          value={String(stats.foundingCount)}
          sub="said “Want in” or asked for a founding spot"
          testId="stat-founding"
        />
        <Card
          label="Opted in to follow-up"
          value={String(optIns.length)}
          sub="left their details"
          testId="stat-optins"
        />
      </div>

      <div className="mb-10">
        <MakeLink />
      </div>

      <section className="mb-10 grid gap-6 md:grid-cols-2" aria-label="Answers by question">
        {QUESTIONS.filter((q) => q.kind !== 'text').map((q) => (
          <div
            key={q.key}
            className="border border-line bg-surface p-4"
            data-testid={`chart-${q.key}`}
          >
            <p className="eyebrow mb-1">Q{q.n}</p>
            <h2 className="mb-3 text-[16px] leading-snug">{q.question}</h2>
            <ul className="flex flex-col gap-2">
              {(stats.perQuestion[q.key] ?? []).map((o) => (
                <li key={o.key} className="text-[13px]">
                  <div className="flex justify-between gap-3">
                    <span>{o.label}</span>
                    <span className="tabular-nums text-ink-muted">
                      {o.count} · {o.pct}%
                    </span>
                  </div>
                  <div className="mt-1 h-[6px] w-full bg-stone-light" aria-hidden>
                    <div className="h-full bg-ink" style={{ width: `${o.pct}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {rows.some((r) => r.q11Wish) && (
        <section className="mb-10" aria-labelledby="wishes">
          <h2 id="wishes" className="mb-3 text-[22px]">
            What they wish a platform did
          </h2>
          <ul className="flex flex-col gap-2">
            {rows
              .filter((r) => r.q11Wish)
              .map((r) => (
                <li
                  key={r.id}
                  className="border border-line bg-surface p-3 text-[14px] leading-relaxed"
                >
                  “{r.q11Wish}”
                  <span className="ml-2 text-[12px] text-ink-muted">
                    {new Date(r.createdAt).toLocaleDateString('en-AU')}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="optins">
        <h2 id="optins" className="mb-3 text-[22px]">
          Opted in ({optIns.length})
        </h2>
        {optIns.length === 0 ? (
          <p className="text-sm text-ink-muted">No one has left their details yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="optin-table">
              <thead className="eyebrow">
                <tr className="border-b border-line">
                  <th className="py-2 pr-4 font-normal">Name</th>
                  <th className="py-2 pr-4 font-normal">Label</th>
                  <th className="py-2 pr-4 font-normal">Email</th>
                  <th className="py-2 pr-4 font-normal">Instagram</th>
                  <th className="py-2 pr-4 font-normal">Wants</th>
                  <th className="py-2 pr-4 font-normal">Q10</th>
                  <th className="py-2 pr-4 font-normal">Date</th>
                  <th className="py-2 pr-4 font-normal">Contacted</th>
                </tr>
              </thead>
              <tbody>
                {optIns.map((r) => (
                  <tr key={r.id} className="border-b border-line align-top" data-testid="optin-row">
                    <td className="py-2 pr-4">{r.contactName}</td>
                    <td className="py-2 pr-4">{r.labelName}</td>
                    <td className="py-2 pr-4">
                      <a href={`mailto:${r.contactEmail}`} className="link">
                        {r.contactEmail}
                      </a>
                    </td>
                    <td className="py-2 pr-4">
                      {r.instagram ? (
                        <a
                          href={`https://instagram.com/${r.instagram}`}
                          className="link"
                          rel="noreferrer"
                        >
                          @{r.instagram}
                        </a>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="py-2 pr-4">{label('follow_up', r.followUp)}</td>
                    <td className="py-2 pr-4">{label('q10_founding', r.q10Founding)}</td>
                    <td className="py-2 pr-4 tabular-nums">
                      {new Date(r.createdAt).toLocaleDateString('en-AU')}
                    </td>
                    <td className="py-2 pr-4">
                      <ContactedToggle
                        id={r.id}
                        contactedAt={r.contactedAt ? new Date(r.contactedAt).toISOString() : null}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </DashboardShell>
  );
}

function Card({
  label,
  value,
  sub,
  testId,
}: {
  label: string;
  value: string;
  sub: string;
  testId: string;
}) {
  return (
    <div className="border border-line bg-surface p-4" data-testid={testId}>
      <p className="eyebrow">{label}</p>
      <p className="mt-1 font-display text-[40px] leading-none">{value}</p>
      <p className="mt-1 text-[12px] text-ink-muted">{sub}</p>
    </div>
  );
}
