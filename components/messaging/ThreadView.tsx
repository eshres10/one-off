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

  return (
    <div className="flex flex-col gap-4">
      <ol
        className="space-y-3"
        aria-label={`Conversation with ${otherName}`}
        data-testid="message-list"
      >
        {messages.map((m) => {
          const mine = m.senderUserId === currentUserId;
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] ${
                  m.isFlagged
                    ? 'border border-alert bg-alert-light text-alert'
                    : mine
                      ? 'bg-ink text-paper'
                      : 'border border-stone/70 bg-white'
                }`}
              >
                <p className="whitespace-pre-line break-words">{m.body}</p>
                {m.imageUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.imageUrls.map((u) => (
                      <a
                        key={u}
                        href={u}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-24 w-24 overflow-hidden rounded-lg"
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
                <p
                  className={`mt-1 text-[11px] ${mine && !m.isFlagged ? 'text-paper/70' : 'text-ink-muted'}`}
                >
                  {m.isFlagged
                    ? 'Not sent — this message broke our safety rules'
                    : new Date(m.createdAt).toLocaleString('en-AU', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={bottom} />
      <ProtectionNotice />
      <Composer
        action={sendMessageAction}
        hidden={{ threadId }}
        templates={templates}
        presets={presets}
        onSent={() => void poll()}
      />
    </div>
  );
}
