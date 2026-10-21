import { notFound } from 'next/navigation';
import { requireSeller } from '@/lib/auth/session';
import { getCustomSettings, getMakerRequest } from '@/lib/services/custom-studio';
import { RequestDetail } from '@/components/studio/requests/RequestDetail';
import { DesktopRedirect } from '@/components/app/DesktopRedirect';
import { RequestScreen } from '@/components/app/studio/RequestScreen';

export const metadata = { title: 'Request · Studio' };

export default async function StudioRequestPage({ params }: { params: { id: string } }) {
  const seller = await requireSeller();
  const [request, settings] = await Promise.all([
    getMakerRequest(seller, params.id),
    getCustomSettings(seller),
  ]);
  if (!request) notFound();
  return (
    <>
      <DesktopRedirect to={`/studio/requests?id=${request.id}`} />
      <div className="md:hidden">
        <RequestScreen
          request={request}
          commissionPct={settings.commissionPct}
          fittingsInPerson={settings.fittingsInPerson}
        >
          <RequestDetail r={request} />
        </RequestScreen>
      </div>
    </>
  );
}
