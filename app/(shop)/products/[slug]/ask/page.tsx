import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getProduct } from '@/lib/queries/catalog';
import { variantLabel } from '@/lib/services/cart';
import { ContextCard } from '@/components/messaging/ContextCard';
import { StartThreadForm } from '@/components/messaging/StartThreadForm';
import { responseTimeLabel } from '@/components/maker/MakerByline';

export const metadata = { title: 'Ask the maker' };

export default async function AskMakerPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { variant?: string };
}) {
  const product = await getProduct(params.slug);
  if (!product) notFound();
  const user = await getSessionUser();
  const qs = searchParams.variant ? `?variant=${encodeURIComponent(searchParams.variant)}` : '';
  if (!user) redirect(`/login?next=${encodeURIComponent(`/products/${product.slug}/ask${qs}`)}`);
  const variant = product.variants.find((v) => v.id === searchParams.variant);

  return (
    <div className="container-page max-w-2xl pt-8">
      <Link href={`/products/${product.slug}`} className="text-sm text-ink-muted hover:underline">
        ← Back to {product.title}
      </Link>
      <h1 className="mt-3 text-3xl">Ask {product.maker.displayName}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {responseTimeLabel(product.maker.responseTimeHours)}. You don’t need to message before
        buying.
      </p>
      <div className="mt-6">
        <ContextCard
          makerName={product.maker.displayName}
          context={{
            productTitle: product.title,
            productSlug: product.slug,
            imageUrl: product.images[0]?.url,
            priceCents: product.priceCents,
            productType: product.productType,
            variantLabel: variant
              ? variantLabel(variant.size, variant.colour, product.colours.length)
              : null,
            leadTimeDays: product.leadTimeDays,
          }}
        />
      </div>
      <div className="mt-6">
        <StartThreadForm productId={product.id} variantId={variant?.id} />
      </div>
    </div>
  );
}
