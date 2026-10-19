import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import type { BuyerFulfilment, BuyerOrderItem } from '@/lib/queries/account';
import { formatPrice } from '@/lib/domain/money';
import { CLAIM_STATUS_LABEL, canReportProblem } from '@/lib/domain/claims';
import { isDelivered } from '@/lib/domain/types';
import { carrierLabel, trackingUrl } from '@/lib/studio/carriers';
import {
  STAGE_DOT,
  STAGE_LABEL,
  humanNote,
  progressSteps,
  stageOf,
  type ShipmentFacts,
} from '@/lib/account/progress';
import { confirmReceivedAction } from '@/lib/actions/studio-orders';
import { openOrderThreadAction } from '@/lib/actions/messages';
import { ReviewForm } from './ReviewForm';
import { policySnapshot, returnBlocker, returnDeadline } from '@/lib/returns/policy';
import { RETURN_STATUS_LABEL } from '@/lib/returns/status';

export function StatusDot({
  stage,
  label = true,
}: {
  stage: ReturnType<typeof stageOf>;
  label?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 text-[12px]"
      data-testid="status-dot"
      data-stage={stage}
    >
      <span
        aria-hidden
        className="inline-block h-2 w-2 shrink-0 rounded-circle"
        style={{ background: STAGE_DOT[stage] }}
      />
      {label && <span>{STAGE_LABEL[stage]}</span>}
    </span>
  );
}

export function factsOf(f: BuyerFulfilment, orderedAt: Date): ShipmentFacts {
  return {
    status: f.status,
    isMto: f.isMto,
    makerName: f.makerName,
    orderedAt,
    shippedAt: f.shippedAt,
    deliveredAt: f.deliveredAt,
    estDispatch: f.estimatedDispatchDate,
    estFrom: f.estimatedDeliveryFrom,
    estTo: f.estimatedDeliveryTo,
    carrier: f.carrier ? carrierLabel(f.carrier) : null,
    leadDays: f.leadDays,
  };
}

/** Ordered → Being made / Packed → On its way → Delivered. Across on desktop, down on phone. */
function ProgressLine({ facts }: { facts: ShipmentFacts }) {
  const steps = progressSteps(facts);
  return (
    <ol
      className="relative grid gap-0 md:grid-cols-4"
      aria-label="Progress"
      data-testid="parcel-progress"
    >
      {steps.map((s, i) => (
        <li
          key={s.key}
          aria-current={s.current ? 'step' : undefined}
          className="relative flex gap-3 pb-5 last:pb-0 md:block md:pb-0 md:pr-3"
        >
          {/* The line: down the left on phone, along the top on desktop. */}
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={`absolute left-[5px] top-3 h-full w-px md:left-3 md:top-[5px] md:h-px md:w-full ${s.done ? 'bg-ink' : 'bg-line'}`}
            />
          )}
          <span
            aria-hidden
            className={`relative z-[1] mt-1 block h-[11px] w-[11px] shrink-0 rounded-circle border md:mt-0 ${s.done ? 'border-ink bg-ink' : s.current ? 'border-ink bg-ground ring-4 ring-[#C9A88A]/30' : 'border-line-strong bg-ground'}`}
          />
          <span className="block md:mt-3">
            <span
              className={`block text-[13px] ${s.done || s.current ? 'text-ink' : 'text-muted'}`}
            >
              {s.label}
            </span>
            {s.detail && (
              <span className="block text-[12px] text-muted" data-testid={`step-${s.key}`}>
                {s.detail}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

const shortDate = (d: Date) =>
  d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'Australia/Sydney' });

/**
 * Change of mind: "Return this piece" on a ready-to-ship piece inside its window, the return's
 * status once one's started, or "Not returnable for change of mind" on made-to-order and
 * one-of-one pieces.
 */
function ReturnRow({ item, orderNumber }: { item: BuyerOrderItem; orderNumber: string }) {
  const href = `/account/orders/${orderNumber}/return/${item.id}`;
  const live =
    item.returnId && item.returnStatus && !['cancelled', 'rejected'].includes(item.returnStatus);
  if (live)
    return (
      <Link
        href={href}
        className="mt-3 inline-block text-[13px] underline underline-offset-[3px]"
        data-testid="return-status"
      >
        Return {item.returnNumber} · {RETURN_STATUS_LABEL[item.returnStatus!]}
      </Link>
    );
  const policy = item.returnPolicy ?? policySnapshot(item.productType);
  const deliveredAt = item.deliveredAt ? new Date(item.deliveredAt) : null;
  const blocker = returnBlocker({
    returnPolicy: policy,
    productType: item.productType,
    deliveredAt,
    hasReturn: false,
    hasOpenCase:
      !!item.claimStatus && ['open', 'seller_responded', 'escalated'].includes(item.claimStatus),
    refunded: item.refundedCents >= item.lineTotalCents,
  });
  if (!blocker && deliveredAt)
    return (
      <div className="mt-3" data-testid="return-offer">
        <Link
          href={href}
          className="inline-flex min-h-[44px] items-center border border-ink px-5 text-[11px] uppercase tracking-[0.18em] hover:bg-ink hover:text-ground"
          data-testid="return-piece"
        >
          Return this piece
        </Link>
        <p className="mt-1.5 text-[12px] text-muted">
          Ready to ship · return by {shortDate(returnDeadline(deliveredAt, policy.windowDays ?? 0))}
        </p>
      </div>
    );
  if (!policy.changeOfMind && isDelivered(item.fulfilmentStatus))
    return (
      <p className="mt-2 text-[12px] text-muted" data-testid="not-returnable">
        Not returnable for change of mind
      </p>
    );
  return null;
}

function ItemActions({ item, orderNumber }: { item: BuyerOrderItem; orderNumber: string }) {
  const delivered = isDelivered(item.fulfilmentStatus);
  return (
    <>
      <ReturnRow item={item} orderNumber={orderNumber} />
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px]">
        {item.claimId && item.claimStatus ? (
          <Link
            href={`/account/claims/${item.claimId}`}
            className="underline underline-offset-[3px]"
            data-testid="item-claim-link"
          >
            Problem reported · {CLAIM_STATUS_LABEL[item.claimStatus]}
          </Link>
        ) : canReportProblem(item.deliveredAt ? new Date(item.deliveredAt) : null) ? (
          <Link
            href={`/account/orders/${orderNumber}/report/${item.id}`}
            className="underline underline-offset-[3px]"
            data-testid="report-problem"
          >
            Report a problem
          </Link>
        ) : delivered ? (
          <Link
            href="/help/contact"
            className="text-muted underline underline-offset-[3px]"
            data-testid="contact-us"
          >
            Need help? Contact us
          </Link>
        ) : null}
        {delivered &&
          (item.reviewed ? (
            <span className="text-muted">Reviewed, thank you</span>
          ) : (
            <ReviewForm orderItemId={item.id} productTitle={item.productTitle} />
          ))}
      </div>
    </>
  );
}

/** One shipment on the order page: pieces, progress, the human note and what you can do. */
export function Parcel({
  f,
  orderNumber,
  orderedAt,
}: {
  f: BuyerFulfilment;
  orderNumber: string;
  orderedAt: Date;
}) {
  const facts = factsOf(f, orderedAt);
  const stage = stageOf(f.status, f.isMto);
  const link = trackingUrl(f.carrier, f.trackingNumber);
  return (
    <section
      className="border-t border-line py-8"
      aria-label={`From ${f.makerName}`}
      data-testid="parcel"
    >
      <ul className="space-y-5" role="list">
        {f.items.map((i) => (
          <li key={i.id} className="flex gap-4" data-testid="parcel-item">
            <span className="relative aspect-4/5 w-[72px] shrink-0 overflow-hidden bg-stone-light md:w-[88px]">
              {i.imageUrl && (
                <Image
                  src={i.imageUrl}
                  alt={i.productTitle}
                  fill
                  sizes="88px"
                  className="object-cover"
                />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                {i.productSlug ? (
                  <Link href={`/products/${i.productSlug}`} className="text-[15px] hover:underline">
                    {i.productTitle}
                  </Link>
                ) : (
                  <p className="text-[15px]">{i.productTitle}</p>
                )}
                <span className="text-[14px]">{formatPrice(i.lineTotalCents)}</span>
              </div>
              <p className="text-[13px] text-muted">
                {i.variantLabel.replace(/^AU /, 'Size ')}
                {i.quantity > 1 ? ` · × ${i.quantity}` : ''}
                {i.fulfilmentStatus === 'refunded' ? ' · Refunded' : ''}
              </p>
              <p className="text-[13px] text-muted">
                From{' '}
                <Link href={`/makers/${f.makerSlug}`} className="hover:underline">
                  {f.makerName}
                </Link>
                {f.makerPlace ? `, ${f.makerPlace}` : ''}
              </p>
              <ItemActions item={i} orderNumber={orderNumber} />
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-7 flex items-center justify-between gap-3">
        <StatusDot stage={stage} />
        <span className="text-[12px] text-muted">
          {f.speed === 'express' ? 'Express' : 'Standard'} delivery
        </span>
      </div>
      <div className="mt-4">
        <ProgressLine facts={facts} />
      </div>

      <p className="mt-6 bg-stone px-4 py-3 text-[14px] leading-relaxed" data-testid="parcel-note">
        {humanNote(facts)}
      </p>

      <div className="mt-5 flex flex-wrap items-start gap-3">
        {f.trackingNumber && (
          <div>
            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="glass-dark inline-flex min-h-[44px] items-center px-5 text-[11px] uppercase tracking-label text-ground"
                data-testid="track-parcel"
              >
                Track parcel
              </a>
            ) : (
              <span className="glass-dark inline-flex min-h-[44px] items-center px-5 text-[11px] uppercase tracking-label text-ground">
                Track parcel
              </span>
            )}
            <p className="mt-1 text-[12px] text-muted">
              {carrierLabel(f.carrier)} · {f.trackingNumber}
            </p>
          </div>
        )}
        <form action={openOrderThreadAction}>
          <input type="hidden" name="fulfilmentId" value={f.id} />
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center border border-ink px-5 text-[11px] uppercase tracking-label hover:bg-ink hover:text-ground"
            data-testid="message-maker"
          >
            Message {f.makerName}
          </button>
        </form>
        {f.status === 'shipped' && (
          <form action={confirmReceivedAction}>
            <input type="hidden" name="fulfilmentId" value={f.id} />
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center px-2 text-[12px] underline underline-offset-[3px]"
              data-testid="received-it"
            >
              I’ve received it
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
