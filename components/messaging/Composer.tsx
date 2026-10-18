'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { moderateMessage, MODERATION_MESSAGES } from '@/lib/domain/moderation';
import { messageSchema, PRESET_QUESTIONS, type FormState } from '@/lib/validation';
import { ImageUploader } from '@/components/forms/ImageUploader';

function Send({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="h-11 rounded-full bg-ink px-6 text-sm font-medium text-paper disabled:bg-ink-muted"
    >
      {pending ? 'Sending…' : 'Send'}
    </button>
  );
}

export function Composer({
  action,
  hidden,
  presets = false,
  templates = [],
  placeholder = 'Write a message…',
  onSent,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  hidden: Record<string, string>;
  presets?: boolean;
  templates?: Array<{ title: string; body: string }>;
  placeholder?: string;
  onSent?: () => void;
}) {
  const [state, formAction] = useFormState(action, undefined);
  const [body, setBody] = useState('');
  const [needsDate, setNeedsDate] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      setBody('');
      setUploaderKey((k) => k + 1);
      onSent?.();
    }
  }, [state, onSent]);

  // Client-side checks mirror the server: length via Zod and the same moderation rules.
  const check = messageSchema.safeParse({ body, imageUrls: [] });
  const moderation = body.trim() ? moderateMessage(body) : { allowed: true, reasons: [] };
  const warning = moderation.allowed
    ? null
    : moderation.reasons.map((r) => MODERATION_MESSAGES[r]).join(' ');

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {presets && (
        <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
          {PRESET_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                if (q.includes('[date]')) {
                  setNeedsDate(true);
                  setBody('When would this arrive by ');
                } else {
                  setNeedsDate(false);
                  setBody(q);
                }
                area.current?.focus();
              }}
              className="rounded-full border border-stone bg-white px-3 py-1.5 text-[13px] hover:border-ink"
            >
              {q}
            </button>
          ))}
        </div>
      )}
      {needsDate && (
        <label className="flex items-center gap-2 text-sm">
          Needed by
          <input
            type="date"
            className="input w-auto py-1.5"
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => {
              const d = e.target.value ? new Date(`${e.target.value}T00:00:00`) : null;
              if (d)
                setBody(
                  `When would this arrive by ${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' })}?`,
                );
            }}
          />
        </label>
      )}
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Saved replies">
          {templates.map((t) => (
            <button
              key={t.title}
              type="button"
              onClick={() => setBody(t.body)}
              className="rounded-full bg-stone-light px-3 py-1.5 text-[13px] hover:bg-stone"
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="message-body" className="sr-only">
        Message
      </label>
      <textarea
        id="message-body"
        ref={area}
        name="body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={placeholder}
        className="input"
        aria-invalid={warning ? true : undefined}
        aria-describedby="composer-feedback"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ImageUploader key={uploaderKey} kind="messages" max={4} label="Attach photos" />
        <Send disabled={!check.success || Boolean(warning)} />
      </div>
      <div id="composer-feedback" aria-live="polite">
        {warning && (
          <p className="rounded-lg bg-alert-light px-3 py-2 text-sm text-alert">
            {warning} For buyer protection, complete purchases through the platform.
          </p>
        )}
        {state?.ok === false && (state.message || state.errors?.body) && (
          <p className="rounded-lg bg-alert-light px-3 py-2 text-sm text-alert" role="alert">
            {state.message ?? state.errors?.body}
          </p>
        )}
      </div>
    </form>
  );
}
