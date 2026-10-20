import { notFound } from 'next/navigation';
import { adminReplyAction } from '@/lib/actions/support';
import { adminThread } from '@/lib/services/support';
import { SupportComposer } from '@/components/support/SupportComposer';
import { SupportThread } from '@/components/support/SupportThread';

export default async function AdminSupportThreadPage({ params }: { params: { userId: string } }) {
  if (!/^[0-9a-f-]{36}$/.test(params.userId)) notFound();
  const t = await adminThread(params.userId);
  if (!t) notFound();
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-[40px] leading-none">{t.shop ?? t.email}</h1>
        <p className="mt-1 text-[13px] text-muted">{t.email}</p>
      </div>
      <SupportThread messages={t.messages} mine="admin" />
      <SupportComposer
        action={adminReplyAction}
        hidden={{ userId: params.userId }}
        placeholder="Reply as Off One"
        label="Send reply"
      />
    </div>
  );
}
