import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_e2e';

// The e2e server runs a production build against a freshly reset + seeded database,
// with mock Stripe (signed webhooks through the real endpoint) and the email outbox.
const serverEnv = {
  SURVEY_HOST_LIVE: 'true',
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
  // A fixed public key (no private key: nothing is really sent), so the build doesn't pick up
  // whatever .env.local holds and drop-alert screens look the same everywhere.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY:
    'BG5WChUg6RoyjU_etHD-1Rdiw79JKpW20UHPzjaBuAqp6m68gaWcUwsDN0cSuLmP1IQBHa-vPP-_YJAOZKz85mw',
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
    {
      name: 'onboarding',
      testMatch: 'onboarding.spec.ts',
      dependencies: ['studio'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
    {
      name: 'applications',
      testMatch: 'applications.spec.ts',
      dependencies: ['onboarding'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
    {
      name: 'states',
      testMatch: 'states.spec.ts',
      dependencies: ['applications'],
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'change-of-mind',
      testMatch: 'change-of-mind.spec.ts',
      dependencies: ['states'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
    {
      name: 'content',
      testMatch: 'content.spec.ts',
      dependencies: ['change-of-mind'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
    {
      // Each test opens its own phone or desktop context.
      name: 'install',
      testMatch: 'install.spec.ts',
      dependencies: ['content'],
      use: { browserName: 'chromium' },
    },
    {
      name: 'story',
      testMatch: 'story.spec.ts',
      dependencies: ['install'],
      use: { browserName: 'chromium' },
    },
    {
      name: 'brand',
      testMatch: 'brand.spec.ts',
      dependencies: ['story'],
      use: { browserName: 'chromium', viewport: { width: 1280, height: 860 } },
    },
    // Have it made, recorded: the phone flow, then the desktop flow with Studio and admin.
    {
      name: 'have-it-made-390',
      testMatch: 'have-it-made.spec.ts',
      dependencies: ['brand'],
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        video: { mode: 'on', size: { width: 390, height: 844 } },
      },
    },
    {
      name: 'have-it-made-1280',
      testMatch: 'have-it-made.spec.ts',
      dependencies: ['have-it-made-390'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
        video: { mode: 'on', size: { width: 1280, height: 900 } },
      },
    },
    // The phone app (iPhone 14) and its one desktop check at 1440.
    {
      name: 'phone-app',
      testMatch: 'phone-app.spec.ts',
      dependencies: ['have-it-made-1280'],
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'phone-app-desktop',
      testMatch: 'phone-app.spec.ts',
      dependencies: ['phone-app'],
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
      },
    },
    // The maker survey on survey.localhost (phone), with the admin page on the main host.
    {
      name: 'survey',
      testMatch: 'survey.spec.ts',
      dependencies: ['phone-app-desktop'],
      timeout: 120_000,
      use: {
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
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
