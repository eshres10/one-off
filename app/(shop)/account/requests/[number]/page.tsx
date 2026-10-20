import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { getBuyerRequest } from '@/lib/services/custom';
import { RequestView } from '@/components/custom/RequestView';
import { AutoRefresh } from '@/components/ui/AutoRefresh';

export const metadata = { title: 'Custom request' };

/** /account/requests/OO-C-1042: waiting, quotes, or in the making. */
export default async function RequestPage({
  params,
  searchParams,
}: {
  params: { number: string };
  searchParams: { paid?: string };
}) {
  const number = decodeURIComponent(params.number).toUpperCase();
  const user = await requireUser(`/account/requests/${number}`);
  if (!/^OO-C-\d{1,12}$/.test(number)) notFound();
  const request = await getBuyerRequest(user, number);
  if (!request) notFound();
  return (
    <div>
      {request.status !== 'accepted' && <AutoRefresh />}
      <Link
        href="/account/requests"
        className="hidden text-[12px] uppercase tracking-label text-muted hover:text-ink md:inline"
      >
        ‹ All requests
      </Link>
      <div className="mt-2 md:mt-4">
        <RequestView request={request} paid={searchParams.paid === '1'} />
      </div>
    </div>
  );
}
