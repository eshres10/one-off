import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { fmtDay } from '@/lib/custom/brief';
import {
  getCustomSettings,
  getMakerRequest,
  listMakerRequests,
  type MakerRequestRow,
} from '@/lib/services/custom-studio';
import { CustomSettingsForm } from '@/components/studio/requests/CustomSettingsForm';
import { QuotePanel } from '@/components/studio/requests/QuotePanel';
import { RequestDetail, RequestThumb } from '@/components/studio/requests/RequestDetail';
import { BUDGET_BANDS } from '@/lib/custom/config';

export const metadata = { title: 'Custom requests · Studio' };

function Badge({ r }: { r: MakerRequestRow }) {
  if (r.recipientStatus === 'pending' && r.hoursLeft != null)
    return (
      <span
        className="bg-ink px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-ground"
        data-testid="badge-left"
      >
        {r.hoursLeft}h left
      </span>
    );
  const label =
    r.recipientStatus === 'quoted'
      ? 'Quoted'
      : r.recipientStatus === 'chosen'
        ? 'Accepted'
        : r.recipientStatus === 'passed'
          ? 'Passed'
          : r.recipientStatus === 'not_chosen'
            ? 'Not chosen'
            : 'Expired';
  return (
    <span
      className="bg-stone-light px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-muted"
      data-testid="badge-status"
    >
      {label}
    </span>
  );
}

function Tabs({ active, pending }: { active: 'requests' | 'settings'; pending: number }) {
  const cls = (on: boolean) =>
    `-mb-px flex min-h-[44px] items-center gap-1.5 border-b text-[11px] uppercase tracking-label ${on ? 'border-ink' : 'border-transparent text-muted-2 hover:text-ink'}`;
  return (
    <nav aria-label="Custom requests" className="mt-6 flex gap-6 border-b border-line">
      <Link
        href="/studio/requests"
        aria-current={active === 'requests' ? 'page' : undefined}
        className={cls(active === 'requests')}
        data-testid="tab-requests"
      >
        Requests {pending > 0 && <span className="text-muted-2">({pending})</span>}
      </Link>
      <Link
        href="/studio/requests?tab=settings"
        aria-current={active === 'settings' ? 'page' : undefined}
        className={cls(active === 'settings')}
        data-testid="tab-settings"
      >
        Custom work settings
      </Link>
    </nav>
  );
}

/** Studio → Custom requests: the list, the brief and the quote panel; or the settings tab. */
export default async function StudioRequestsPage({
  searchParams,
}: {
  searchParams: { tab?: string; id?: string };
}) {
  const seller = await requireSeller();
  const [rows, settings] = await Promise.all([
    listMakerRequests(seller),
    getCustomSettings(seller),
  ]);
  const pending = rows.filter((r) => r.recipientStatus === 'pending').length;
  const left = Math.max(0, settings.spotsPerMonth - settings.spotsUsed);
  const month = new Date().toLocaleDateString('en-AU', {
    month: 'long',
    timeZone: 'Australia/Melbourne',
  });

  const head = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-[40px] leading-none md:text-[56px]">Custom requests</h1>
      <p className="flex items-center gap-2 text-[14px]" data-testid="open-line">
        <span
          aria-hidden
          className={`inline-block h-2 w-2 rounded-circle ${settings.open ? 'bg-[#2E6B4A]' : 'bg-line-strong'}`}
        />
        {settings.open
          ? `Open for custom work · ${left} of ${settings.spotsPerMonth} spots left in ${month}`
          : 'Not open for custom work'}
      </p>
    </div>
  );

  if (searchParams.tab === 'settings')
    return (
      <div>
        {head}
        <Tabs active="settings" pending={pending} />
        <div className="mt-8">
          <CustomSettingsForm initial={settings} />
        </div>
      </div>
    );

  const selectedId =
    searchParams.id && rows.some((r) => r.id === searchParams.id) ? searchParams.id : rows[0]?.id;
  const detail = selectedId ? await getMakerRequest(seller, selectedId) : null;
  const budget = detail
    ? (BUDGET_BANDS.find((b) => b.label === detail.budget) ?? { min: null, max: null })
    : { min: null, max: null };

  return (
    <div>
      {head}
      <Tabs active="requests" pending={pending} />
      {rows.length === 0 ? (
        <div className="py-16 text-center text-[14px] text-muted" data-testid="no-requests">
          <p>No requests yet.</p>
          <p className="mt-2">
            {settings.open
              ? 'Requests come to you when a buyer picks you from their matches.'
              : 'Switch on custom work in your settings to appear in buyers’ matches.'}
          </p>
          {!settings.open && (
            <Link
              href="/studio/requests?tab=settings"
              className="mt-4 inline-block underline underline-offset-[3px]"
            >
              Custom work settings
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-8 md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)_360px]">
          <aside className={`${searchParams.id ? 'max-md:hidden' : ''}`} aria-label="Requests">
            <ul
              className="divide-y divide-line border-y border-line"
              role="list"
              data-testid="request-list"
            >
              {rows.map((r) => {
                const on = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <Link
                      href={`/studio/requests?id=${r.id}`}
                      aria-current={on ? 'page' : undefined}
                      data-testid={`request-${r.number}`}
                      className={`flex gap-3 p-3 ${on ? 'bg-surface md:border-l-2 md:border-ink' : 'hover:bg-surface'}`}
                    >
                      <RequestThumb src={r.thumb} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1 text-[13px]">
                        <span className="flex items-start justify-between gap-2">
                          <span className={`truncate ${r.viewed ? '' : 'font-medium'}`}>
                            {r.who}
                          </span>
                          <Badge r={r} />
                        </span>
                        <span className="text-[15px]">
                          {r.title[0]!.toUpperCase() + r.title.slice(1)}
                        </span>
                        <span className="text-[12px] text-muted">
                          {r.occasion}
                          {r.neededBy ? ` · by ${fmtDay(r.neededBy)}` : ''} · {r.budget}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-[13px] leading-relaxed text-muted">
              Requests come to you when a buyer picks you from their matches. Reply within 48 hours
              to keep your response badge.
            </p>
          </aside>

          {detail && (
            <>
              <section
                className={`${searchParams.id ? '' : 'max-md:hidden'} min-w-0`}
                aria-label="The brief"
              >
                <Link
                  href="/studio/requests"
                  className="mb-4 inline-block text-[11px] uppercase tracking-label md:hidden"
                >
                  ‹ All requests
                </Link>
                <RequestDetail r={detail} />
              </section>
              {/* Under the brief until there's room for a third column, then sticky on the right. */}
              <div
                className={`${searchParams.id ? '' : 'max-md:hidden'} md:col-start-2 lg:col-start-3 lg:row-start-1`}
              >
                <div className="lg:sticky lg:top-[76px]">
                  <QuotePanel
                    key={`${detail.id}:${detail.quote?.id ?? 'new'}:${detail.recipientStatus}`}
                    request={detail}
                    commissionPct={settings.commissionPct}
                    fittingsInPerson={settings.fittingsInPerson}
                    budget={budget}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
