import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getReturnPolicy, returnDeadline } from '@/lib/returns/policy';
import { blockerFor, getBuyerReturn, getReturnableItem } from '@/lib/services/returns';
import { SITE } from '@/lib/site/config';
import { ReturnFlow } from '@/components/returns/ReturnFlow';
import OrderPage from '../../page';

export const metadata = { title: 'Return this piece', robots: { index: false } };

const day = (d: Date) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Australia/Sydney',
  });

/** The return flow over the order page: a drawer on desktop, full screen on phone. */
export default async function ReturnPage({ params }: { params: { id: string; itemId: string } }) {
  const ref = decodeURIComponent(params.id);
  const user = await requireUser(`/account/orders/${ref}/return/${params.itemId}`);
  const item = await getReturnableItem(user, params.itemId);
  if (!item || (item.orderId !== ref && item.orderNumber.toUpperCase() !== ref.toUpperCase()))
    notFound();
  const backHref = `/account/orders/${item.orderNumber}`;
  const existing = item.returnId ? await getBuyerReturn(user, item.returnId) : null;
  const blocker = existing ? null : blockerFor(item);
  const policy = item.returnPolicy ?? getReturnPolicy(item.productType);
  const deadline = item.deliveredAt
    ? returnDeadline(new Date(item.deliveredAt), policy.windowDays ?? 0)
    : null;
  return (
    <>
      <div aria-hidden className="hidden md:block">
        <OrderPage params={{ id: item.orderNumber }} />
      </div>
      <ReturnFlow
        backHref={backHref}
        item={{
          id: item.id,
          productTitle: item.productTitle,
          variantLabel: item.variantLabel,
          imageUrl: item.imageUrl,
          makerName: item.makerName,
          returnBy: deadline ? day(deadline) : '',
          reportHref: `/account/orders/${item.orderNumber}/report/${item.id}`,
        }}
        settings={{
          condition: SITE.returns.condition,
          sendWithinDays: SITE.returns.sendWithinDays,
          makerConfirmDays: SITE.returns.makerConfirmDays,
        }}
        existing={
          existing && {
            id: existing.id,
            number: existing.number,
            status: existing.status,
            address: existing.returnAddress,
            carrier: existing.carrier,
            tracking: existing.tracking,
            sendBy: day(existing.sendBy),
          }
        }
        closed={
          blocker ? (
            <div className="space-y-4 text-[14px] leading-relaxed" data-testid="return-closed">
              <h2 tabIndex={-1} className="font-display text-[32px] leading-none outline-none">
                This piece can’t be returned
              </h2>
              <p>{blocker}</p>
              {!policy.changeOfMind && <p className="text-muted">{policy.summary}</p>}
              <p>
                Faulty or not as described?{' '}
                <Link
                  href={`/account/orders/${item.orderNumber}/report/${item.id}`}
                  className="underline underline-offset-[3px]"
                >
                  Report a problem
                </Link>{' '}
                and we’ll make it right.
              </p>
            </div>
          ) : undefined
        }
      />
    </>
  );
}
