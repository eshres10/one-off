import { NEXT_STEP_LABEL, READY_STEP } from '@/lib/studio/steps';

export type OrderBucket = 'to-start' | 'making' | 'to-ship' | 'done';

export interface OrderShape {
  status: string;
  isMto: boolean;
  mtoStep: number;
  orderType?: 'standard' | 'custom';
  milestones?: Record<string, unknown>;
}

const DONE = ['shipped', 'delivered', 'completed', 'refunded', 'cancelled', 'issue'];

/** The phone Orders filter a piece belongs to. */
export function bucketOf(o: OrderShape): OrderBucket {
  if (DONE.includes(o.status)) return 'done';
  if (o.status === 'ready' || o.status === 'preparing') return 'to-ship';
  if (o.isMto) return o.status === 'making' ? 'making' : 'to-start';
  return 'to-ship';
}

export const BUCKETS: Array<{ key: OrderBucket; label: string }> = [
  { key: 'to-start', label: 'To start' },
  { key: 'making', label: 'Making' },
  { key: 'to-ship', label: 'To ship' },
  { key: 'done', label: 'Done' },
];

export interface NextStep {
  kind: 'making' | 'packed' | 'ship' | 'milestone';
  value?: number | string;
  label: string;
}

export interface StepModel {
  labels: string[];
  /** Index of the step reached (0-based). */
  current: number;
  next: NextStep | null;
}

/**
 * The timeline for an order: made to order (Order in → Fabric bought → Cutting → Sewing →
 * Finishing → Shipped), ready to ship (Order in → Packed → Shipped), or a Have it made order
 * (Order in → Fabric bought → Made → Shipped). `next` is the one primary button.
 */
export function stepsOf(o: OrderShape): StepModel {
  const shipped = ['shipped', 'delivered', 'completed'].includes(o.status);
  if (o.orderType === 'custom') {
    const m = o.milestones ?? {};
    const labels = ['Order in', 'Fabric bought', 'Made', 'Shipped'];
    const current = shipped ? 3 : m.made ? 2 : m.fabric_bought ? 1 : 0;
    const next: NextStep | null = shipped
      ? null
      : !m.fabric_bought
        ? { kind: 'milestone', value: 'fabric_bought', label: 'I’ve bought the fabric' }
        : !m.made
          ? { kind: 'milestone', value: 'made', label: 'It’s made' }
          : { kind: 'ship', label: 'Ship it' };
    return { labels, current, next };
  }
  if (o.isMto) {
    const labels = ['Order in', 'Fabric bought', 'Cutting', 'Sewing', 'Finishing', 'Shipped'];
    const step = o.status === 'ready' ? READY_STEP : o.mtoStep;
    const current = shipped ? 5 : step;
    const next: NextStep | null = shipped
      ? null
      : step < READY_STEP
        ? { kind: 'making', value: step + 1, label: NEXT_STEP_LABEL[step] ?? 'Next step' }
        : { kind: 'ship', label: 'Ship it' };
    return { labels, current, next };
  }
  const labels = ['Order in', 'Packed', 'Shipped'];
  const packed = o.status === 'ready' || o.status === 'preparing';
  const current = shipped ? 2 : packed ? 1 : 0;
  const next: NextStep | null = shipped
    ? null
    : packed
      ? { kind: 'ship', label: 'Ship it' }
      : { kind: 'packed', label: 'It’s packed' };
  return { labels, current, next };
}

/** "Now: Sewing · next: Finishing" for an order row. */
export function nowNext(o: OrderShape): string {
  const s = stepsOf(o);
  const now = s.labels[s.current] ?? '';
  const next = s.labels[s.current + 1];
  return next ? `Now: ${now} · next: ${next}` : `Now: ${now}`;
}
