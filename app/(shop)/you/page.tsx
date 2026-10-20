import { STUDIO_STATUSES, requireUser } from '@/lib/auth/session';
import { getCartSessionId } from '@/lib/actions/util';
import { getBuyerOrders, getMeasurements } from '@/lib/queries/account';
import { getFollowedMakers, getSavedPieces } from '@/lib/queries/saved';
import { accountSummary } from '@/lib/queries/account-home';
import { factsOf } from '@/components/account/Parcel';
import { progressSteps, stageOf } from '@/lib/account/progress';
import { DesktopRedirect } from '@/components/app/DesktopRedirect';
import { YouScreen, type YouOrder } from '@/components/app/you/YouScreen';

export const metadata = { title: 'You' };

/** You (phones): handle, stats, Likes / Orders / Sizes. Desktop goes to the account. */
export default async function YouPage({ searchParams }: { searchParams: { tab?: string } }) {
  const user = await requireUser('/you');
  const [summary, pieces, makers, orders, sizes] = await Promise.all([
    accountSummary(user),
    getSavedPieces(user, getCartSessionId()),
    getFollowedMakers(user),
    getBuyerOrders(user),
    getMeasurements(user),
  ]);
  const youOrders: YouOrder[] = orders.map((o) => ({
    orderNumber: o.orderNumber,
    totalCents: o.totalCents,
    placedAt: (o.paidAt ?? o.createdAt).toISOString(),
    parcels: o.fulfilments.map((f) => {
      const facts = factsOf(f, o.paidAt ?? o.createdAt);
      const steps = progressSteps(facts);
      return {
        id: f.id,
        maker: f.makerName,
        title: f.items[0]?.productTitle ?? 'Piece',
        imageUrl: f.items[0]?.imageUrl ?? null,
        stage: stageOf(f.status, f.isMto),
        steps: steps.map((s) => ({ label: s.label, done: s.done, current: s.current })),
      };
    }),
  }));
  const tab =
    searchParams.tab === 'orders' ? 'orders' : searchParams.tab === 'sizes' ? 'sizes' : 'likes';
  return (
    <>
      <DesktopRedirect to="/account" />
      <YouScreen
        tab={tab}
        firstName={summary.firstName}
        handle={user.email.split('@')[0] ?? 'you'}
        initial={summary.firstName.slice(0, 1)}
        stats={{ orders: orders.length, following: makers.length, likes: pieces.length }}
        likes={pieces.map((p) => ({
          id: p.card.id,
          slug: p.card.slug,
          title: p.card.title,
          priceCents: p.card.priceCents,
          imageUrl: p.card.imageUrl,
        }))}
        orders={youOrders}
        sizes={sizes}
        studio={user.role === 'seller' && STUDIO_STATUSES.includes(user.shopStatus ?? '')}
      />
    </>
  );
}
