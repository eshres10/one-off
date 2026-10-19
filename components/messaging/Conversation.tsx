'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { blockedMessage, moderateMessage } from '@/lib/domain/moderation';
import { formatPrice } from '@/lib/domain/money';
import { createSavedReplyAction, sendMessageAction } from '@/lib/actions/messages';
import type { QuoteSnapshot, ThreadMessage } from '@/lib/services/messaging';
import { messageSchema, type FormState } from '@/lib/validation';
import { CloseIcon, ImageIcon, PlusIcon, ShieldIcon } from '@/components/ui/icons';
import { QuotePanel } from './QuotePanel';

type Msg = Omit<ThreadMessage, 'createdAt'> & { createdAt: string | Date };

export const BUYER_CHIPS = [
  'What size should I get?',
  'Can you adjust the length?',
  'What fabric is it?',
  'When would it arrive?',
  'Can you send more photos?',
];

const dayLabel = (d: Date) => {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
};

export function SafetyNotice({ viewer }: { viewer: 'buyer' | 'maker' }) {
  return (
    <p className="flex items-start gap-2.5 bg-stone-light px-3.5 py-3 text-[12px] text-text2">
      <ShieldIcon width={15} height={15} className="mt-px shrink-0" />
      <span>
        {viewer === 'buyer'
          ? 'Pay through One Off and you’re covered by buyer protection. We’ll never ask you to pay by bank transfer.'
          : 'Keep sales on One Off. Contact details and payment links are blocked, and off-platform sales can get your shop paused.'}
      </span>
    </p>
  );
}

function QuoteCard({ quote, status }: { quote: QuoteSnapshot; status: string }) {
  const deposit = Math.round((quote.price_cents * quote.deposit_pct) / 100);
  return (
    <div className="w-[280px] max-w-full border border-ink bg-surface p-4" data-testid="quote-card">
      <p className="text-[11px] uppercase tracking-label">Quote sent · {status}</p>
      <dl className="mt-3 space-y-1.5 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-muted">Price</dt>
          <dd>{formatPrice(quote.price_cents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Deposit ({quote.deposit_pct}%)</dt>
          <dd>{formatPrice(deposit)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">Made in</dt>
          <dd>
            {quote.weeks} {quote.weeks === 1 ? 'week' : 'weeks'}
          </dd>
        </div>
      </dl>
      {quote.note && <p className="mt-3 border-t border-line pt-3 text-[13px]">{quote.note}</p>}
    </div>
  );
}

function SendButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      data-testid="send-message"
      className="glass-dark min-h-[48px] shrink-0 px-5 text-[11px] uppercase tracking-label disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? 'Sending…' : 'Send'}
    </button>
  );
}

function NewReplyModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, action] = useFormState<FormState, FormData>(createSavedReplyAction, undefined);
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-reply-title"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/30 md:items-center"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <form action={action} className="w-full max-w-md bg-ground p-5 md:p-6">
        <div className="flex items-start justify-between">
          <h2 id="new-reply-title" className="text-[28px] leading-none">
            New saved reply
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-m-2 flex h-11 w-11 items-center justify-center"
          >
            <CloseIcon width={16} height={16} />
          </button>
        </div>
        <label className="label mt-5" htmlFor="reply-title">
          Label
        </label>
        <input id="reply-title" name="title" maxLength={40} required className="input" autoFocus />
        {state?.errors?.title && (
          <p className="mt-1 text-[12px] text-error">{state.errors.title}</p>
        )}
        <label className="label mt-4" htmlFor="reply-body">
          Reply
        </label>
        <textarea
          id="reply-body"
          name="body"
          rows={4}
          maxLength={1000}
          required
          className="input"
        />
        {state?.errors?.body && <p className="mt-1 text-[12px] text-error">{state.errors.body}</p>}
        <button className="glass-dark mt-5 min-h-[48px] w-full text-[11px] uppercase tracking-label">
          Save reply
        </button>
      </form>
    </div>
  );
}

function Composer({
  threadId,
  viewer,
  chips,
  savedReplies,
  blocked,
  quote,
  onSent,
}: {
  threadId: string;
  viewer: 'buyer' | 'maker';
  chips: string[];
  savedReplies: Array<{ title: string; body: string }>;
  blocked: string | null;
  quote?: { requestId: string } | null;
  onSent: () => void;
}) {
  const [state, action] = useFormState<FormState, FormData>(sendMessageAction, undefined);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [newReply, setNewReply] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      setBody('');
      setPhotos([]);
      onSent();
    }
  }, [state, onSent]);

  const valid = messageSchema.safeParse({ body, imageUrls: [] }).success;
  const moderation = body.trim() ? moderateMessage(body) : { allowed: true, reasons: [] };
  const warning = !moderation.allowed ? blockedMessage(viewer) : null;
  const serverError = state?.ok === false ? (state.message ?? state.errors?.body) : null;

  async function attach(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setUploadError(null);
    const next = [...photos];
    for (const f of Array.from(files).slice(0, 4 - photos.length)) {
      const fd = new FormData();
      fd.set('file', f);
      fd.set('kind', 'messages');
      const res = await fetch('/api/uploads', { method: 'POST', body: fd }).catch(() => null);
      const json = res
        ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string })
        : {};
      if (res?.ok && json.url) next.push(json.url);
      else setUploadError(json.error ?? 'Upload failed.');
    }
    setPhotos(next);
    setUploading(false);
    if (file.current) file.current.value = '';
  }

  const chipClass =
    'min-h-[44px] shrink-0 border border-line-strong bg-surface px-3 text-[12px] hover:border-ink';

  if (blocked) return <p className="bg-stone-light px-4 py-3 text-[13px] text-muted">{blocked}</p>;

  return (
    <div className="space-y-2.5">
      {(chips.length > 0 || savedReplies.length > 0 || viewer === 'maker') && (
        <div
          className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3"
          aria-label={viewer === 'buyer' ? 'Quick questions' : 'Saved replies'}
        >
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              className={chipClass}
              onClick={() => {
                setBody(c);
                area.current?.focus();
              }}
            >
              {c}
            </button>
          ))}
          {savedReplies.map((r) => (
            <button
              key={r.title}
              type="button"
              className={`${chipClass} bg-stone-light`}
              onClick={() => {
                setBody(r.body);
                area.current?.focus();
              }}
            >
              {r.title}
            </button>
          ))}
          {viewer === 'maker' && (
            <button
              type="button"
              className={`${chipClass} inline-flex items-center gap-1`}
              onClick={() => setNewReply(true)}
            >
              <PlusIcon width={12} height={12} /> New
            </button>
          )}
        </div>
      )}
      {photos.length > 0 && (
        <ul className="flex gap-2" role="list" aria-label="Attached photos">
          {photos.map((u) => (
            <li key={u} className="relative h-[75px] w-[60px] overflow-hidden bg-stone-light">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="Attached" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setPhotos(photos.filter((p) => p !== u))}
                className="absolute right-0 top-0 flex h-11 w-11 items-start justify-end"
              >
                <span className="flex h-6 w-6 items-center justify-center bg-ink/70 text-ground">
                  <CloseIcon width={10} height={10} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex items-end gap-2">
        <input type="hidden" name="threadId" value={threadId} />
        {photos.map((u) => (
          <input key={u} type="hidden" name="imageUrls" value={u} />
        ))}
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => void attach(e.target.files)}
        />
        <button
          type="button"
          aria-label="Attach a photo"
          disabled={uploading || photos.length >= 4}
          onClick={() => file.current?.click()}
          className="flex h-12 w-11 shrink-0 items-center justify-center border border-line-strong bg-surface disabled:opacity-40"
        >
          <ImageIcon width={18} height={18} />
        </button>
        <label htmlFor={`body-${threadId}`} className="sr-only">
          Message
        </label>
        <textarea
          id={`body-${threadId}`}
          ref={area}
          name="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={1}
          maxLength={2000}
          placeholder="Write a message…"
          data-testid="message-input"
          aria-invalid={warning ? true : undefined}
          aria-describedby={`feedback-${threadId}`}
          className="input min-h-[48px] flex-1 resize-none py-3"
        />
        {quote && viewer === 'maker' && (
          <button
            type="button"
            onClick={() => setQuoting((q) => !q)}
            aria-expanded={quoting}
            data-testid="send-quote-toggle"
            className="min-h-[48px] shrink-0 border border-ink px-3 text-[11px] uppercase tracking-label"
          >
            Send quote
          </button>
        )}
        <SendButton disabled={!valid || Boolean(warning) || uploading} />
      </form>
      <div id={`feedback-${threadId}`} aria-live="polite">
        {(warning || serverError) && (
          <p
            className="bg-error-bg px-3 py-2.5 text-[12px] text-error"
            role="alert"
            data-testid="moderation-error"
          >
            {warning ?? serverError}
          </p>
        )}
        {uploadError && <p className="text-[12px] text-error">{uploadError}</p>}
      </div>
      {quoting && quote && (
        <QuotePanel
          threadId={threadId}
          onClose={() => setQuoting(false)}
          onSent={() => {
            setQuoting(false);
            onSent();
          }}
        />
      )}
      {newReply && <NewReplyModal onClose={() => setNewReply(false)} />}
    </div>
  );
}

/** Subscribes to new messages over Supabase Realtime (Supabase auth only); polling covers the rest. */
function useRealtime(threadId: string, enabled: boolean, onChange: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;
    let cleanup = () => {};
    let live = true;
    void import('@supabase/ssr').then(({ createBrowserClient }) => {
      if (!live) return;
      const client = createBrowserClient(url, key);
      const channel = client
        .channel(`thread:${threadId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `thread_id=eq.${threadId}`,
          },
          () => onChange(),
        )
        .subscribe();
      cleanup = () => void client.removeChannel(channel);
    });
    return () => {
      live = false;
      cleanup();
    };
  }, [threadId, enabled, onChange]);
}

export function Conversation({
  threadId,
  currentUserId,
  viewer,
  initial,
  otherName,
  chips = [],
  savedReplies = [],
  quoteStatus = 'Awaiting buyer',
  quote,
  blocked = null,
  realtime = false,
  header,
}: {
  threadId: string;
  currentUserId: string;
  viewer: 'buyer' | 'maker';
  initial: Msg[];
  otherName: string;
  chips?: string[];
  savedReplies?: Array<{ title: string; body: string }>;
  quoteStatus?: string;
  /** Present on custom requests: lets the maker send a quote. */
  quote?: { requestId: string } | null;
  blocked?: string | null;
  realtime?: boolean;
  header?: ReactNode;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const list = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(
    initial.length ? new Date(initial[initial.length - 1]!.createdAt).toISOString() : null,
  );

  useEffect(() => {
    setMessages(initial);
    last.current = initial.length
      ? new Date(initial[initial.length - 1]!.createdAt).toISOString()
      : null;
  }, [initial]);

  const poll = useCallback(async () => {
    const url = `/api/messages/${threadId}${last.current ? `?after=${encodeURIComponent(last.current)}` : ''}`;
    const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
    if (!res?.ok) return;
    const { messages: fresh } = (await res.json()) as { messages: Msg[] };
    if (fresh.length) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...fresh.filter((m) => !seen.has(m.id))];
      });
      last.current = new Date(fresh[fresh.length - 1]!.createdAt).toISOString();
    }
  }, [threadId]);

  useRealtime(threadId, realtime, () => void poll());
  useEffect(() => {
    const id = setInterval(
      () => {
        if (document.visibilityState === 'visible') void poll();
      },
      realtime ? 15000 : 5000,
    );
    return () => clearInterval(id);
  }, [poll, realtime]);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onSent = useCallback(() => {
    void poll();
    router.refresh();
  }, [poll, router]);

  let lastDay = '';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <SafetyNotice viewer={viewer} />
        <ol
          className="mt-4 space-y-3"
          aria-label={`Conversation with ${otherName}`}
          data-testid="message-list"
        >
          {messages.length === 0 && (
            <li className="py-10 text-center text-[13px] text-muted">
              {viewer === 'buyer'
                ? `Ask ${otherName} about fit, fabric or timing.`
                : 'No messages yet.'}
            </li>
          )}
          {messages.map((m) => {
            const mine = m.senderUserId === currentUserId && m.kind !== 'system';
            const at = new Date(m.createdAt);
            const day = dayLabel(at);
            const showDay = day !== lastDay;
            lastDay = day;
            return (
              <li key={m.id}>
                {showDay && (
                  <p className="py-2 text-center text-[10px] uppercase tracking-label text-muted-2">
                    {day}
                  </p>
                )}
                {m.kind === 'system' ? (
                  <div className="mx-auto max-w-[90%]" data-testid="system-message">
                    <p className="whitespace-pre-line bg-stone-light px-4 py-3 text-center text-[12px] text-muted">
                      {m.body}
                    </p>
                    {m.imageUrls.length > 0 && (
                      <div className="mt-1 flex flex-wrap justify-center gap-1">
                        {m.imageUrls.map((u) => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-[120px] w-[96px] overflow-hidden bg-stone-light"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt="Photo from the report"
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {m.kind === 'quote' && m.quote ? (
                      <QuoteCard quote={m.quote} status={quoteStatus} />
                    ) : (
                      <div
                        data-testid={mine ? 'bubble-mine' : 'bubble-theirs'}
                        className={`max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                          m.isFlagged
                            ? 'border border-error bg-error-bg text-error'
                            : mine
                              ? 'glass-dark text-ground'
                              : 'border border-line bg-surface'
                        }`}
                      >
                        <p className="whitespace-pre-line break-words">{m.body}</p>
                      </div>
                    )}
                    {m.imageUrls.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {m.imageUrls.map((u) => (
                          <a
                            key={u}
                            href={u}
                            target="_blank"
                            rel="noreferrer"
                            className="block h-[225px] w-[180px] overflow-hidden bg-stone-light"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={u}
                              alt="Photo attached to message"
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="mt-1 text-[10px] text-muted-2">
                      {m.isFlagged
                        ? 'Not sent — contact and payment details are blocked'
                        : `${mine ? 'You' : otherName} · ${at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`}
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
      <div className="border-t border-line bg-ground px-3 pb-3 pt-3 md:px-6">
        <Composer
          threadId={threadId}
          viewer={viewer}
          chips={chips}
          savedReplies={savedReplies}
          blocked={blocked}
          quote={quote}
          onSent={onSent}
        />
      </div>
    </div>
  );
}
