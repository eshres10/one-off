'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ThreadMessage } from '@/lib/services/messaging';
import { sendMessageAction } from '@/lib/actions/messages';
import { Composer } from './Composer';
import { ProtectionNotice } from './ProtectionNotice';

type Msg = Omit<ThreadMessage, 'createdAt'> & { createdAt: string | Date };

export function ThreadView({
  threadId,
  currentUserId,
  initial,
  otherName,
  templates = [],
  presets = false,
}: {
  threadId: string;
  currentUserId: string;
  initial: Msg[];
  otherName: string;
  templates?: Array<{ title: string; body: string }>;
  presets?: boolean;
}) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const bottom = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(
    initial.length ? new Date(initial[initial.length - 1]!.createdAt).toISOString() : null,
  );

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

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void poll();
    }, 5000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  let lastDay = '';
  return (
    <div className="flex flex-col gap-4">
      <ProtectionNotice />
      <ol
        className="space-y-3"
        aria-label={`Conversation with ${otherName}`}
        data-testid="message-list"
      >
        {messages.map((m) => {
          const mine = m.senderUserId === currentUserId;
          const at = new Date(m.createdAt);
          const day = at.toLocaleDateString('en-AU', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          const showDay = day !== lastDay;
          lastDay = day;
          const today =
            day ===
            new Date().toLocaleDateString('en-AU', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            });
          return (
            <li key={m.id}>
              {showDay && (
                <p className="py-2 text-center text-[10px] uppercase tracking-label text-muted-2">
                  {today ? 'Today' : day}
                </p>
              )}
              <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[80%] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                    m.isFlagged
                      ? 'border border-error bg-error-bg text-error'
                      : mine
                        ? 'bg-ink text-ground'
                        : 'border border-line bg-surface'
                  }`}
                >
                  <p className="whitespace-pre-line break-words">{m.body}</p>
                </div>
                {m.imageUrls.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.imageUrls.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-40 w-32 overflow-hidden bg-stone-light"
                      >
                        <img
                          src={u}
                          alt="Image attached to message"
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[10px] text-muted-2">
                  {m.isFlagged
                    ? 'Not sent — this message broke our safety rules'
                    : `${mine ? 'You' : otherName} · ${at.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}`}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={bottom} />
      <div className="border-t border-line bg-surface p-3">
        <Composer
          action={sendMessageAction}
          hidden={{ threadId }}
          templates={templates}
          presets={presets}
          onSent={() => void poll()}
        />
      </div>
    </div>
  );
}
