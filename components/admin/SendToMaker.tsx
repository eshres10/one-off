'use client';

import { useFormState } from 'react-dom';
import { sendToMakerAction } from '@/lib/actions/help-requests';
import type { FormState } from '@/lib/validation';

/** "Send to a maker": pick any live shop; it becomes a normal request for them. */
export function SendToMaker({
  id,
  shops,
}: {
  id: string;
  shops: Array<{ id: string; name: string; suburb: string | null; open: boolean }>;
}) {
  const [state, action] = useFormState<FormState, FormData>(sendToMakerAction, undefined);
  return (
    <form
      action={action}
      className="mt-3 flex flex-wrap items-end gap-2"
      data-testid="send-to-maker"
    >
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-1 text-[11px] uppercase tracking-label text-muted-2">
        Send to a maker
        <select
          name="makerId"
          className="input min-h-[44px] min-w-[260px] normal-case tracking-normal"
          defaultValue=""
          data-testid="send-to-maker-select"
        >
          <option value="" disabled>
            Choose a shop
          </option>
          {shops.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.suburb ? ` · ${s.suburb}` : ''}
              {s.open ? '' : ' (custom work off)'}
            </option>
          ))}
        </select>
      </label>
      <button
        className="min-h-[44px] border border-ink px-4 text-[11px] uppercase tracking-label"
        data-testid="send-to-maker-send"
      >
        Send
      </button>
      {state && (
        <p className={`basis-full text-[12px] ${state.ok ? '' : 'text-error'}`} role="status">
          {state.message}
        </p>
      )}
    </form>
  );
}
