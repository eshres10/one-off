import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { sql } from '@/lib/db';
import { env } from '@/lib/env';
import { checkoutEnabled } from '@/lib/features';
import { getBuyerRequest } from '@/lib/services/custom';
import { defaultAddress } from '@/lib/services/custom-orders';
import { TERMS } from '@/lib/studio/terms';
import { AcceptQuote } from '@/components/custom/AcceptQuote';

export const metadata = { title: 'Accept and pay' };

export default async function AcceptPage({
  params,
}: {
  params: { number: string; quoteId: string };
}) {
  const number = decodeURIComponent(params.number).toUpperCase();
  const user = await requireUser(`/account/requests/${number}/accept/${params.quoteId}`);
  if (!/^OO-C-\d{1,12}$/.test(number) || !/^[0-9a-f-]{36}$/i.test(params.quoteId)) notFound();
  const request = await getBuyerRequest(user, number);
  if (!request) notFound();
  const r = request.recipients.find((x) => x.quote?.id === params.quoteId);
  if (!r?.quote) notFound();
  if (request.status === 'accepted') redirect(`/account/requests/${number}`);
  if (!(await checkoutEnabled())) redirect(`/account/requests/${number}`);
  const [[maker], address] = await Promise.all([
    sql()<
      { shippingStandardCents: number }[]
    >`select shipping_standard_cents from public.makers where id = ${r.makerId}`,
    defaultAddress(user),
  ]);
  const e = env();
  return (
    <div>
      <Link
        href={`/account/requests/${number}`}
        className="hidden text-[12px] uppercase tracking-label text-muted hover:text-ink md:inline"
      >
        ‹ Your quotes
      </Link>
      <div className="mt-2 md:mt-4">
        <AcceptQuote
          requestNumber={number}
          quoteId={r.quote.id}
          makerName={r.name}
          piece={request.title}
          priceCents={r.quote.price}
          shippingCents={maker?.shippingStandardCents ?? 0}
          address={address}
          releaseDays={TERMS.releaseDaysAfterDelivery}
          payments={{
            driver: e.PAYMENTS_DRIVER,
            publishableKey: e.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
          }}
        />
      </div>
    </div>
  );
}
