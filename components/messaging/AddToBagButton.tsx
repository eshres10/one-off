'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { addSavedToBagAction } from '@/lib/actions/social';
import { buttonClass } from '@/components/ui/Button';

/**
 * Adds the piece from a conversation. With a known (or only) size it adds directly; otherwise it
 * sends the shopper to the piece to choose.
 */
export function AddToBagButton({
  productId,
  productSlug,
  variantId,
  disabledLabel,
  size = 'md',
  className = '',
}: {
  productId: string;
  productSlug: string;
  variantId: string | null;
  disabledLabel?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (disabledLabel)
    return (
      <button disabled className={buttonClass('primary', size, `opacity-50 ${className}`)}>
        {disabledLabel}
      </button>
    );
  if (added)
    return (
      <Link href="/bag" className={buttonClass('primary', size, className)}>
        In your bag
      </Link>
    );
  if (!variantId)
    return (
      <Link href={`/products/${productSlug}`} className={buttonClass('primary', size, className)}>
        Add to bag
      </Link>
    );
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await addSavedToBagAction(productId, variantId);
            if (res.ok) {
              setAdded(true);
              router.refresh();
            } else setError(res.message ?? 'Couldn’t add this to your bag.');
          })
        }
        className={buttonClass('primary', size, className)}
      >
        {pending ? 'Adding…' : 'Add to bag'}
      </button>
      {error && (
        <p className="mt-1 text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
