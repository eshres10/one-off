import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getMeasurements } from '@/lib/queries/account';
import { MeasurementsForm } from '@/components/account/MeasurementsForm';

export const metadata = { title: 'Sizes & fit' };

export default async function SizesPage() {
  const user = await requireUser('/account/sizes');
  const m = await getMeasurements(user);
  return (
    <div className="max-w-xl">
      <h1 className="font-display text-[40px] leading-none md:text-[44px]">Sizes &amp; fit</h1>
      <Link
        href="/size-guide#how-to-measure"
        className="mt-3 inline-flex min-h-[44px] items-center text-[13px] underline underline-offset-[3px]"
        data-testid="how-to-measure"
      >
        How to measure yourself
      </Link>
      <div className="mt-6">
        <MeasurementsForm initial={m} />
      </div>
    </div>
  );
}
