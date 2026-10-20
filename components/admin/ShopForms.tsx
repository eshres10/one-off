'use client';

import { BRAND } from '@/lib/brand';
import { useFormState, useFormStatus } from 'react-dom';
import { createShopAction, sendInviteAction } from '@/lib/actions/concierge';
import type { FormState } from '@/lib/validation';
import { ImageUploader } from '@/components/forms/ImageUploader';

function Submit({ children, testId }: { children: React.ReactNode; testId?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="glass-dark min-h-[48px] px-6 text-[11px] uppercase tracking-[0.18em] disabled:opacity-60"
      data-testid={testId}
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

export function CreateShopForm({ defaults }: { defaults: Record<string, string> }) {
  const [state, action] = useFormState<FormState, FormData>(createShopAction, undefined);
  const field = (name: string, label: string, props: Record<string, unknown> = {}) => (
    <div>
      <label htmlFor={`shop-${name}`} className="label">
        {label}
      </label>
      <input
        id={`shop-${name}`}
        name={name}
        className="input"
        defaultValue={defaults[name] ?? ''}
        {...props}
      />
    </div>
  );
  return (
    <form action={action} className="max-w-2xl space-y-5" data-testid="create-shop">
      {state?.ok === false && (
        <p role="alert" className="bg-error-bg px-3 py-2 text-[13px] text-alert">
          {state.message}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        {field('name', 'Shop name', { required: true })}
        {field('slug', `Shop link (${BRAND.domain}/makers/…)`, { placeholder: 'from the name' })}
        {field('suburb', 'Suburb')}
        <div>
          <label htmlFor="shop-state" className="label">
            State
          </label>
          <select id="shop-state" name="state" className="input" defaultValue="VIC">
            {['VIC', 'NSW', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        {field('instagram', 'Instagram', { placeholder: '@handle' })}
        {field('email', 'Maker’s email (for the invite)', { type: 'email', required: true })}
      </div>
      {field('tagline', 'Short line', { maxLength: 80 })}
      <div>
        <label htmlFor="shop-story" className="label">
          Story (their maker page)
        </label>
        <textarea
          id="shop-story"
          name="story"
          className="input min-h-[140px]"
          defaultValue={defaults.story ?? ''}
        />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="label">Avatar</p>
          <ImageUploader name="avatarUrl" kind="makers" max={1} label="Upload avatar" />
        </div>
        <div>
          <p className="label">Banner</p>
          <ImageUploader name="bannerUrl" kind="makers" max={1} label="Upload banner" />
        </div>
      </div>
      <Submit testId="create-shop-submit">Create draft shop</Submit>
    </form>
  );
}

export function SendInviteForm({ makerId, label }: { makerId: string; label: string }) {
  const [state, action] = useFormState(sendInviteAction, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="makerId" value={makerId} />
      <Submit testId="send-invite">{label}</Submit>
      {state?.ok === false && (
        <p role="alert" className="text-[13px] text-alert">
          {state.message}
        </p>
      )}
      {state?.ok && state.url && (
        <div className="bg-stone p-3 text-[13px]" role="status" data-testid="invite-link">
          Sent. The link (single use, 7 days) if you’d rather DM it:
          <input
            readOnly
            value={state.url}
            className="input mt-2 font-mono text-[12px]"
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Invite link"
          />
        </div>
      )}
    </form>
  );
}
