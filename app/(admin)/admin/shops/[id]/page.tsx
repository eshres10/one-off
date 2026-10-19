import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { formatPrice } from '@/lib/domain/money';
import { getAdminShop } from '@/lib/services/concierge';
import { SendInviteForm } from '@/components/admin/ShopForms';
import { Img as Image } from '@/components/ui/Img';

export const metadata = { title: 'Shop' };

const when = (d: Date | null) =>
  d
    ? new Date(d).toLocaleString('en-AU', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'Australia/Melbourne',
      })
    : '—';

export default async function AdminShopPage({ params }: { params: { id: string } }) {
  if (!z.string().uuid().safeParse(params.id).success) notFound();
  const data = await getAdminShop(params.id);
  if (!data) notFound();
  const { shop, pieces, invites, events } = data;
  const claimable = shop.shopStatus === 'draft' || shop.shopStatus === 'invited';
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">
            {shop.shopStatus}{' '}
            {shop.foundingNumber
              ? `· Founding Nº ${String(shop.foundingNumber).padStart(2, '0')}`
              : ''}
          </p>
          <h1 className="text-[40px] leading-none md:text-[48px]">{shop.displayName}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            {shop.email} {shop.instagram ? `· @${shop.instagram}` : ''}{' '}
            {shop.location ? `· ${shop.location}` : ''}
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href={`/makers/${shop.slug}?preview=1`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[44px] items-center border border-ink px-4 text-[11px] uppercase tracking-label"
            data-testid="preview-shop"
          >
            Preview shop ↗
          </a>
        </div>
      </div>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-[28px] leading-none">Pieces ({pieces.length})</h2>
          {claimable && (
            <Link
              href={`/admin/shops/${shop.id}/pieces/new`}
              className="text-link"
              data-testid="add-shop-piece"
            >
              Add a piece
            </Link>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="list">
          {pieces.map((p) => (
            <li key={p.id} className="border border-line bg-surface" data-testid="admin-piece">
              <Link href={`/admin/shops/${shop.id}/pieces/${p.id}`}>
                <span className="relative block aspect-4/5 bg-stone">
                  {p.imageUrl && (
                    <Image src={p.imageUrl} alt="" fill sizes="200px" className="object-cover" />
                  )}
                </span>
                <span className="block p-2 text-[13px]">
                  {p.title}
                  <span className="block text-[11px] text-ink-muted">
                    {p.status} · {formatPrice(p.priceCents)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {claimable && (
        <section className="max-w-xl">
          <h2 className="mb-2 text-[28px] leading-none">Invite</h2>
          <p className="mb-4 text-sm text-ink-muted">
            Emails {shop.email} a single-use link to claim the shop (7 days). Sending again replaces
            any unused link.
          </p>
          <SendInviteForm
            makerId={shop.id}
            label={invites.length ? 'Send a new invite' : 'Send invite'}
          />
          {invites.length > 0 && (
            <table className="mt-4 w-full text-left text-[12px]">
              <thead className="eyebrow">
                <tr>
                  <th className="font-normal">Sent</th>
                  <th className="font-normal">Opened</th>
                  <th className="font-normal">Used</th>
                  <th className="font-normal">Expires</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="py-1">{when(i.createdAt)}</td>
                    <td>{when(i.openedAt)}</td>
                    <td>{when(i.usedAt)}</td>
                    <td>{when(i.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {events.length > 0 && (
        <section className="max-w-xl">
          <h2 className="mb-2 text-[28px] leading-none">Activity</h2>
          <ul className="text-[13px]" role="list">
            {events.map((e, i) => (
              <li key={i} className="flex justify-between border-t border-line py-1.5">
                <span>{e.event.replace(/_/g, ' ')}</span>
                <span className="text-ink-muted">{when(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
