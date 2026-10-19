import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getMeasurements } from '@/lib/queries/account';
import { CommissionForm } from '@/components/forms/CommissionForm';
import { PilotNotice } from '@/components/forms/PilotNotice';

export const metadata = { title: 'Request a custom piece' };

export default async function CustomPage({ searchParams }: { searchParams: { q?: string } }) {
  const q = typeof searchParams.q === 'string' ? searchParams.q.trim().slice(0, 120) : '';
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(q ? `/custom?q=${q}` : '/custom')}`);
  const saved = await getMeasurements(user);
  return (
    <div className="mx-auto max-w-xl px-4 pt-10">
      <p className="eyebrow">Custom request</p>
      <h1 className="mt-2 text-[44px] leading-none">Request a custom piece</h1>
      <p className="mt-3 text-[14px] text-muted">
        Not sure which maker? Tell us what you’re dreaming of and our team will match you with the
        right studio.
      </p>
      <div className="mt-6">
        <PilotNotice />
      </div>
      <div className="mt-8">
        <CommissionForm saved={saved} prefill={q ? `I'm looking for: ${q}` : undefined} />
      </div>
    </div>
  );
}
