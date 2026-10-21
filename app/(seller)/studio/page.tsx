import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { formatPrice } from '@/lib/domain/money';
import { getOverview, type NeedsRow, type Overview } from '@/lib/queries/overview';
import { getStudioShop } from '@/lib/queries/studio';
import { greeting, longDate, shipByLabel, daysUntil, shortDate } from '@/lib/studio/format';
import { TERMS } from '@/lib/studio/terms';
import { ShipSheetButton } from '@/components/studio/overview/ShipSheetButton';
import { WeeklyBars } from '@/components/studio/overview/WeeklyBars';
import { StockStepper } from '@/components/studio/StockStepper';
import { CheckIcon, PlusIcon } from '@/components/ui/icons';
import { Img as Image } from '@/components/ui/Img';
import { Monogram } from '@/components/ui/Monogram';
import { Today } from '@/components/app/studio/Today';
import { photoNudge, todayStats } from '@/lib/queries/studio-phone';

export const metadata = { title: 'Studio' };

const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
const monthName = (offset = 0) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + offset, 15);
  return d.toLocaleDateString('en-AU', { month: 'long', timeZone: 'Australia/Melbourne' });
};

function FoundingPanel({ o, shopName }: { o: Overview; shopName: string }) {
  // Only shops that hold a founding spot see the founding panel (and "0% until…").
  const founding =
    o.foundingNumber !== null &&
    (!o.foundingUntil || new Date(o.foundingUntil).getTime() > Date.now());
  const saved = Math.round(
    (o.kpi.salesThisMonth * TERMS.standardCommissionPct) / 100 - o.kpi.commissionThisMonth,
  );
  return (
    <section
      className="glass-dark relative overflow-hidden p-6 text-ground md:p-8"
      aria-label={founding ? 'Founding maker' : 'This month'}
      data-testid={founding ? 'founding-panel' : 'month-panel'}
    >
      <Monogram className="pointer-events-none absolute -right-10 -top-6 h-[220px] w-[220px] text-ground opacity-[0.07] md:h-[280px] md:w-[280px]" />
      {founding ? (
        <>
          <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">
            Founding maker · Nº {String(o.foundingNumber ?? 0).padStart(2, '0')} of{' '}
            {TERMS.foundingSpotsTotal}
          </p>
          <p className="mt-3 max-w-[16ch] font-display text-[34px] leading-[1.02] md:text-[44px]">
            {o.foundingUntil
              ? `${TERMS.foundingCommissionPct}% commission until ${shortDate(o.foundingUntil)}.`
              : `${TERMS.foundingCommissionPct}% commission for ${TERMS.foundingMonths} months.`}
          </p>
          <p className="mt-3 max-w-[46ch] text-[13px] text-ground/75">
            {o.foundingUntil
              ? `You keep everything except card processing until then, then it’s ${TERMS.standardCommissionPct}% of each piece (never shipping).`
              : 'It starts the day your shop goes live.'}
            {saved > 0 ? ` You’ve kept ${formatPrice(saved)} this month.` : ''}
          </p>
        </>
      ) : (
        <>
          <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">
            This month · {shopName}
          </p>
          <p className="mt-3 font-display text-[44px] leading-none">
            {formatPrice(o.kpi.salesThisMonth)}
          </p>
          <p className="mt-3 text-[13px] text-ground/75">
            {o.kpi.ordersThisMonth} {o.kpi.ordersThisMonth === 1 ? 'order' : 'orders'} ·{' '}
            {formatPrice(o.kpi.commissionThisMonth)} commission
          </p>
        </>
      )}
    </section>
  );
}

function Checklist({ items }: { items: Overview['checklist'] }) {
  const left = items.filter((i) => !i.done).length;
  if (!left) return null;
  return (
    <section
      className="border border-line bg-surface p-5"
      aria-labelledby="setup-title"
      data-testid="setup-checklist"
      data-tour="setup-checklist"
    >
      <h2 id="setup-title" className="font-display text-[26px] leading-none">
        Shop setup
      </h2>
      <p className="mt-1 text-[12px] text-muted">
        {items.length - left} of {items.length} done
      </p>
      <ul className="mt-4 space-y-1" role="list">
        {items.map((i) => (
          <li key={i.key}>
            <Link
              href={i.href}
              className={`flex min-h-[44px] items-center gap-3 text-[13px] ${i.done ? 'text-muted-2 line-through' : 'hover:underline'}`}
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-circle border ${i.done ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
              >
                {i.done && <CheckIcon width={12} height={12} />}
              </span>
              {i.label}
              <span className="sr-only">{i.done ? ' (done)' : ' (to do)'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  alert = false,
  testId,
}: {
  label: string;
  value: string;
  sub?: string;
  alert?: boolean;
  testId?: string;
}) {
  return (
    <div className="border border-line bg-surface p-4" data-testid={testId}>
      <p className="text-[11px] uppercase tracking-label text-muted-2">{label}</p>
      <p className="mt-2 font-display text-[34px] tabular-nums leading-none">{value}</p>
      {sub && <p className={`mt-2 text-[12px] ${alert ? 'text-alert' : 'text-muted'}`}>{sub}</p>}
    </div>
  );
}

function NeedsList({ rows, testId }: { rows: NeedsRow[]; testId: string }) {
  if (!rows.length)
    return <p className="py-6 text-[13px] text-muted">All caught up. Nothing needs you today.</p>;
  return (
    <ul className="divide-y divide-line border-y border-line" role="list" data-testid={testId}>
      {rows.map((r) => (
        <li key={r.id}>
          <Link
            href={r.href}
            className="flex min-h-[64px] items-center gap-3 py-3 hover:bg-stone/50"
            data-testid="needs-row"
          >
            <span className="relative aspect-4/5 w-11 shrink-0 overflow-hidden bg-stone">
              {r.imageUrl && (
                <Image
                  src={r.imageUrl}
                  alt=""
                  fill
                  sizes="44px"
                  className="object-cover object-top"
                />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{r.title}</span>
              <span className="block truncate text-[12px] text-muted-2">{r.sub}</span>
            </span>
            <span
              className={`shrink-0 rounded-circle border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.12em] ${r.urgent ? 'border-alert text-alert' : 'border-line-strong text-muted'}`}
            >
              {r.tag}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function StudioOverview() {
  const seller = await requireSeller();
  const [o, shop, stats, nudge] = await Promise.all([
    getOverview(seller),
    getStudioShop(seller.makerId),
    todayStats(seller.makerId),
    photoNudge(seller.makerId),
  ]);
  // Greeting and date in the maker's own time zone.
  const g = greeting(new Date(), shop.timezone);
  const change = pct(o.kpi.salesThisMonth, o.kpi.salesLastMonth);
  const shipNow = o.needs.filter((n) => n.kind === 'ship');
  const waiting = o.needs.filter((n) => n.kind !== 'ship');
  const firstWord = shop.displayName.split(/\s+/)[0];

  return (
    <>
      <div className="md:hidden">
        <Today
          shopName={shop.displayName}
          o={o}
          stats={stats}
          nudge={nudge}
          firstName={firstWord ?? ''}
        />
      </div>
      <div className="max-md:hidden">
        <div>
          <header className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-label text-muted-2">
                {longDate(new Date(), shop.timezone)}
              </p>
              <h1 className="mt-2 text-[40px] leading-none md:text-[56px]">
                <span className="md:hidden">
                  {g.short}, {firstWord}
                </span>
                <span className="hidden md:inline">
                  {g.long}, {shop.displayName}
                </span>
              </h1>
            </div>
            <Link
              href="/studio/listings/new"
              className="glass-dark hidden min-h-[48px] shrink-0 items-center gap-2 px-5 text-[11px] uppercase tracking-[0.18em] text-ground md:flex"
              data-tour="add-piece"
            >
              <PlusIcon width={14} height={14} /> Add a piece
            </Link>
          </header>

          {/* Desktop */}
          <div className="mt-8 hidden gap-8 md:grid md:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-8">
              <div className="grid grid-cols-5 gap-3" data-testid="kpis">
                <Kpi
                  label="Sales"
                  value={formatPrice(o.kpi.salesThisMonth)}
                  sub={
                    change === null
                      ? monthName()
                      : `${change >= 0 ? '↑' : '↓'} ${Math.abs(change)}% on ${monthName(-1).slice(0, 3)}`
                  }
                />
                <Kpi label="Orders" value={String(o.kpi.ordersThisMonth)} sub={monthName()} />
                <Kpi
                  label="To ship"
                  value={String(o.kpi.toShip)}
                  sub={
                    o.kpi.oldestDueToday
                      ? 'Oldest due today'
                      : o.kpi.toShip
                        ? 'On track'
                        : 'All sent'
                  }
                  alert={o.kpi.oldestDueToday}
                  testId="kpi-to-ship"
                />
                <Kpi
                  label="Shop views"
                  value={o.kpi.viewsThisMonth.toLocaleString('en-AU')}
                  sub={monthName()}
                />
                <Kpi
                  label="Saves"
                  value={o.kpi.savesThisMonth.toLocaleString('en-AU')}
                  sub={monthName()}
                />
              </div>
              <section aria-labelledby="needs-title" data-tour="needs-today">
                <h2 id="needs-title" className="mb-3 text-[32px] leading-none">
                  Needs you today
                </h2>
                <NeedsList rows={o.needs} testId="needs-today" />
              </section>
              <section className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-8">
                <WeeklyBars weeks={o.weekly} />
                <div>
                  <h2 className="font-sans text-[11px] font-normal uppercase tracking-label text-muted-2">
                    Top pieces
                  </h2>
                  <ul className="mt-4 space-y-3" role="list">
                    {o.topPieces.map((p) => (
                      <li key={p.id} className="flex items-center gap-3">
                        <span className="relative aspect-4/5 w-9 shrink-0 overflow-hidden bg-stone">
                          {p.imageUrl && (
                            <Image
                              src={p.imageUrl}
                              alt=""
                              fill
                              sizes="36px"
                              className="object-cover object-top"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px]">{p.title}</span>
                        <span className="shrink-0 text-[12px] tabular-nums text-muted">
                          {p.sold} sold · {p.saves} {p.saves === 1 ? 'save' : 'saves'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>
            </div>
            <aside className="space-y-6">
              <FoundingPanel o={o} shopName={shop.displayName} />
              <Checklist items={o.checklist} />
            </aside>
          </div>

          {/* Phone */}
          <div className="mt-6 space-y-6 md:hidden">
            <Link
              href="/studio/payouts"
              className="glass-dark relative block overflow-hidden p-5 text-ground"
              data-testid="payout-card"
            >
              <Monogram className="pointer-events-none absolute -right-8 -top-4 h-[150px] w-[150px] text-ground opacity-[0.07]" />
              <p className="text-[10px] uppercase tracking-[0.2em] text-ground/70">
                Next payout ·{' '}
                {new Date(`${o.payout.nextDate}T00:00:00Z`).toLocaleDateString('en-AU', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                })}
              </p>
              <p className="mt-2 font-display text-[40px] leading-none">
                {formatPrice(o.payout.nextAmount)}
              </p>
              <p className="mt-2 text-[12px] text-ground/70">
                {formatPrice(o.payout.onTheWay)} on the way
                {o.payout.bank ? ` · ${o.payout.bank}` : ''}
              </p>
            </Link>
            <div className="grid grid-cols-3 border-y border-line py-3 text-center">
              {[
                [monthName(), formatPrice(o.kpi.salesThisMonth)],
                ['Views', o.kpi.viewsThisMonth.toLocaleString('en-AU')],
                ['Saves', o.kpi.savesThisMonth.toLocaleString('en-AU')],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="font-display text-[26px] tabular-nums leading-none">{v}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-label text-muted-2">{l}</p>
                </div>
              ))}
            </div>
            <Checklist items={o.checklist} />
            <section aria-labelledby="ship-title">
              <h2 id="ship-title" className="text-[28px] leading-none">
                To ship ({o.toShipList.length})
              </h2>
              {o.toShipList.length === 0 ? (
                <p className="py-4 text-[13px] text-muted">Nothing to ship right now.</p>
              ) : (
                <ul
                  className="mt-3 divide-y divide-line border-y border-line"
                  role="list"
                  data-testid="phone-to-ship"
                >
                  {o.toShipList.map((s) => {
                    const d = daysUntil(s.shipBy);
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-3">
                        <span className="relative aspect-4/5 w-11 shrink-0 overflow-hidden bg-stone">
                          {s.imageUrl && (
                            <Image
                              src={s.imageUrl}
                              alt=""
                              fill
                              sizes="44px"
                              className="object-cover object-top"
                            />
                          )}
                        </span>
                        <Link href={`/studio/orders?order=${s.id}`} className="min-w-0 flex-1">
                          <span className="block truncate text-[13px]">{s.title}</span>
                          <span className="block text-[12px] text-muted-2">
                            {s.buyerName ?? 'Guest'} ·{' '}
                            <span className={d !== null && d <= 0 ? 'text-alert' : ''}>
                              Ship by {shipByLabel(s.shipBy).toLowerCase()}
                            </span>
                          </span>
                        </Link>
                        <ShipSheetButton
                          fulfilmentId={s.id}
                          title={`${s.title} · ${s.variantLabel.replace(/^AU /, 'Size ')}`}
                          sub={`#${s.orderNumber.replace(/^OO-/, '')} for ${s.buyerName ?? 'a guest'}`}
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="waiting-title">
              <h2 id="waiting-title" className="text-[28px] leading-none">
                Waiting on you
              </h2>
              <div className="mt-3">
                <NeedsList
                  rows={waiting.length ? waiting : shipNow.filter((r) => r.tag === 'Making')}
                  testId="waiting-on-you"
                />
              </div>
            </section>
            {o.lowStock.length > 0 && (
              <section aria-labelledby="low-title">
                <h2 id="low-title" className="text-[28px] leading-none">
                  Low stock
                </h2>
                <ul
                  className="mt-3 divide-y divide-line border-y border-line"
                  role="list"
                  data-testid="low-stock"
                >
                  {o.lowStock.map((v) => (
                    <li key={v.variantId} className="flex items-center gap-3 py-2">
                      <span className="relative aspect-4/5 w-9 shrink-0 overflow-hidden bg-stone">
                        {v.imageUrl && (
                          <Image
                            src={v.imageUrl}
                            alt=""
                            fill
                            sizes="36px"
                            className="object-cover object-top"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-[13px]">
                        <span className="block truncate">{v.title}</span>
                        <span className="text-[12px] text-muted-2">Size {v.size}</span>
                      </span>
                      <StockStepper
                        variantId={v.variantId}
                        stock={v.stock}
                        label={`${v.title} size ${v.size}`}
                        compact
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <FoundingPanel o={o} shopName={shop.displayName} />
          </div>
        </div>
      </div>
    </>
  );
}
