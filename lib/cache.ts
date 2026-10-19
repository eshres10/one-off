import { revalidateTag, unstable_cache } from 'next/cache';

/**
 * unstable_cache that also works outside a Next request (scripts, tests, cron helpers): there it
 * just calls `fn`.
 */
export function cached<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keys: string[],
  opts: { revalidate?: number; tags?: string[] },
): (...args: A) => Promise<R> {
  const inNext = unstable_cache(fn, keys, opts);
  return async (...args: A) => {
    try {
      return await inNext(...args);
    } catch (err) {
      if (
        err instanceof Error &&
        /incrementalCache missing|static generation store/.test(err.message)
      )
        return fn(...args);
      throw err;
    }
  };
}

/** revalidateTag, ignored outside a Next request. */
export function invalidate(tag: string) {
  try {
    revalidateTag(tag);
  } catch {
    // Not in a request (scripts, tests): nothing is cached there.
  }
}
