import { z } from 'zod';

/**
 * Server environment. Never import this from a client component: none of these values are
 * prefixed NEXT_PUBLIC_, so Next.js will not inline them into browser bundles.
 *
 * Local defaults let `npm run local` work with zero configuration (local Postgres, mock Stripe,
 * email outbox). Production refuses to start on local drivers unless explicitly allowed.
 */
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1).default('postgres://postgres@127.0.0.1:54329/marketplace'),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

    AUTH_DRIVER: z.enum(['local', 'supabase']).default('local'),
    SESSION_SECRET: z
      .string()
      .min(32)
      .default('local-dev-session-secret-change-me-please-0123456789'),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

    STORAGE_DRIVER: z.enum(['local', 'supabase']).default('local'),
    SUPABASE_STORAGE_BUCKET: z.string().default('marketplace'),

    PAYMENTS_DRIVER: z.enum(['mock', 'stripe']).default('mock'),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().default('whsec_local_mock_secret'),
    STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional(),

    EMAIL_DRIVER: z.enum(['outbox', 'resend']).default('outbox'),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default('Atelier Locale <hello@example.com>'),
    ADMIN_NOTIFICATION_EMAIL: z.string().email().default('admin@atelierlocale.test'),

    PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(1500),
    ALLOW_LOCAL_DRIVERS_IN_PRODUCTION: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    SENTRY_DSN: z.string().optional(),
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
  if (
    value.NODE_ENV === 'production' &&
    !isBuildPhase &&
    !value.ALLOW_LOCAL_DRIVERS_IN_PRODUCTION &&
    !process.env.CI &&
    (value.PAYMENTS_DRIVER === 'mock' || value.AUTH_DRIVER === 'local')
  ) {
    throw new Error(
      'Refusing to run production with mock payments or local auth. Set PAYMENTS_DRIVER=stripe and AUTH_DRIVER=supabase, or ALLOW_LOCAL_DRIVERS_IN_PRODUCTION=true for demos/e2e.',
    );
  }
  cached = value;
  return value;
}

/** For tests that mutate process.env. */
export function resetEnvCache() {
  cached = undefined;
}
