import type { SupportMessage } from '@/lib/services/support';

const when = (d: Date) =>
  new Date(d).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Australia/Melbourne',
  });

/** A maker ↔ One Off conversation; `mine` is the side reading it. */
export function SupportThread({
  messages,
  mine,
}: {
  messages: SupportMessage[];
  mine: 'maker' | 'admin';
}) {
  if (!messages.length) return null;
  return (
    <ol className="space-y-3" data-testid="support-thread">
      {messages.map((m) => {
        const own = (mine === 'admin') === m.fromAdmin;
        return (
          <li key={m.id} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
            <p
              className={`max-w-[85%] whitespace-pre-line px-3.5 py-2.5 text-[14px] ${own ? 'bg-ink text-ground' : 'bg-stone'}`}
            >
              {m.topic && (
                <span className="mb-1 block text-[11px] uppercase tracking-label opacity-70">
                  {m.topic}
                </span>
              )}
              {m.body}
            </p>
            <span className="mt-1 text-[11px] text-muted-2">
              {m.fromAdmin ? 'One Off' : 'You'} · {when(m.createdAt)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
