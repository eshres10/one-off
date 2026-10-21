import { requireSeller } from '@/lib/auth/session';
import { openStripeDashboardAction } from '@/lib/actions/seller';
import { REPLY_WITHIN, SHOP_TAGS, getSettings } from '@/lib/services/settings';
import { SettingsForm } from '@/components/studio/settings/SettingsForm';

export const metadata = { title: 'Settings · Studio' };

export default async function SettingsPage() {
  const seller = await requireSeller();
  const initial = await getSettings(seller);

  return (
    <>
      <p
        className="mb-4 rounded-app bg-stone px-4 py-3 text-[13px] text-muted md:hidden"
        data-testid="desktop-note"
      >
        Bulk editing, bank and tax details and exports are easier on a computer. You can still do
        them here.
      </p>
      <SettingsForm
        initial={initial}
        shopTags={SHOP_TAGS}
        replyWithin={REPLY_WITHIN}
        stripeLink={
          <form action={openStripeDashboardAction}>
            <button className="min-h-[44px] text-[11px] uppercase tracking-label underline underline-offset-[6px]">
              Manage in Stripe ↗
            </button>
          </form>
        }
      />
    </>
  );
}
