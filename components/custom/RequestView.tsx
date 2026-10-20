import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { askMakerAction } from '@/lib/actions/custom';
import { formatPrice } from '@/lib/domain/money';
import { CUSTOM } from '@/lib/custom/config';
import { fmtDay, fmtDayLong, kindLabel } from '@/lib/custom/brief';
import type { BuyerRequestView, RecipientView } from '@/lib/services/custom';
import { Timeline } from './HaveItMade';

const hoursLeft = (replyBy: Date | null, now = new Date()) =>
  replyBy ? Math.max(0, Math.ceil((new Date(replyBy).getTime() - now.getTime()) / 3_600_000)) : 0;

function Avatar({ src }: { src: string | null }) {
  return (
    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-circle bg-[#D2CBC1]">
      {src && (
        <Image src={src} alt="" fill sizes="36px" className="object-cover object-[center_15%]" />
      )}
    </span>
  );
}

/** One maker's quote, side by side on desktop and stacked on a phone. */
function QuoteCard({
  r,
  request,
  canAccept,
}: {
  r: RecipientView;
  request: BuyerRequestView;
  canAccept: boolean;
}) {
  const q = r.quote!;
  const accepted = q.status === 'accepted';
  return (
    <article
      className={`flex flex-col border bg-surface ${accepted ? 'border-ink' : 'border-line-strong'}`}
      data-testid={`quote-${r.slug}`}
    >
      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-3">
        <Avatar src={r.avatarUrl} />
        <span className="flex min-w-0 flex-col">
          <span className="text-[14px] font-medium">{r.name}</span>
          <span className="text-[11px] text-muted-2">
            {[r.suburb, r.state].filter(Boolean).join(', ')}
          </span>
        </span>
        <span className="ml-auto font-display text-[28px] leading-none" data-testid="quote-price">
          {formatPrice(q.price)}
        </span>
      </div>
      <div className="flex flex-col gap-2 px-3.5 py-3">
        {q.editedAt && !accepted && (
          <span
            className="text-[10px] uppercase tracking-[0.18em] text-muted-2"
            data-testid="quote-updated"
          >
            Updated {fmtDay(q.editedAt)}
          </span>
        )}
        <dl className="grid grid-cols-[92px_1fr] gap-x-2 gap-y-1 text-[12px]">
          <dt className="text-muted-2">Ready by</dt>
          <dd>{fmtDayLong(q.readyBy)}</dd>
          <dt className="text-muted-2">Fittings</dt>
          <dd>{q.fittingsLabel}</dd>
          <dt className="text-muted-2">Fabric</dt>
          <dd>{q.fabric ?? 'Maker’s choice'}</dd>
        </dl>
        <p className="font-display text-[18px] leading-[1.2]">“{q.note}”</p>
        {q.sketchPath && (
          <a
            href={q.sketchPath}
            target="_blank"
            rel="noreferrer"
            className="relative block aspect-4/5 w-24 overflow-hidden bg-[#D2CBC1]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.sketchPath}
              alt={`${r.name}’s sketch`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </a>
        )}
        {accepted ? (
          <p className="text-[12px] uppercase tracking-[0.18em]">Accepted</p>
        ) : q.status === 'withdrawn' ? (
          <p className="text-[12px] text-muted-2">You chose another maker.</p>
        ) : q.status === 'expired' ? (
          <p className="text-[12px] text-muted-2">
            This quote has expired. Message them for a new one.
          </p>
        ) : (
          <div className="flex gap-1.5">
            {canAccept && (
              <Link
                href={`/account/requests/${request.number}/accept/${q.id}`}
                className="glass-dark flex min-h-[44px] flex-1 items-center justify-center text-[10px] uppercase tracking-[0.18em] text-ground"
                data-testid="quote-accept"
              >
                Accept · {formatPrice(q.price)}
              </Link>
            )}
            <form action={askMakerAction}>
              <input type="hidden" name="requestId" value={request.id} />
              <input type="hidden" name="makerId" value={r.makerId} />
              <input type="hidden" name="returnTo" value={`/account/requests/${request.number}`} />
              <button
                className="flex min-h-[44px] items-center border border-ink px-3.5 text-[10px] uppercase tracking-[0.18em]"
                data-testid="quote-ask"
              >
                Ask
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}

/** The request page: sent (waiting), quotes to compare, or accepted and in the making. */
export function RequestView({ request, paid }: { request: BuyerRequestView; paid: boolean }) {
  const quotes = request.recipients.filter((r) => r.quote && r.quote.status !== 'withdrawn');
  const waiting = request.recipients.filter((r) => r.status === 'pending');
  const passed = request.recipients.filter((r) => r.status === 'passed' || r.status === 'expired');
  const replied = request.recipients.filter((r) => r.status !== 'pending').length;
  const accepted = request.status === 'accepted';
  const chosen = request.recipients.find((r) => r.status === 'chosen');
  const canAccept = !accepted && request.status !== 'cancelled';

  if (accepted && paid)
    return (
      <div
        className="step-in flex max-w-[640px] flex-col items-center gap-3.5 pt-6 text-center"
        data-testid="in-the-making"
      >
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">It’s happening</span>
        <h1 className="font-display text-[44px] leading-[1.02] md:text-[52px]">
          Your{' '}
          {kindLabel(request.kind).toLowerCase() === 'something else'
            ? 'piece'
            : kindLabel(request.kind).toLowerCase()}{' '}
          is <em>in the making.</em>
        </h1>
        <p className="text-[13px] text-muted">
          {chosen?.name ?? 'Your maker'} will share a sketch within 3 days. Follow every step from
          your account.
        </p>
        {request.order && (
          <Link
            href={`/account/orders/${request.order.orderNumber}`}
            className="flex min-h-[48px] w-full items-center justify-center border border-ink text-[10px] uppercase tracking-[0.18em]"
            data-testid="see-order"
          >
            See my order
          </Link>
        )}
      </div>
    );

  return (
    <div className="flex max-w-[760px] flex-col gap-3.5" data-testid="request-view">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
        {request.number} · {request.title}
        {request.status === 'help_requested'
          ? ' · with the Off One team'
          : accepted
            ? ` · ${chosen?.name ?? 'accepted'}`
            : ` · ${replied} of ${request.recipients.length} replied`}
      </span>
      <h1 className="font-display text-[44px] leading-[1.02] md:text-[52px]">
        {accepted ? (
          <>
            In <em>the making.</em>
          </>
        ) : quotes.length ? (
          <>
            Your <em>quotes.</em>
          </>
        ) : (
          <>
            Your brief is <em>on its way.</em>
          </>
        )}
      </h1>
      {accepted && request.order && (
        <Link
          href={`/account/orders/${request.order.orderNumber}`}
          className="inline-flex min-h-[48px] items-center justify-center self-start border border-ink px-5 text-[10px] uppercase tracking-[0.18em]"
          data-testid="see-order"
        >
          See my order
        </Link>
      )}
      {quotes.length > 0 && (
        <div className="grid gap-2.5 md:grid-cols-2" data-testid="quotes">
          {quotes.map((r) => (
            <QuoteCard key={r.makerId} r={r} request={request} canAccept={canAccept} />
          ))}
        </div>
      )}
      {!accepted &&
        waiting.map((r) => (
          <div
            key={r.makerId}
            className="border border-dashed border-line-strong px-3.5 py-3 text-[12px] text-muted-2"
            data-testid="quote-waiting"
          >
            {r.name} hasn’t replied yet · {hoursLeft(r.replyBy)} hours left
          </div>
        ))}
      {!accepted &&
        passed.map((r) => (
          <div
            key={r.makerId}
            className="border border-dashed border-line-strong px-3.5 py-3 text-[12px] text-muted-2"
            data-testid="quote-passed"
          >
            {r.name} · Not available this time
          </div>
        ))}
      {!accepted && quotes.length === 0 && request.status !== 'help_requested' && (
        <>
          <p className="-mt-1.5 text-[13px] text-muted">
            {request.anonymous ? 'You’re anonymous until you accept a quote. ' : ''}
            Makers reply within {CUSTOM.replyHours} hours. We’ll email you as each quote comes in.
          </p>
          <Timeline />
        </>
      )}
      {request.status === 'help_requested' && (
        <p className="text-[13px] text-muted">
          The Off One team has your brief and will reply within 1 business day.
        </p>
      )}
      {!accepted && request.status !== 'help_requested' && (
        <p className="text-[12px] text-muted-2">
          Not quite right?{' '}
          <Link href={`/have-it-made`} className="underline underline-offset-[3px]">
            Start a new brief
          </Link>
          .
        </p>
      )}
      {request.words && (
        <details className="mt-4 border-t border-line pt-4 text-[13px]">
          <summary className="cursor-pointer text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Your brief
          </summary>
          <p className="mt-3 font-display text-[20px] leading-[1.2]">“{request.words}”</p>
          <dl className="mt-3 grid grid-cols-[80px_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
            <dt className="text-muted-2">Needed by</dt>
            <dd>{request.neededBy ? fmtDayLong(request.neededBy) : 'Flexible'}</dd>
            <dt className="text-muted-2">Budget</dt>
            <dd>
              A${request.budgetMin}
              {request.budgetMax ? `–${request.budgetMax}` : '+'}
            </dd>
            <dt className="text-muted-2">Fabric</dt>
            <dd>{request.fabrics.join(', ') || 'Maker suggests'}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}
