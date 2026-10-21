'use client';

import { useRef, useState, useTransition } from 'react';
import { shipOrderAction } from '@/lib/actions/studio-orders';
import { progressPhotoAction } from '@/lib/actions/studio-phone';
import { SITE } from '@/lib/site/config';
import { CameraIcon } from '@/components/ui/icons';
import { Sheet } from '../Sheet';
import { AppButton, Chip } from '../ui';
import { toast } from '../Toast';

const CARRIERS = [
  { value: 'auspost', label: 'Australia Post' },
  { value: 'sendle', label: 'Sendle' },
  { value: 'hand', label: 'Hand delivered' },
] as const;

type Detector = { detect: (src: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> };

/**
 * The ship sheet: "I'll post it myself" (carrier, a tracking number that can be scanned with the
 * camera where the browser can read barcodes, an optional parcel photo) or a prepaid Australia
 * Post label behind SITE.shipping.auspostLabels ("Coming soon" until then). "Mark as shipped"
 * sends the tracking to the buyer.
 */
export function ShipSheet({
  open,
  onOpenChange,
  fulfilmentId,
  onShipped,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  fulfilmentId: string;
  onShipped: () => void;
}) {
  const [method, setMethod] = useState<'self' | 'label'>('self');
  const [carrier, setCarrier] = useState<string>('auspost');
  const [tracking, setTracking] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scan = useRef<HTMLInputElement>(null);
  const parcel = useRef<HTMLInputElement>(null);
  const canScan = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  async function onScan(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const Ctor = (
        window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }
      ).BarcodeDetector;
      const det = new Ctor({ formats: ['code_128', 'code_39', 'qr_code', 'ean_13'] });
      const bitmap = await createImageBitmap(file);
      const codes = await det.detect(bitmap);
      if (codes[0]?.rawValue) {
        setTracking(codes[0].rawValue);
        toast('Tracking number read');
      } else toast('Couldn’t read a barcode. Type it in.');
    } catch {
      toast('Couldn’t read a barcode. Type it in.');
    }
  }

  async function onParcel(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set('kind', 'messages');
    fd.set('file', file);
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: fd });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed.');
      setPhoto(json.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    }
  }

  const ship = () =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set('fulfilmentId', fulfilmentId);
      fd.set('carrier', carrier);
      fd.set('trackingNumber', tracking);
      const res = await shipOrderAction(undefined, fd);
      if (!res?.ok) {
        setError(res?.errors?.carrier ?? res?.message ?? 'Couldn’t mark it shipped.');
        return;
      }
      if (photo)
        await progressPhotoAction({
          fulfilmentId,
          imageUrl: photo,
          note: 'Packed and on its way.',
        });
      toast(res.message ?? 'Shipped');
      onOpenChange(false);
      onShipped();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Ship it"
      testId="ship-sheet"
      footer={
        <>
          <AppButton
            onClick={ship}
            disabled={pending || method === 'label'}
            className="w-full"
            data-testid="mark-shipped-phone"
          >
            {pending ? 'Sending…' : 'Mark as shipped'}
          </AppButton>
          {error && (
            <p className="mt-2 text-[12px] text-error" role="alert">
              {error}
            </p>
          )}
        </>
      }
    >
      <div className="flex gap-2" role="tablist" aria-label="How">
        <Chip pressed={method === 'self'} onClick={() => setMethod('self')} testId="ship-self">
          I’ll post it myself
        </Chip>
        <Chip pressed={method === 'label'} onClick={() => setMethod('label')} testId="ship-label">
          Prepaid Australia Post label
        </Chip>
      </div>
      {method === 'label' ? (
        <div
          className="mt-5 rounded-app bg-stone px-4 py-5 text-[13px]"
          data-testid="label-coming-soon"
        >
          <p className="font-display text-[22px]">Coming soon</p>
          <p className="mt-1 text-muted">
            {SITE.shipping.auspostLabels
              ? 'Prepaid labels are being connected.'
              : 'Prepaid labels arrive once we connect Australia Post. Post it yourself for now.'}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-5 text-[11px] uppercase tracking-label text-muted-2">Sent with</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Carrier">
            {CARRIERS.map((c) => (
              <Chip
                key={c.value}
                pressed={carrier === c.value}
                onClick={() => setCarrier(c.value)}
                testId={`carrier-${c.value}`}
              >
                {c.label}
              </Chip>
            ))}
          </div>
          {carrier !== 'hand' && (
            <>
              <label
                htmlFor="tracking"
                className="mt-5 block text-[11px] uppercase tracking-label text-muted-2"
              >
                Tracking number
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="tracking"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                  autoCapitalize="characters"
                  autoComplete="off"
                  placeholder="e.g. 33ABC1234567"
                  data-testid="tracking-input"
                  className="h-12 min-w-0 flex-1 rounded-app border border-line bg-surface px-3 text-[16px] uppercase focus:border-ink focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => scan.current?.click()}
                  aria-label="Scan the barcode"
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-app border border-line bg-surface"
                >
                  <CameraIcon width={20} height={20} />
                </button>
                <input
                  ref={scan}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => onScan(e.target.files)}
                />
              </div>
              {!canScan && (
                <p className="mt-1 text-[11px] text-muted-2">
                  Scanning needs a newer phone browser; typing works everywhere.
                </p>
              )}
            </>
          )}
          <p className="mt-5 text-[11px] uppercase tracking-label text-muted-2">
            Parcel photo (optional)
          </p>
          <button
            type="button"
            onClick={() => parcel.current?.click()}
            className="mt-2 flex min-h-[48px] w-full items-center gap-3 rounded-app border border-dashed border-line-strong px-4 text-[13px]"
            data-testid="parcel-photo"
          >
            <CameraIcon width={18} height={18} />
            {photo
              ? 'Photo attached · sent to the buyer with the tracking'
              : 'Add a photo of the parcel'}
          </button>
          <input
            ref={parcel}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => onParcel(e.target.files)}
          />
        </>
      )}
    </Sheet>
  );
}
