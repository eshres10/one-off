import { requireUser } from '@/lib/auth/session';
import { getBuyerPrefs } from '@/lib/services/buyer-profile';
import { DropAlertsSwitch } from '@/components/account/DropAlertsSwitch';
import { NotificationSwitches } from '@/components/account/NotificationSwitches';

export const metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const user = await requireUser('/account/notifications');
  const prefs = await getBuyerPrefs(user);
  return (
    <div className="max-w-xl">
      <h1 className="font-display text-[40px] leading-none md:text-[44px]">Notifications</h1>
      <div className="mt-8">
        <NotificationSwitches initial={prefs} />
      </div>
      <h2 className="mt-12 font-sans text-[11px] uppercase tracking-[0.2em] text-muted">
        On this device
      </h2>
      <div className="mt-3 border-t border-line">
        <DropAlertsSwitch />
      </div>
    </div>
  );
}
