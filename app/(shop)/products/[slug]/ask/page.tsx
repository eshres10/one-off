import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getProduct } from '@/lib/queries/catalog';
import { variantLabel } from '@/lib/services/cart';
import { ContextCard } from '@/components/messaging/ContextCard';
import { StartThreadForm } from '@/components/messaging/StartThreadForm';
import { ThreadHeader } from '@/components/messaging/ThreadHeader';

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
    <div className="mx-auto max-w-2xl md:pt-6">
      <div className="px-4">
        <ThreadHeader
          backHref={`/products/${product.slug}`}
          name={product.maker.displayName}
          responseHours={product.maker.responseTimeHours}
          avatarUrl={product.maker.avatarUrl}
        />
      </div>
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
      <div className="mt-4 px-4">
        <StartThreadForm productId={product.id} variantId={variant?.id} />
      </div>
    </div>
  );
}
