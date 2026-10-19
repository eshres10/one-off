import { getSessionUser } from '@/lib/auth/session';
import { tourDue } from '@/lib/queries/tour';
import { CustomerTour } from './CustomerTour';

/** Mounts the shopper tour for signed-in shoppers who haven't seen it (desktop only, client-side). */
export async function CustomerTourGate() {
  const user = await getSessionUser();
  if (!user || user.role !== 'buyer') return null;
  if (!(await tourDue(user.id, 'customer'))) return null;
  const first = (
    user.displayName?.trim().split(/\s+/)[0] ||
    user.email.split('@')[0] ||
    ''
  ).replace(/^\w/, (c) => c.toUpperCase());
  return <CustomerTour firstName={first} />;
}
