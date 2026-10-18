import { LockIcon, NeedleIcon, ShieldIcon, TruckIcon } from '@/components/ui/icons';

const ITEMS = [
  { icon: LockIcon, text: 'Secure checkout' },
  { icon: NeedleIcon, text: 'Made to order, to your size' },
  { icon: TruckIcon, text: 'Shipped from the studio' },
  { icon: ShieldIcon, text: 'Buyer protection on every order' },
];

export function TrustStrip() {
  return (
    <ul className="grid grid-cols-2 border-y border-line md:grid-cols-4">
      {ITEMS.map(({ icon: Icon, text }, i) => (
        <li
          key={text}
          className={`flex min-h-[72px] items-center justify-center gap-3 px-4 py-4 text-center text-[11px] uppercase tracking-label ${
            i % 2 === 0 ? 'border-r border-line' : 'md:border-r'
          } ${i < 2 ? 'border-b border-line md:border-b-0' : ''} md:last:border-r-0`}
        >
          <Icon width={16} height={16} className="hidden shrink-0 md:block" />
          {text}
        </li>
      ))}
    </ul>
  );
}
