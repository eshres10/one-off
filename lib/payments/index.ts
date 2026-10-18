import { env } from '@/lib/env';
import { createMockDriver } from './mock';
import { createStripeDriver } from './stripe';
import type { PaymentsDriver } from './types';

let driver: PaymentsDriver | undefined;

export function payments(): PaymentsDriver {
  if (driver) return driver;
  const e = env();
  driver =
    e.PAYMENTS_DRIVER === 'stripe' ? createStripeDriver(e.STRIPE_SECRET_KEY!) : createMockDriver();
  return driver;
}

export type { PaymentsDriver } from './types';
