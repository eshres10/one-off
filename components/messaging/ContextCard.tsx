import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { formatPrice } from '@/lib/domain/money';
import type { ThreadContext } from '@/lib/services/messaging';

const TYPE_LABEL: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

export function ContextCard({ context, makerName }: { context: ThreadContext; makerName: string }) {
  if (!context.productTitle) {
    return (
      <div className="card p-4 text-sm">
        <p className="font-medium">General question</p>
        <p className="text-ink-muted">Conversation with {makerName}</p>
      </div>
    );
  }
  return (
    <div className="card flex gap-3 p-3" data-testid="thread-context">
      <span className="relative aspect-4/5 w-20 shrink-0 overflow-hidden rounded-lg bg-stone-light">
        {context.imageUrl && (
          <Image
            src={context.imageUrl}
            alt={context.productTitle}
            fill
            sizes="80px"
            className="object-cover"
          />
        )}
      </span>
      <div className="min-w-0 text-sm">
        <Link href={`/products/${context.productSlug}`} className="font-medium hover:underline">
          {context.productTitle}
        </Link>
        <p className="text-ink-muted">by {makerName}</p>
        {context.priceCents !== undefined && (
          <p className="mt-1">{formatPrice(context.priceCents)}</p>
        )}
        <p className="mt-1 text-xs text-ink-muted">
          {[
            context.variantLabel,
            context.productType ? TYPE_LABEL[context.productType] : null,
            context.leadTimeDays ? `${context.leadTimeDays}-day lead time` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
    </div>
  );
}
