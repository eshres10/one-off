import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getMaker, getProduct } from '@/lib/queries/catalog';
import { getMeasurements } from '@/lib/queries/account';
import { sql } from '@/lib/db';
import { Img as Image } from '@/components/ui/Img';
import { CommissionForm } from '@/components/forms/CommissionForm';
import { PilotNotice } from '@/components/forms/PilotNotice';
import { MakerStrip } from '@/components/maker/MakerByline';
import { CloseIcon } from '@/components/ui/icons';

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
  let source: { id: string; title: string; slug: string; imageUrl: string | null } | null = null;
  if (searchParams.product && /^[0-9a-f-]{36}$/.test(searchParams.product)) {
    const [p] = await sql()<
      { slug: string }[]
    >`select slug from public.products where id = ${searchParams.product} and maker_id = ${data.maker.id}`;
    const product = p ? await getProduct(p.slug) : null;
    if (product)
      source = {
        id: product.id,
        title: product.title,
        slug: product.slug,
        imageUrl: product.images[0]?.url ?? null,
      };
  }
  const saved = await getMeasurements(user);
  const { maker } = data;
  return (
    <div className="mx-auto max-w-xl">
      <div className="grid grid-cols-[44px_1fr_44px] items-center border-b border-line px-4 py-2">
        <Link
          href={source ? `/products/${source.slug}` : `/makers/${maker.slug}`}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center"
        >
          <CloseIcon width={18} height={18} />
        </Link>
        <p className="text-center text-[11px] uppercase tracking-label">Custom request</p>
      </div>
      <div className="px-4 pt-8">
        <h1 className="text-[44px] leading-none">Request a custom piece</h1>
        <p className="mt-3 text-[14px] text-muted">
          Tell {maker.displayName} what you’d like. They’ll review it and send a quote with price,
          deposit and timing. Nothing is charged until you accept.
        </p>
        <div className="mt-6">
          <PilotNotice />
        </div>
        <p className="label mt-8 text-ink">Maker</p>
        <div className="border border-line bg-surface px-3">
          <MakerStrip maker={{ ...maker, location: maker.city }} linked={false} bordered={false} />
        </div>
        {source && (
          <div className="mt-2 flex items-center gap-3 border border-line bg-surface px-3 py-2.5">
            <span className="relative aspect-4/5 w-10 shrink-0 overflow-hidden bg-stone-light">
              {source.imageUrl && (
                <Image src={source.imageUrl} alt="" fill sizes="40px" className="object-cover" />
              )}
            </span>
            <span className="min-w-0 flex-1 text-[13px]">
              <span className="block text-[10px] uppercase tracking-label text-muted-2">
                Based on
              </span>
              {source.title}
            </span>
            <Link
              href={`/makers/${maker.slug}/commission`}
              className="text-[11px] uppercase tracking-label underline underline-offset-[5px]"
            >
              Remove
            </Link>
          </div>
        )}
        <div className="mt-8">
          <CommissionForm makerId={maker.id} sourceProductId={source?.id} saved={saved} />
        </div>
      </div>
    </div>
  );
}
