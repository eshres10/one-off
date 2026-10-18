import { LockIcon, ReturnIcon, ShieldIcon, TruckIcon } from '@/components/ui/icons';
import { BRAND } from '@/lib/brand';

export function TrustBlock({ shipping, returns }: { shipping: string; returns: string }) {
  const rows = [
    { icon: TruckIcon, title: 'Shipping', body: shipping },
    { icon: ReturnIcon, title: 'Returns', body: returns },
    {
      icon: LockIcon,
      title: 'Secure payment',
      body: 'Pay by card, Apple Pay or Google Pay via Stripe. We never see your card details.',
    },
    {
      icon: ShieldIcon,
      title: 'Buyer protection',
      body: `If your piece doesn’t arrive or isn’t as described, ${BRAND.name} will make it right.`,
    },
  ];
  return (
    <ul
      className="divide-y divide-stone/70 rounded-2xl border border-stone/70 bg-white"
      aria-label="Shipping, returns and protection"
    >
      {rows.map(({ icon: Icon, title, body }) => (
        <li key={title} className="flex gap-3 px-4 py-3.5">
          <Icon className="mt-0.5 shrink-0 text-ink-soft" />
          <div>
            <p className="text-sm font-medium">{title}</p>
            <p className="text-sm text-ink-soft">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
