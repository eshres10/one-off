import type { AccountSummary } from '@/lib/queries/account-home';

/** The account sections, with the value shown on the right. */
export interface NavItem {
  href: string;
  label: string;
  /** Right-hand value: "2 in progress", "AU 10", "1 new". */
  value?: string;
  testId?: string;
}

export function accountItems(s: AccountSummary): NavItem[] {
  return [
    {
      href: '/account/orders',
      label: 'Orders',
      value: s.inProgress ? `${s.inProgress} in progress` : undefined,
      testId: 'nav-orders',
    },
    {
      href: '/account/sizes',
      label: 'Sizes & fit',
      value: s.usualSize ? `AU ${s.usualSize}` : 'Add',
    },
    {
      href: '/account/addresses',
      label: 'Addresses & payment',
      value: s.addresses ? `${s.addresses} saved` : undefined,
    },
    { href: '/account/notifications', label: 'Notifications' },
    {
      href: '/messages',
      label: 'Messages',
      value: s.messagesNew ? `${s.messagesNew} new` : undefined,
    },
    { href: '/saved', label: 'Saved', value: s.saved ? String(s.saved) : undefined },
    { href: '/account/style', label: 'Your style' },
    { href: '/account/following', label: 'Following' },
    { href: '/account/requests', label: 'Custom requests', testId: 'nav-requests' },
    { href: '/account/help', label: 'Help' },
  ];
}
