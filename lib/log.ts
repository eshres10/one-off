import pino from 'pino';

/** Structured server-side logger. Never log secrets, card data or full message bodies. */
export const log = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  base: { service: 'one-off' },
  redact: {
    paths: ['*.password', '*.token', '*.secret', '*.authorization', '*.cookie', '*.card'],
    censor: '[redacted]',
  },
});

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  const err = error instanceof Error ? error : new Error(String(error));
  log.error({ err, ...context }, err.message);
}
