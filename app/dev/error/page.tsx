import { notFound } from 'next/navigation';
import { mockPaymentsReachable } from '@/lib/features';

export const dynamic = 'force-dynamic';

/** Throws, to show and test the error page. Only with the local mock drivers, never in production. */
export default function ThrowForTest() {
  if (!mockPaymentsReachable()) notFound();
  throw new Error('Test error from /dev/error');
}
