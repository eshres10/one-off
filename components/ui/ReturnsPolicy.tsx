import Link from 'next/link';
import { RETURNS, isCustomType } from '@/lib/content/returns';

/**
 * The returns policy, the same everywhere (product pages, quick view, bag, checkout, footer):
 * no change-of-mind returns, faults made right, and the made-to-order note on made-to-order pieces.
 */
export function ReturnsPolicy({
  productType,
  link = false,
  className = '',
  testId,
}: {
  productType?: string;
  link?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <p className={className} data-testid={testId}>
      {RETURNS.short}
      {productType && isCustomType(productType) && (
        <span className="mt-1 block" data-testid="returns-mto">
          {RETURNS.madeToOrder}
        </span>
      )}
      {link && (
        <>
          {' '}
          <Link href="/returns" className="link">
            Read more
          </Link>
        </>
      )}
    </p>
  );
}
