import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { sql } from '@/lib/db';

export const metadata = { title: 'Photos to list', robots: { index: false } };

/** "Send us photos, we'll list it" requests from founding and invited makers. */
export default async function ListingRequestsPage() {
  await requireAdmin();
  const rows = await sql()<
    {
      id: string;
      shop: string;
      slug: string;
      makerId: string;
      photoUrls: string[];
      note: string | null;
      status: string;
      createdAt: Date;
    }[]
  >`
    select r.id, m.display_name as shop, m.slug, m.id as maker_id, r.photo_urls, r.note, r.status, r.created_at
    from public.listing_requests r join public.makers m on m.id = r.maker_id
    order by (r.status = 'new') desc, r.created_at desc limit 100`;
  return (
    <div className="max-w-4xl">
      <h1 className="text-[40px] leading-none md:text-[48px]">Photos to list</h1>
      <p className="mt-2 text-[14px] text-muted">
        Makers who sent photos for us to list. Add the piece from the shop’s page in Shops.
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 text-[14px] text-muted">Nothing waiting.</p>
      ) : (
        <ul className="mt-8 divide-y divide-line border-y border-line" role="list">
          {rows.map((r) => (
            <li key={r.id} className="py-5">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/admin/shops/${r.makerId}`}
                  className="text-[15px] underline-offset-4 hover:underline"
                >
                  {r.shop}
                </Link>
                <span className="text-[12px] text-muted">
                  {r.status} ·{' '}
                  {new Date(r.createdAt).toLocaleDateString('en-AU', {
                    dateStyle: 'medium',
                    timeZone: 'Australia/Melbourne',
                  })}
                </span>
              </div>
              {r.note && <p className="mt-2 whitespace-pre-line text-[14px]">{r.note}</p>}
              <ul className="mt-3 flex flex-wrap gap-2" role="list">
                {r.photoUrls.map((u) => (
                  <li key={u}>
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="block h-28 w-[90px] overflow-hidden bg-stone"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u} alt="" className="h-full w-full object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
