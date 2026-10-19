import Link from 'next/link';
import { RETURNS } from '@/lib/content/returns';
import { getReturnPolicy } from '@/lib/returns/policy';

/**
 * The returns policy, the same everywhere (product pages, quick view, bag, checkout, footer).
 * With an `itemType` it says what applies to that piece: ready-to-ship pieces can come back
 * within the window, made-to-order, custom and one-of-one pieces can't for a change of mind.
 * `short` is the one-line form for quick view and bag lines. Without a type it covers them all.
 */
export function ReturnsPolicy({
  itemType,
  productType,
  short = false,
  link = false,
  className = '',
  testId,
}: {
  itemType?: string;
  /** Same as itemType (older call sites). */
  productType?: string;
  short?: boolean;
  link?: boolean;
  className?: string;
  testId?: string;
}) {
  const type = itemType ?? productType;
  const text = type
    ? short
      ? getReturnPolicy(type).summary
      : getReturnPolicy(type).detail
    : RETURNS.short;
  return (
    <p className={className} data-testid={testId} data-return-type={type ?? 'all'}>
      {text}
      {link && (
        <>
          {' '}
          <Link href="/legal/returns" className="link">
            Read more
          </Link>
        </>
      )}
    </p>
  );
}
