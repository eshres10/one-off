import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { BRAND } from '@/lib/brand';
import { RETURNS, isCustomType } from '@/lib/content/returns';
import { canReportProblem } from '@/lib/domain/claims';
import { getReportableItem } from '@/lib/services/claims';
import { Img as Image } from '@/components/ui/Img';
import { ClaimForm } from '@/components/claims/ClaimForm';

export const metadata = { title: 'Report a problem' };

export default async function ReportProblemPage({
  params,
}: {
  params: { id: string; itemId: string };
}) {
  const user = await requireUser(`/account/orders/${params.id}/report/${params.itemId}`);
  if (!z.string().uuid().safeParse(params.itemId).success) notFound();
  const item = await getReportableItem(user, params.itemId);
  if (!item || item.orderId !== params.id) notFound();
  const open = canReportProblem(item.deliveredAt);
  return (
    <div className="max-w-2xl space-y-6">
      <Link href={`/account/orders/${item.orderId}`} className="text-sm text-muted hover:underline">
        ← Order {item.orderNumber}
      </Link>
      <div>
        <h1 className="text-[40px] leading-none md:text-[48px]">Report a problem</h1>
        <p className="mt-3 text-[14px] text-text2">{RETURNS.faultBody}</p>
      </div>
      <div className="flex items-center gap-4 border-y border-line py-4">
        <span className="relative aspect-4/5 w-16 shrink-0 overflow-hidden bg-stone-light">
          {item.imageUrl && (
            <Image src={item.imageUrl} alt="" fill sizes="64px" className="object-cover" />
          )}
        </span>
        <div className="text-[14px]">
          <p>{item.productTitle}</p>
          <p className="text-muted">
            {item.variantLabel} · from {item.makerName}
          </p>
        </div>
      </div>
      {open ? (
        <ClaimForm orderItemId={item.id} custom={isCustomType(item.productType)} />
      ) : (
        <div
          className="space-y-2 bg-stone-light px-4 py-4 text-[14px]"
          data-testid="contact-us-panel"
        >
          <p>
            {item.deliveredAt
              ? `It’s been more than ${RETURNS.reportWindowDays} days since this piece was delivered, so we’ll sort it out with you directly.`
              : 'This piece hasn’t been marked as delivered yet.'}
          </p>
          <p>
            Need help?{' '}
            <a
              className="link"
              href={`mailto:${BRAND.supportEmail}?subject=Order ${item.orderNumber}`}
            >
              Contact us
            </a>{' '}
            at {BRAND.supportEmail}. {RETURNS.aclNote}
          </p>
        </div>
      )}
    </div>
  );
}
