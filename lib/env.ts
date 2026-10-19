import { z } from 'zod';

/**
 * Server environment. Never import this from a client component: none of these values are
 * prefixed NEXT_PUBLIC_, so Next.js will not inline them into browser bundles.
 *
 * Local defaults let `npm run local` work with zero configuration (local Postgres, mock Stripe,
 * email outbox). Production refuses to start on local drivers unless explicitly allowed.
 */
const DEFAULT_SESSION_SECRET = 'local-dev-session-secret-change-me-please-0123456789';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1).default('postgres://postgres@127.0.0.1:54329/marketplace'),
    // Serverless instances each hold their own pool, so keep it small on Vercel; Supabase's
    // poolers cap total client connections.
    DATABASE_POOL_MAX: z.coerce
      .number()
      .int()
      .positive()
      .default(process.env.VERCEL ? 3 : 10),

    AUTH_DRIVER: z.enum(['local', 'supabase']).default('local'),
    SESSION_SECRET: z.string().min(32).default(DEFAULT_SESSION_SECRET),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    SUPABASE_STORAGE_BUCKET: z.string().default('marketplace'),

    PAYMENTS_DRIVER: z.enum(['mock', 'stripe']).default('mock'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().default('whsec_local_mock_secret'),
    STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),
    /** Public key for Stripe.js (Payment Element, Express Checkout Element) on /checkout. */
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
    /** The public site address for share links and images; falls back to APP_URL. */
    NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

    EMAIL_DRIVER: z.enum(['outbox', 'resend']).default('outbox'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('One Off <hello@shoponeoff.com.au>'),
    ADMIN_NOTIFICATION_EMAIL: z.string().email().default('admin@oneoff.test'),

    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(1500),
    /** Browse-only launch mode: checkout, bag and payment webhooks are switched off. */
    PREVIEW_MODE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    ALLOW_LOCAL_DRIVERS_IN_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SENTRY_DSN: z.string().optional(),
    /** Social sign-in through Supabase, e.g. "google,apple" (each enabled in Supabase Auth). */
    AUTH_OAUTH_PROVIDERS: z.string().default(''),
    /** Carrier tracking (optional): with keys set, delivery is read from the carrier. */
    AUSPOST_API_KEY: z.string().optional(),
    AUSPOST_API_PASSWORD: z.string().optional(),
    AUSPOST_ACCOUNT_NUMBER: z.string().optional(),
    SENDLE_ID: z.string().optional(),
    SENDLE_API_KEY: z.string().optional(),
    /** Texts for new orders (optional): Twilio, only when SMS_ENABLED=true. */
    SMS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),
    /** Shared secret for the inbound-email webhook (replies with tracking numbers). */
    INBOUND_EMAIL_SECRET: z.string().min(16).optional(),
    /** Reply-to domain for order emails, e.g. reply.shoponeoff.com.au (inbound routing). */
    INBOUND_EMAIL_DOMAIN: z.string().optional(),
    /** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; scheduled routes require it. */
    CRON_SECRET: z.string().min(16).optional(),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_DRIVER === 'supabase' || env.STORAGE_DRIVER === 'supabase') {
      for (const key of [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
      ] as const) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required for supabase drivers' });
      }
    }
    if (env.PAYMENTS_DRIVER === 'stripe' && !env.STRIPE_SECRET_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['STRIPE_SECRET_KEY'],
        message: 'required when PAYMENTS_DRIVER=stripe',
      });
    }
    if (env.EMAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'required when EMAIL_DRIVER=resend',
      });
    }
  });

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const value = parsed.data;
  const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
  const isProductionRuntime = value.NODE_ENV === 'production' && !isBuildPhase && !process.env.CI;
  if (
    isProductionRuntime &&
    value.AUTH_DRIVER === 'local' &&
    value.SESSION_SECRET === DEFAULT_SESSION_SECRET
  ) {
    throw new Error(
      'Local auth in production needs a real SESSION_SECRET (32+ random characters).',
    );
  }
  if (
    isProductionRuntime &&
    // Preview mode can't take payments, so the mock payment driver is never reachable.
    !value.PREVIEW_MODE &&
    !value.ALLOW_LOCAL_DRIVERS_IN_PRODUCTION &&
    (value.PAYMENTS_DRIVER === 'mock' || value.AUTH_DRIVER === 'local')
  ) {
    throw new Error(
      'Refusing to run production with mock payments or local auth. Set PAYMENTS_DRIVER=stripe and AUTH_DRIVER=supabase, PREVIEW_MODE=true for a browse-only launch, or ALLOW_LOCAL_DRIVERS_IN_PRODUCTION=true for demos/e2e.',
    );
  }
  cached = value;
  return value;
}

/** For tests that mutate process.env. */
export function resetEnvCache() {
  cached = undefined;
}
