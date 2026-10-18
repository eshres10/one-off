import { LockIcon, ShieldIcon, TruckIcon } from './icons';

export function TrustList({ shipsFrom, shipping }: { shipsFrom?: string; shipping?: string }) {
  const rows = [
    { icon: LockIcon, text: 'Secure checkout with card, Apple Pay or Google Pay.' },
    {
      icon: ShieldIcon,
      text: 'Buyer protection: pay through One Off and you’re covered if it doesn’t arrive or isn’t as described.',
    },
    ...(shipsFrom
      ? [{ icon: TruckIcon, text: `Ships from ${shipsFrom}.${shipping ? ` ${shipping}` : ''}` }]
      : []),
  ];
  return (
    <ul
      className="space-y-2.5 border-y border-line py-4"
      aria-label="Shipping, returns and protection"
    >
      {rows.map(({ icon: Icon, text }) => (
        <li key={text} className="flex gap-3 text-[13px] text-text2">
          <Icon width={16} height={16} strokeWidth={1.3} className="mt-0.5 shrink-0" />
          <span>{text}</span>
        </li>
      ))}
    </ul>
  );
}
