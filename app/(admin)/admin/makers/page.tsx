import Link from 'next/link';
import { sql } from '@/lib/db';
import { makerStatusAction } from '@/lib/actions/admin';
import { StatusPill } from '@/components/ui/Badge';
import { CreateSellerForm } from '@/components/admin/CreateSellerForm';

export const metadata = { title: 'Makers' };

export default async function AdminMakersPage() {
  const makers = await sql()<
    {
      id: string;
      slug: string;
      displayName: string;
      city: string | null;
      status: string;
      email: string;
      stripeOnboardingComplete: boolean;
      listings: number;
      story: string | null;
      createdAt: Date;
    }[]
  >`
    select m.id, m.slug, m.display_name, m.city, m.status, u.email, m.stripe_onboarding_complete, m.story, m.created_at,
           (select count(*) from public.products p where p.maker_id = m.id and p.status = 'approved')::int as listings
    from public.makers m join public.users u on u.id = m.user_id
    order by case m.status when 'pending' then 0 when 'draft' then 1 when 'paused' then 2 else 3 end, m.display_name`;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Makers</h1>
      <section className="space-y-2">
        <h2 className="font-sans text-base font-semibold">Onboard a new seller</h2>
        <p className="text-sm text-ink-muted">
          Seller accounts are invite-only. The seller receives a sign-in link to complete their
          profile, payouts, shipping and returns.
        </p>
        <CreateSellerForm />
      </section>
      <div className="overflow-x-auto rounded-2xl border border-stone/70 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-stone/70 text-xs text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Maker</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Payouts</th>
              <th className="px-4 py-3 font-medium">Live listings</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone/60">
            {makers.map((m) => (
              <tr key={m.id} data-testid={`maker-row-${m.slug}`}>
                <td className="px-4 py-3">
                  {m.status === 'approved' ? (
                    <Link href={`/makers/${m.slug}`} className="font-medium hover:underline">
                      {m.displayName}
                    </Link>
                  ) : (
                    <span className="font-medium">{m.displayName}</span>
                  )}
                  <span className="block text-xs text-ink-muted">
                    {m.city}
                    {!m.story && ' · profile incomplete'}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-muted">{m.email}</td>
                <td className="px-4 py-3">
                  {m.stripeOnboardingComplete ? (
                    'Connected'
                  ) : (
                    <span className="text-ink-muted">Not set up</span>
                  )}
                </td>
                <td className="px-4 py-3">{m.listings}</td>
                <td className="px-4 py-3">
                  <StatusPill status={m.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {m.status !== 'approved' && (
                      <form action={makerStatusAction}>
                        <input type="hidden" name="makerId" value={m.id} />
                        <input type="hidden" name="status" value="approved" />
                        <button className="rounded-full bg-ink px-3 py-1 text-xs text-paper">
                          Approve
                        </button>
                      </form>
                    )}
                    {m.status !== 'paused' && (
                      <form action={makerStatusAction} className="flex gap-1">
                        <input type="hidden" name="makerId" value={m.id} />
                        <input type="hidden" name="status" value="paused" />
                        <input
                          name="reason"
                          placeholder="Reason"
                          aria-label="Reason for pausing"
                          className="input w-28 py-1 text-xs"
                        />
                        <button className="rounded-full border border-alert px-3 py-1 text-xs text-alert">
                          {m.status === 'pending' ? 'Reject' : 'Pause'}
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
