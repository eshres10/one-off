import { SystemMessage } from '@/components/ui/SystemMessage';

export const metadata = { title: 'Back soon' };

/** Shown when MAINTENANCE_MODE=true (see middleware.ts). */
export default function MaintenancePage() {
  return (
    <SystemMessage
      title="We’ll be back shortly"
      body="We’re making a few changes. Your saved pieces and orders are safe."
      action={<span />}
    />
  );
}
