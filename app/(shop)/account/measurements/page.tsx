import { requireUser } from '@/lib/auth/session';
import { getMeasurements } from '@/lib/queries/account';
import { MeasurementsForm } from '@/components/account/MeasurementsForm';

export const metadata = { title: 'Measurements' };

export default async function MeasurementsPage() {
  const user = await requireUser('/account/measurements');
  const m = await getMeasurements(user);
  return (
    <div className="max-w-lg">
      <h1 className="text-3xl">Your measurements</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Saved privately to your account to make sizing questions and custom requests quicker. Only
        you can see them.
      </p>
      <div className="mt-6">
        <MeasurementsForm initial={m} />
      </div>
    </div>
  );
}
