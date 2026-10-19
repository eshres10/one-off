import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e';

// The e2e server runs a production build against a freshly reset + seeded database,
// with mock Stripe (signed webhooks through the real endpoint) and the email outbox.
const serverEnv = {
  DATABASE_URL,
  APP_URL: BASE,
  PAYMENTS_DRIVER: 'mock',
  AUTH_DRIVER: 'local',
  EMAIL_DRIVER: 'outbox',
  STORAGE_DRIVER: 'local',
  ALLOW_LOCAL_DRIVERS_IN_PRODUCTION: 'true',
  STRIPE_WEBHOOK_SECRET: 'whsec_e2e_secret',
  SESSION_SECRET: 'e2e-session-secret-at-least-32-characters-long',
  LOG_LEVEL: 'warn',
  NEXT_TELEMETRY_DISABLED: '1',
  CRON_SECRET: process.env.E2E_CRON_SECRET ?? 'e2e-cron-secret-0123456789',
  // Texts are "sent" to the notification log only: no Twilio keys.
  SMS_ENABLED: 'true',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  projects: [
    {
      name: 'mobile-chromium',
      testMatch: ['smoke.spec.ts', 'returns.spec.ts'],
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
    {
      name: 'visual-390',
      testMatch: 'visual.spec.ts',
      dependencies: ['mobile-chromium'],
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'visual-1280',
      testMatch: 'visual.spec.ts',
      dependencies: ['visual-390'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
      },
    },
    {
      name: 'app-shell',
      testMatch: 'app-shell.spec.ts',
      dependencies: ['visual-1280'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
    {
      name: 'discover',
      testMatch: 'discover.spec.ts',
      dependencies: ['app-shell'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
    {
      name: 'studio',
      testMatch: 'studio.spec.ts',
      dependencies: ['discover'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
  ],
  webServer: {
    command:
      'bash scripts/pg-local.sh && tsx scripts/db-setup.ts --reset && tsx scripts/gen-seed-images.ts && tsx scripts/seed.ts && next build && next start -p ' +
      PORT,
    url: `${BASE}/`,
    timeout: 600_000,
    reuseExistingServer: false,
    env: serverEnv,
    stdout: 'pipe',
  },
});
