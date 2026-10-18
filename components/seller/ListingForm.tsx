'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { saveListingAction } from '@/lib/actions/seller';
import { PRODUCT_CATEGORIES, type FormState } from '@/lib/validation';
import { CloseIcon, ImageIcon } from '@/components/ui/icons';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Field, FormAlert, Input, Select, TextArea } from '@/components/ui/Field';

const ALL_SIZES = ['6', '8', '10', '12', '14', '16', '18', '20', '22', 'One size'];
const TYPES = [
  { v: 'ready_to_ship', l: 'Ready to ship', d: 'Already made and in stock' },
  { v: 'made_to_order', l: 'Made to order', d: 'Made after purchase — needs a lead time' },
  { v: 'one_of_one', l: 'One of one', d: 'A single unique piece (stock of 1)' },
] as const;

export interface ListingDefaults {
  productId?: string;
  title?: string;
  description?: string;
  category?: string;
  tags?: string;
  price?: string;
  productType?: 'ready_to_ship' | 'made_to_order' | 'one_of_one';
  sizes?: string[];
  colours?: string;
  stock?: string;
  fabricComposition?: string;
  careInstructions?: string;
  countryOfMaking?: string;
  modelHeightCm?: string;
  modelSizeWorn?: string;
  leadTimeDays?: string;
  madeToOrderOptions?: string;
  shippingPolicy?: string;
  measurements?: Array<{ name: string; valueCm: string }>;
  images?: Array<{ url: string; alt: string }>;
  status?: string;
}

export function ListingForm({
  defaults = {},
  canSubmit,
}: {
  defaults?: ListingDefaults;
  canSubmit: boolean;
}) {
  const [state, action] = useFormState<FormState, FormData>(saveListingAction, undefined);
  const [type, setType] = useState(defaults.productType ?? 'ready_to_ship');
  const [sizes, setSizes] = useState<string[]>(defaults.sizes ?? []);
  const [images, setImages] = useState(defaults.images ?? []);
  const [measurements, setMeasurements] = useState(
    defaults.measurements?.length
      ? defaults.measurements
      : [
          { name: 'Bust', valueCm: '' },
          { name: 'Waist', valueCm: '' },
          { name: 'Hips', valueCm: '' },
          { name: 'Length', valueCm: '' },
        ],
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const e = state?.errors ?? {};

  async function upload(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    setUploadError(null);
    const next = [...images];
    for (const f of Array.from(files).slice(0, 8 - images.length)) {
      const body = new FormData();
      body.set('file', f);
      body.set('kind', 'products');
      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && json.url) next.push({ url: json.url, alt: '' });
      else setUploadError(json.error ?? 'Upload failed');
    }
    setImages(next);
    setUploading(false);
  }

  return (
    <form action={action} className="space-y-8">
      {defaults.productId && <input type="hidden" name="productId" value={defaults.productId} />}
      <input type="hidden" name="sizes" value={sizes.join(',')} />

      <section className="space-y-4">
        <h2 className="font-sans text-base font-semibold">Type</h2>
        <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Listing type">
          {TYPES.map((t) => (
            <label
              key={t.v}
              className={`cursor-pointer rounded-xl border p-3 text-sm ${type === t.v ? 'border-ink bg-white' : 'border-stone bg-white/60'}`}
            >
              <input
                type="radio"
                name="productType"
                value={t.v}
                checked={type === t.v}
                onChange={() => setType(t.v)}
                className="sr-only"
              />
              <span className="block font-medium">{t.l}</span>
              <span className="text-ink-muted">{t.d}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-sans text-base font-semibold">Photos</h2>
        <p className="text-sm text-ink-muted">
          Up to 8 photos (JPEG, PNG or WebP, max 8 MB). Describe each one for shoppers using screen
          readers.
        </p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="list">
          {images.map((img, i) => (
            <li key={img.url} className="space-y-1.5">
              <input type="hidden" name="imageUrl" value={img.url} />
              <div className="relative aspect-4/5 overflow-hidden rounded-lg bg-stone-light">
                <img
                  src={img.url}
                  alt={img.alt || `Photo ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => setImages(images.filter((x) => x.url !== img.url))}
                  className="absolute right-1 top-1 rounded-full bg-white/90 p-1"
                >
                  <CloseIcon width={14} height={14} />
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded bg-white/90 px-1.5 text-[10px]">
                    Cover
                  </span>
                )}
              </div>
              <input
                name="imageAlt"
                aria-label={`Description for photo ${i + 1}`}
                value={img.alt}
                onChange={(ev) =>
                  setImages(
                    images.map((x) => (x.url === img.url ? { ...x, alt: ev.target.value } : x)),
                  )
                }
                placeholder="e.g. Front view, sage linen"
                className="input py-1.5 text-xs"
                required
                maxLength={200}
              />
            </li>
          ))}
          {images.length < 8 && (
            <li>
              <label className="flex aspect-4/5 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-stone-dark text-sm text-ink-muted hover:border-ink">
                <ImageIcon />
                {uploading ? 'Uploading…' : 'Add photos'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="sr-only"
                  onChange={(ev) => upload(ev.target.files)}
                />
              </label>
            </li>
          )}
        </ul>
        {uploadError && <p className="text-sm text-alert">{uploadError}</p>}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-sans text-base font-semibold sm:col-span-2">Details</h2>
        <div className="sm:col-span-2">
          <Field label="Title" name="title" error={e.title}>
            <Input name="title" defaultValue={defaults.title} required maxLength={120} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Description" name="description" error={e.description}>
            <TextArea
              name="description"
              defaultValue={defaults.description}
              rows={6}
              required
              maxLength={5000}
            />
          </Field>
        </div>
        <Field label="Category" name="category" error={e.category}>
          <Select name="category" defaultValue={defaults.category ?? 'dresses'}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c[0]!.toUpperCase() + c.slice(1)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Price (A$)" name="price" error={e.price}>
          <Input
            name="price"
            type="number"
            min={1}
            step="0.01"
            inputMode="decimal"
            defaultValue={defaults.price}
            required
          />
        </Field>
        <Field
          label="Tags"
          name="tags"
          hint="Comma separated, e.g. wedding-guest, linen"
          error={e.tags}
        >
          <Input name="tags" defaultValue={defaults.tags} />
        </Field>
        <Field
          label="Colours"
          name="colours"
          hint="Comma separated, e.g. Sage, Rust"
          error={e.colours}
        >
          <Input name="colours" defaultValue={defaults.colours} required />
        </Field>
      </section>

      <section className="space-y-4">
        <h2 className="font-sans text-base font-semibold">Sizes & stock</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Sizes">
          {ALL_SIZES.map((s) => {
            const on = sizes.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setSizes(
                    type === 'one_of_one'
                      ? on
                        ? []
                        : [s]
                      : on
                        ? sizes.filter((x) => x !== s)
                        : [...sizes, s],
                  )
                }
                className={`rounded-full border px-4 py-2 text-sm ${on ? 'border-ink bg-ink text-paper' : 'border-stone bg-white'}`}
              >
                {s}
              </button>
            );
          })}
        </div>
        {e.sizes && <p className="text-sm text-alert">{e.sizes}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={type === 'made_to_order' ? 'Capacity per size' : 'Stock per size'}
            name="stock"
            error={e.stock}
            hint={
              type === 'one_of_one'
                ? 'One-of-one pieces always have a stock of 1.'
                : type === 'made_to_order'
                  ? 'How many you can make before the listing pauses.'
                  : undefined
            }
          >
            <Input
              name="stock"
              type="number"
              min={0}
              max={999}
              defaultValue={type === 'one_of_one' ? '1' : (defaults.stock ?? '3')}
              readOnly={type === 'one_of_one'}
              key={type}
            />
          </Field>
          {type === 'made_to_order' && (
            <Field label="Production lead time (days)" name="leadTimeDays" error={e.leadTimeDays}>
              <Input
                name="leadTimeDays"
                type="number"
                min={1}
                max={120}
                defaultValue={defaults.leadTimeDays}
                required
              />
            </Field>
          )}
        </div>
        {type === 'made_to_order' && (
          <Field
            label="Made-to-order options"
            name="madeToOrderOptions"
            hint="e.g. Length adjustments, alternative fabrics"
            error={e.madeToOrderOptions}
          >
            <TextArea
              name="madeToOrderOptions"
              defaultValue={defaults.madeToOrderOptions}
              rows={2}
              maxLength={500}
            />
          </Field>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-sans text-base font-semibold sm:col-span-2">Fabric, care & fit</h2>
        <Field label="Fabric composition" name="fabricComposition" error={e.fabricComposition}>
          <Input
            name="fabricComposition"
            defaultValue={defaults.fabricComposition}
            required
            placeholder="e.g. 100% European linen"
          />
        </Field>
        <Field label="Country of making" name="countryOfMaking" error={e.countryOfMaking}>
          <Input name="countryOfMaking" defaultValue={defaults.countryOfMaking ?? 'Australia'} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Care instructions" name="careInstructions" error={e.careInstructions}>
            <TextArea
              name="careInstructions"
              defaultValue={defaults.careInstructions}
              rows={2}
              required
            />
          </Field>
        </div>
        <Field label="Model height (cm)" name="modelHeightCm" error={e.modelHeightCm}>
          <Input
            name="modelHeightCm"
            type="number"
            min={100}
            max={230}
            defaultValue={defaults.modelHeightCm}
          />
        </Field>
        <Field label="Size worn by model" name="modelSizeWorn" error={e.modelSizeWorn}>
          <Input name="modelSizeWorn" defaultValue={defaults.modelSizeWorn} maxLength={12} />
        </Field>
        <div className="sm:col-span-2">
          <p className="label">Garment measurements (cm)</p>
          <div className="space-y-2">
            {measurements.map((m, i) => (
              <div key={i} className="flex gap-2">
                <input
                  name="measurementName"
                  aria-label={`Measurement ${i + 1} name`}
                  value={m.name}
                  onChange={(ev) =>
                    setMeasurements(
                      measurements.map((x, k) => (k === i ? { ...x, name: ev.target.value } : x)),
                    )
                  }
                  className="input"
                />
                <input
                  name="measurementValue"
                  aria-label={`Measurement ${i + 1} value in cm`}
                  type="number"
                  step="0.5"
                  min={0}
                  value={m.valueCm}
                  onChange={(ev) =>
                    setMeasurements(
                      measurements.map((x, k) =>
                        k === i ? { ...x, valueCm: ev.target.value } : x,
                      ),
                    )
                  }
                  className="input w-28"
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => setMeasurements([...measurements, { name: '', valueCm: '' }])}
              className="text-sm underline underline-offset-4"
            >
              Add measurement
            </button>
          </div>
        </div>
        <div className="sm:col-span-2">
          <Field label="Shipping notes (optional)" name="shippingPolicy" error={e.shippingPolicy}>
            <Input name="shippingPolicy" defaultValue={defaults.shippingPolicy} maxLength={500} />
          </Field>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-stone bg-paper/95 px-4 py-3 backdrop-blur">
        <FormAlert message={state?.message} tone={state?.ok ? 'success' : 'error'} />
        <SubmitButton name="intent" value="draft" variant="secondary">
          Save draft
        </SubmitButton>
        {canSubmit && defaults.status !== 'approved' && defaults.status !== 'pending' && (
          <SubmitButton name="intent" value="submit">
            Submit for review
          </SubmitButton>
        )}
        {defaults.status === 'approved' && (
          <SubmitButton name="intent" value="draft">
            Save changes
          </SubmitButton>
        )}
        {!canSubmit && (
          <p className="text-xs text-ink-muted">
            You can submit listings for review once your maker profile is approved.
          </p>
        )}
      </div>
    </form>
  );
}
