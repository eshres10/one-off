'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { makingStepAction, shipmentStageAction } from '@/lib/actions/studio-orders';
import { milestoneAction } from '@/lib/actions/custom-studio';
import { progressPhotoAction } from '@/lib/actions/studio-phone';
import { popScreen } from '@/lib/app/nav';
import { stepsOf } from '@/lib/app/studio-orders';
import { formatPrice } from '@/lib/domain/money';
import type { StudioOrderDetail } from '@/lib/services/studio-orders';
import { dayLabel, daysUntil, shipByLabel } from '@/lib/studio/format';
import { Img as Image } from '@/components/ui/Img';
import { CameraIcon, CheckIcon, ChevronIcon } from '@/components/ui/icons';
import { ShipSheet } from './ShipSheet';
import { AppButton } from '../ui';
import { toast } from '../Toast';
import { buzz } from '../Heart';

const TYPE: Record<string, string> = {
  ready_to_ship: 'Ready to ship',
  made_to_order: 'Made to order',
  one_of_one: 'One of one',
};

/**
 * One order on a phone: the piece and buyer, the due banner, the step timeline, the buyer's
 * measurements when there are any, and a sticky bar with the camera and the next step.
 */
export function PhoneOrderDetail({
  order,
  openPhoto = false,
}: {
  order: StudioOrderDetail;
  openPhoto?: boolean;
}) {
  const router = useRouter();
  const [ship, setShip] = useState(false);
  const [pending, start] = useTransition();
  const [sending, setSending] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const steps = stepsOf(order);
  const d = daysUntil(order.shipBy);
  const open = steps.next !== null;
  const due = open && d !== null && d <= 0;
  const measurements = order.items.find((i) => i.customMeasurements)?.customMeasurements ?? null;

  useEffect(() => {
    if (openPhoto) camera.current?.click();
  }, [openPhoto]);

  const advance = () => {
    const n = steps.next;
    if (!n) return;
    if (n.kind === 'ship') {
      setShip(true);
      return;
    }
    start(async () => {
      const fd = new FormData();
      let res;
      if (n.kind === 'making') {
        fd.set('fulfilmentId', order.id);
        fd.set('step', String(n.value));
        res = await makingStepAction(undefined, fd);
      } else if (n.kind === 'packed') {
        fd.set('fulfilmentId', order.id);
        fd.set('stage', 'packed');
        res = await shipmentStageAction(undefined, fd);
      } else {
        fd.set('orderId', order.orderId);
        fd.set('key', String(n.value));
        res = await milestoneAction(undefined, fd);
      }
      if (res?.ok === false) toast(res.message ?? 'Couldn’t save that.');
      else {
        buzz();
        toast(`${steps.labels[steps.current + 1] ?? 'Done'} · the buyer knows`);
        router.refresh();
      }
    });
  };

  async function onPhoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setSending(true);
    try {
      const fd = new FormData();
      fd.set('kind', 'messages');
      fd.set('file', file);
      const up = await fetch('/api/uploads', { method: 'POST', body: fd });
      const json = (await up.json()) as { url?: string; error?: string };
      if (!up.ok || !json.url) throw new Error(json.error ?? 'Upload failed.');
      const res = await progressPhotoAction({ fulfilmentId: order.id, imageUrl: json.url });
      if (res?.ok === false) throw new Error(res.message ?? 'Couldn’t send.');
      toast('Photo sent to the buyer');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Couldn’t send the photo.');
    } finally {
      setSending(false);
    }
  }

  const to = order.shipTo ?? {};
  const banner = order.shipBy
    ? `${due ? 'Due' : 'Ship by'} ${dayLabel(order.shipBy)}${d !== null && d <= 7 ? ` · ${shipByLabel(order.shipBy)}` : ''}`
    : 'No due date yet';
  return (
    <div className="pb-[100px]" data-testid="phone-order-detail">
      <div className="-mx-4 flex h-[52px] items-center px-1">
        <button
          type="button"
          onClick={() => popScreen(router, '/studio/orders')}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center"
          data-testid="bar-back"
        >
          <ChevronIcon dir="left" width={20} height={20} strokeWidth={1.6} />
        </button>
        <span className="text-[15px]">Order #{order.orderNumber.replace(/^OO-/, '')}</span>
      </div>

      <section
        className="rounded-app bg-surface p-3"
        aria-label="The piece"
        data-testid="order-piece-card"
      >
        {order.items.map((i) => (
          <div key={i.id} className="flex gap-3">
            <span className="relative h-[90px] w-[72px] shrink-0 overflow-hidden rounded-[6px] bg-stone">
              {i.imageUrl && (
                <Image
                  src={i.imageUrl}
                  alt=""
                  fill
                  sizes="72px"
                  className="object-cover object-top"
                />
              )}
            </span>
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="text-[15px]">{i.title}</p>
              <p className="text-muted">
                {i.variantLabel.replace(/^AU /, 'Size ')}
                {i.quantity > 1 ? ` × ${i.quantity}` : ''} · {TYPE[i.productType]}
              </p>
              <p className="mt-1 text-muted">{formatPrice(i.lineTotalCents)}</p>
              {i.noteToMaker && (
                <p className="mt-1.5 rounded-[6px] bg-stone px-2 py-1 text-[12px]">
                  “{i.noteToMaker}”
                </p>
              )}
            </div>
          </div>
        ))}
        <div className="mt-3 border-t border-line pt-3 text-[13px]">
          <p>{order.buyerName ?? 'Guest'}</p>
          <p className="text-muted">{[to.city, to.state].filter(Boolean).join(' ')}</p>
          {order.giftNote && (
            <p className="mt-1 text-[12px] text-muted">Gift note: “{order.giftNote}”</p>
          )}
        </div>
      </section>

      {open && (
        <p
          className={`mt-3 rounded-app px-4 py-3 text-[13px] ${due ? 'bg-[#8A2E1C] text-ground' : 'bg-stone'}`}
          data-testid="due-banner"
        >
          {banner}
        </p>
      )}

      <section className="mt-5" aria-label="Progress">
        <ol className="relative ml-2 border-l border-line pl-5" data-testid="order-timeline">
          {steps.labels.map((label, i) => {
            const done = i <= steps.current;
            const current = i === steps.current;
            return (
              <li
                key={label}
                className="relative pb-5 last:pb-0"
                data-done={done ? '' : undefined}
                data-testid="timeline-step"
              >
                <span
                  aria-hidden
                  className={`absolute -left-[27px] top-0 flex h-4 w-4 items-center justify-center rounded-circle border ${done ? 'border-ink bg-ink text-ground' : 'border-line-strong bg-ground'}`}
                >
                  {done && <CheckIcon width={10} height={10} />}
                </span>
                <span
                  className={`block text-[14px] ${current ? 'font-medium' : done ? '' : 'text-muted-2'}`}
                >
                  {label}
                </span>
                {current && open && (
                  <span className="block text-[12px] text-muted">Where it is now</span>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      {measurements && (
        <section
          className="mt-5 rounded-app bg-surface p-4"
          aria-label="The buyer's measurements"
          data-testid="buyer-measurements"
        >
          <p className="text-[11px] uppercase tracking-label text-muted-2">Their measurements</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
            {Object.entries(measurements).map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-line py-1">
                <dt className="capitalize text-muted">{k.replace(/_/g, ' ')}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {order.trackingNumber && (
        <p className="mt-5 text-[13px] text-muted">
          Sent with {order.carrier} · {order.trackingNumber}
        </p>
      )}
      {order.buyerUserId && (
        <Link
          href="/studio/messages"
          className="mt-3 inline-flex min-h-[44px] items-center text-[13px] underline underline-offset-[4px]"
        >
          Message {order.buyerName?.split(' ')[0] ?? 'the buyer'}
        </Link>
      )}

      {open && (
        <div
          className="glass-nav fixed inset-x-0 bottom-0 z-40 flex gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden"
          data-testid="order-bar"
        >
          <button
            type="button"
            onClick={() => camera.current?.click()}
            disabled={sending || !order.buyerUserId}
            aria-label="Send a progress photo"
            data-testid="progress-photo"
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-app border border-ink disabled:opacity-40"
          >
            <CameraIcon width={22} height={22} />
          </button>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onPhoto(e.target.files)}
          />
          <AppButton
            onClick={advance}
            disabled={pending}
            className="flex-1"
            data-testid="next-step"
          >
            {pending ? 'Saving…' : steps.next?.label}
          </AppButton>
        </div>
      )}
      <ShipSheet
        open={ship}
        onOpenChange={setShip}
        fulfilmentId={order.id}
        onShipped={() => router.refresh()}
      />
    </div>
  );
}
