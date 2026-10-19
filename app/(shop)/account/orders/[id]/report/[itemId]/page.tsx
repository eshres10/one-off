import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { BRAND } from '@/lib/brand';
import { RETURNS, isCustomType } from '@/lib/content/returns';
import { getReturnPolicy } from '@/lib/returns/policy';
import { canReportProblem } from '@/lib/domain/claims';
import { getReportableItem } from '@/lib/services/claims';
import { blockerFor, getReturnableItem } from '@/lib/services/returns';
import { ReportFlow } from '@/components/claims/ReportFlow';
import OrderPage from '../../page';

export const metadata = { title: 'Report a problem' };

/** The report flow over the order page: a drawer on desktop, full screen on phone. */
export default async function ReportProblemPage({
  params,
}: {
  params: { id: string; itemId: string };
}) {
  const ref = decodeURIComponent(params.id);
  const user = await requireUser(`/account/orders/${ref}/report/${params.itemId}`);
  if (!z.string().uuid().safeParse(params.itemId).success) notFound();
  const item = await getReportableItem(user, params.itemId);
  if (!item || (item.orderId !== ref && item.orderNumber.toUpperCase() !== ref.toUpperCase()))
    notFound();
  const open = canReportProblem(item.deliveredAt);
  const returnable = await getReturnableItem(user, item.id);
  const backHref = `/account/orders/${item.orderNumber}`;
  return (
    <>
      <div aria-hidden className="hidden md:block">
        <OrderPage params={{ id: item.orderNumber }} />
      </div>
      <ReportFlow
        backHref={backHref}
        item={{
          id: item.id,
          productTitle: item.productTitle,
          variantLabel: item.variantLabel,
          imageUrl: item.imageUrl,
          makerName: item.makerName,
          isMto: isCustomType(item.productType),
          returnSummary: getReturnPolicy(item.productType).summary,
          returnHref:
            returnable && !blockerFor(returnable)
              ? `/account/orders/${item.orderNumber}/return/${item.id}`
              : null,
        }}
        closed={
          open ? undefined : (
            <div className="space-y-3 text-[14px] leading-relaxed" data-testid="contact-us-panel">
              <h2 tabIndex={-1} className="font-display text-[32px] leading-none outline-none">
                Let’s sort it out together
              </h2>
              <p>
                {item.deliveredAt
                  ? `It’s been more than ${RETURNS.reportWindowDays} days since this piece was delivered, so we’ll sort it out with you directly.`
                  : 'You can report a problem once this piece has been delivered.'}
              </p>
              <p>
                Email{' '}
                <a
                  className="underline underline-offset-[3px]"
                  href={`mailto:${BRAND.supportEmail}?subject=Order ${item.orderNumber}`}
                >
                  {BRAND.supportEmail}
                </a>
                . {RETURNS.aclNote}
              </p>
            </div>
          )
        }
      />
    </>
  );
}
