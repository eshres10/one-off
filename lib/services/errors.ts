/** An error whose message is safe and helpful to show to the user. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export function isUserFacing(err: unknown): err is Error {
  return (
    err instanceof Error &&
    ['UserError', 'CartError', 'RateLimitError', 'ModerationError'].includes(err.name)
  );
}

/** Maps Postgres permission / constraint errors raised by RLS and triggers to safe messages. */
export function pgMessage(err: unknown): string | null {
  const e = err as { code?: string; message?: string };
  if (e?.code === '42501') return 'You don’t have permission to do that.';
  if (e?.code === '23514') return e.message ?? 'That change isn’t allowed.';
  if (e?.code === '23505') return 'That already exists.';
  return null;
}
