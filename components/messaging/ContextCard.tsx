import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { formatPrice } from '@/lib/domain/money';
import type { ThreadContext } from '@/lib/services/messaging';
import { ChevronIcon } from '@/components/ui/icons';

const TYPE_LABEL: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

/** Product context bar shown at the top of a thread. */
export function ContextCard({ context, makerName }: { context: ThreadContext; makerName: string }) {
  if (!context.productTitle) {
    return (
      <div className="border-y border-line bg-surface px-4 py-3 text-[13px]">
        <p>General question</p>
        <p className="text-muted-2">Conversation with {makerName}</p>
      </div>
    );
  }
  const meta = [
    context.variantLabel?.replace(/^AU /, 'Size '),
    context.priceCents !== undefined ? formatPrice(context.priceCents) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const type = [
    context.productType ? TYPE_LABEL[context.productType] : null,
    context.leadTimeDays ? `${context.leadTimeDays} days` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href={`/products/${context.productSlug}`}
      className="flex items-center gap-3 border-y border-line bg-surface px-4 py-3 hover:bg-ground"
      data-testid="thread-context"
    >
      <span className="relative aspect-4/5 w-12 shrink-0 overflow-hidden bg-stone-light">
        {context.imageUrl && (
          <Image
            src={context.imageUrl}
            alt=""
            fill
            sizes="48px"
            className="object-cover object-top"
          />
        )}
      </span>
      <span className="min-w-0 flex-1 text-[13px]">
        <span className="block font-normal">{context.productTitle}</span>
        {meta && <span className="block text-muted">{meta}</span>}
        {type && (
          <span className="block text-[10px] uppercase tracking-label text-muted-2">{type}</span>
        )}
      </span>
      <ChevronIcon width={16} height={16} />
    </Link>
  );
}
