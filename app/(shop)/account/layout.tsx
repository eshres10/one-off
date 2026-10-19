import { requireUser } from '@/lib/auth/session';
import { logoutAction } from '@/lib/actions/auth';
import { accountSummary } from '@/lib/queries/account-home';
import { AccountBack, AccountSidebar } from '@/components/account/AccountNav';
import { accountItems } from '@/lib/account/nav';

/**
 * The buyer account. Desktop: "Hi, {name}", the email and the sections down the left, with the
 * page on the right. Phone: the account home is the menu; subpages have "‹ Account".
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser('/account');
  const summary = await accountSummary(user);
  return (
    <div className="container-page pb-20 pt-8 md:pt-14">
      <div className="grid gap-10 md:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden md:block" aria-label="Account">
          <p className="font-display text-[34px] leading-none" data-testid="account-hi">
            Hi, {summary.firstName}
          </p>
          <p className="mt-2 truncate text-[13px] text-muted">{summary.email}</p>
          <nav className="mt-8 border-t border-line pt-4">
            <AccountSidebar items={accountItems(summary)} />
            <form action={logoutAction} className="mt-4 border-t border-line pt-4">
              <button className="min-h-[40px] text-[14px] text-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </nav>
        </aside>
        <div className="min-w-0">
          <AccountBack />
          {children}
        </div>
      </div>
    </div>
  );
}
