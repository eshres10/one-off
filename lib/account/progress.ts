import { formatArrival } from '@/lib/shipping/estimate';

/**
 * Where a buyer's parcel is, in four steps: Ordered → Being made (made to order) or Packed →
 * On its way → Delivered. Fulfilment statuses map onto them:
 *   paid → ordered · making → being made · preparing / ready → packed (or still being made for
 *   made to order) · shipped → on its way · delivered / completed → delivered.
 */
export type Stage = 'ordered' | 'making' | 'packed' | 'on_its_way' | 'delivered' | 'cancelled';

export interface ShipmentFacts {
  status: string;
  isMto: boolean;
  makerName: string;
  orderedAt: Date;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  estDispatch: Date | null;
  estFrom: Date | null;
  estTo: Date | null;
  carrier: string | null;
  /** Making time for made to order, in days. */
  leadDays: number | null;
}

export interface ProgressStep {
  key: 'ordered' | 'making' | 'packed' | 'on_its_way' | 'delivered';
  label: string;
  /** "Mon 19 Oct", "Day 8 of 14", "Est. Wed 4 – Fri 6 Nov". */
  detail: string;
  done: boolean;
  current: boolean;
}

/** Status dot colours: tan while being made or packed, ink on its way, subtle once delivered. */
export const STAGE_DOT: Record<Stage, string> = {
  ordered: '#C9A88A',
  making: '#C9A88A',
  packed: '#C9A88A',
  on_its_way: '#111111',
  delivered: '#6B6762',
  cancelled: '#6B6762',
};

export const STAGE_LABEL: Record<Stage, string> = {
  ordered: 'Ordered',
  making: 'Being made',
  packed: 'Packed',
  on_its_way: 'On its way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export function stageOf(status: string, isMto: boolean): Stage {
  switch (status) {
    case 'making':
      return 'making';
    case 'preparing':
    case 'ready':
      return isMto ? 'making' : 'packed';
    case 'shipped':
      return 'on_its_way';
    case 'delivered':
    case 'completed':
    // A reported problem: only possible once it has arrived.
    case 'issue':
      return 'delivered';
    case 'cancelled':
    case 'refunded':
      return 'cancelled';
    default:
      return 'ordered';
  }
}

const DAY = 86_400_000;
const short = (d: Date) =>
  new Date(d)
    .toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'Australia/Melbourne',
    })
    .replace(',', '');

/** "Day 8 of 14" while a made-to-order piece is being made. */
export function makingDay(orderedAt: Date, leadDays: number | null, now = new Date()): string {
  const lead = Math.max(1, leadDays ?? 14);
  const day = Math.min(
    lead,
    Math.max(1, Math.floor((now.getTime() - new Date(orderedAt).getTime()) / DAY) + 1),
  );
  return `Day ${day} of ${lead}`;
}

export function progressSteps(f: ShipmentFacts, now = new Date()): ProgressStep[] {
  const stage = stageOf(f.status, f.isMto);
  const order: ProgressStep['key'][] = [
    'ordered',
    f.isMto ? 'making' : 'packed',
    'on_its_way',
    'delivered',
  ];
  const at = order.indexOf(stage === 'cancelled' ? 'ordered' : (stage as ProgressStep['key']));
  // Made to order shows "Being made" as current straight after ordering.
  const currentIndex = f.isMto && stage === 'ordered' ? 1 : at;
  const est =
    f.estFrom && f.estTo
      ? `Est. ${formatArrival(new Date(f.estFrom), new Date(f.estTo))}`
      : 'Estimate to come';
  return order.map((key, i) => {
    let detail = '';
    if (key === 'ordered') detail = short(f.orderedAt);
    if (key === 'making')
      detail = i < currentIndex ? 'Made' : makingDay(f.orderedAt, f.leadDays, now);
    if (key === 'packed')
      detail =
        i <= currentIndex && stage !== 'ordered'
          ? 'Ready to send'
          : f.estDispatch
            ? `By ${short(f.estDispatch)}`
            : '';
    if (key === 'on_its_way')
      detail = f.shippedAt
        ? short(f.shippedAt)
        : f.estDispatch
          ? `From ${short(f.estDispatch)}`
          : '';
    if (key === 'delivered') detail = f.deliveredAt ? short(f.deliveredAt) : est;
    return {
      key,
      label: STAGE_LABEL[key],
      detail,
      done: i < currentIndex || (i === currentIndex && key === 'delivered'),
      current: i === currentIndex,
    };
  });
}

/** The human line in the stone box under each parcel. */
export function humanNote(f: ShipmentFacts): string {
  const stage = stageOf(f.status, f.isMto);
  const m = f.makerName;
  switch (stage) {
    case 'ordered':
      return f.isMto
        ? `${m} starts making yours this week. They’ll message you if they have a question about your measurements.`
        : `${m} has your order and is getting it ready to send.`;
    case 'making':
      return `${m} is cutting yours now. They’ll message you if they have a question about your measurements.`;
    case 'packed':
      return `${m} has packed it and will send it${f.estDispatch ? ` by ${short(f.estDispatch)}` : ' soon'}.`;
    case 'on_its_way':
      return `It’s on its way${f.carrier ? ` with ${f.carrier}` : ''}. Tracking updates can take a day to appear.`;
    case 'delivered':
      if (f.status === 'issue')
        return `You’ve reported a problem. ${m} will reply in your messages, and One Off steps in if you can’t agree.`;
      return 'Delivered. We hope you love it. Something not right? Use “Report a problem” and we’ll sort it out with the maker.';
    default:
      return 'This part of your order was cancelled. Any refund goes back to how you paid.';
  }
}
