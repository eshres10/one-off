import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/marketplace_test',
      PAYMENTS_DRIVER: 'mock',
      AUTH_DRIVER: 'local',
      EMAIL_DRIVER: 'outbox',
      STORAGE_DRIVER: 'local',
      STRIPE_WEBHOOK_SECRET: 'whsec_test_secret',
      LOG_LEVEL: 'silent',
    },
  },
});
