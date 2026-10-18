import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getMaker, getProduct } from '@/lib/queries/catalog';
import { getMeasurements } from '@/lib/queries/account';
import { sql } from '@/lib/db';
import { CommissionForm } from '@/components/forms/CommissionForm';
import { PilotNotice } from '@/components/forms/PilotNotice';

export const metadata = { title: 'Request a custom piece' };

export default async function CommissionPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { product?: string };
}) {
  const data = await getMaker(params.slug);
  if (!data || !data.maker.customCommissionsEnabled) notFound();
  const user = await getSessionUser();
  const qs = searchParams.product ? `?product=${encodeURIComponent(searchParams.product)}` : '';
  if (!user)
    redirect(`/login?next=${encodeURIComponent(`/makers/${params.slug}/commission${qs}`)}`);
  let source: { id: string; title: string } | null = null;
  if (searchParams.product && /^[0-9a-f-]{36}$/.test(searchParams.product)) {
    const [p] = await sql()<
      { slug: string }[]
    >`select slug from public.products where id = ${searchParams.product} and maker_id = ${data.maker.id}`;
    const product = p ? await getProduct(p.slug) : null;
    if (product) source = { id: product.id, title: product.title };
  }
  const m = await getMeasurements(user);
  const defaults = m
    ? [
        m.heightCm && `Height ${m.heightCm}cm`,
        m.bustCm && `bust ${m.bustCm}`,
        m.waistCm && `waist ${m.waistCm}`,
        m.hipsCm && `hips ${m.hipsCm}`,
        m.fitNotes,
      ]
        .filter(Boolean)
        .join(', ')
    : undefined;
  return (
    <div className="container-page max-w-2xl pt-8">
      <Link href={`/makers/${data.maker.slug}`} className="text-sm text-ink-muted hover:underline">
        ← {data.maker.displayName}
      </Link>
      <h1 className="mt-3 text-3xl sm:text-4xl">Request a custom piece</h1>
      <p className="mt-2 text-ink-soft">
        From {data.maker.displayName}
        {source ? (
          <>
            , inspired by <span className="font-medium">{source.title}</span>
          </>
        ) : null}
        .
      </p>
      <div className="mt-6">
        <PilotNotice />
      </div>
      <div className="mt-8">
        <CommissionForm
          makerId={data.maker.id}
          sourceProductId={source?.id}
          defaultMeasurements={defaults}
        />
      </div>
    </div>
  );
}
