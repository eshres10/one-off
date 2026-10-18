/**
 * Server start-up hook: validates configuration early and installs process-level error logging.
 * To forward errors to Sentry (or similar), set SENTRY_DSN and install @sentry/nextjs — the
 * reportError() helper in lib/log.ts is the single place to wire it in.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { env } = await import('./lib/env');
  const { log, reportError } = await import('./lib/log');
  const e = env();
  log.info(
    {
      auth: e.AUTH_DRIVER,
      payments: e.PAYMENTS_DRIVER,
      email: e.EMAIL_DRIVER,
      storage: e.STORAGE_DRIVER,
    },
    'server starting',
  );
  process.on('unhandledRejection', (reason) => reportError(reason, { kind: 'unhandledRejection' }));
}
