import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { CommissionForm } from '@/components/forms/CommissionForm';
import { PilotNotice } from '@/components/forms/PilotNotice';

export const metadata = { title: 'Request a custom piece' };

export default async function CustomPage() {
  const user = await getSessionUser();
  if (!user) redirect('/login?next=/custom');
  return (
    <div className="container-page max-w-2xl pt-8">
      <h1 className="text-3xl sm:text-4xl">Request a custom piece</h1>
      <p className="mt-2 text-ink-soft">
        Not sure which maker? Tell us what you’re dreaming of and our team will match you with the
        right studio.
      </p>
      <div className="mt-6">
        <PilotNotice />
      </div>
      <div className="mt-8">
        <CommissionForm />
      </div>
    </div>
  );
}
