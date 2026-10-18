'use client';

import { useFormState } from 'react-dom';
import { saveCollectionAction } from '@/lib/actions/admin';
import type { FormState } from '@/lib/validation';
import { SubmitButton } from '@/components/ui/SubmitButton';

export function CollectionForm({
  collection,
}: {
  collection?: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    description: string | null;
    sortOrder: number;
    isActive: boolean;
  };
}) {
  const [state, action] = useFormState<FormState, FormData>(saveCollectionAction, undefined);
  const e = state?.errors ?? {};
  return (
    <form action={action} className="grid gap-2 sm:grid-cols-6">
      {collection && <input type="hidden" name="id" value={collection.id} />}
      <input
        name="title"
        defaultValue={collection?.title}
        placeholder="Title"
        aria-label="Title"
        required
        className="input py-1.5 text-sm sm:col-span-2"
      />
      <input
        name="slug"
        defaultValue={collection?.slug}
        placeholder="url-slug"
        aria-label="URL slug"
        required
        className="input py-1.5 text-sm"
      />
      <input
        name="subtitle"
        defaultValue={collection?.subtitle ?? ''}
        placeholder="Subtitle"
        aria-label="Subtitle"
        className="input py-1.5 text-sm sm:col-span-2"
      />
      <input
        name="sortOrder"
        type="number"
        defaultValue={collection?.sortOrder ?? 0}
        aria-label="Sort order"
        className="input py-1.5 text-sm"
      />
      <textarea
        name="description"
        defaultValue={collection?.description ?? ''}
        placeholder="Description"
        aria-label="Description"
        rows={2}
        className="input text-sm sm:col-span-5"
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" name="isActive" defaultChecked={collection?.isActive ?? true} />{' '}
          Active
        </label>
        <SubmitButton size="sm" className="!h-8">
          {collection ? 'Save' : 'Create'}
        </SubmitButton>
      </div>
      {(state?.message || Object.keys(e).length > 0) && (
        <p className={`text-xs sm:col-span-6 ${state?.ok ? 'text-moss' : 'text-alert'}`}>
          {state?.message ?? Object.values(e).join(' ')}
        </p>
      )}
    </form>
  );
}
