'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MakerRequestRow } from '@/lib/services/custom-studio';
import type { ThreadSummary } from '@/lib/services/messaging';
import { fmtDay } from '@/lib/custom/brief';
import { Img as Image } from '@/components/ui/Img';
import { Segmented } from '../ui';

const ago = (d: Date | string) => {
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
};

function Countdown({ r }: { r: MakerRequestRow }) {
  if (r.recipientStatus === 'pending' && r.hoursLeft != null)
    return (
      <span
        className={`shrink-0 rounded-pill px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${r.hoursLeft <= 12 ? 'bg-[#8A2E1C] text-ground' : 'bg-stone text-ink'}`}
        data-testid="countdown"
      >
        {r.hoursLeft} h left
      </span>
    );
  const label: Record<string, string> = {
    quoted: 'Quoted',
    chosen: 'Accepted',
    passed: 'Passed',
    expired: 'Expired',
    not_chosen: 'Not chosen',
  };
  return (
    <span className="shrink-0 rounded-pill bg-stone px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted">
      {label[r.recipientStatus] ?? r.recipientStatus}
    </span>
  );
}

/** Studio Inbox (phones): Requests (Bundle B) and buyer messages. */
export function StudioInbox({
  tab,
  requests,
  threads,
  needsReply,
}: {
  tab: 'requests' | 'messages';
  requests: MakerRequestRow[];
  threads: ThreadSummary[];
  needsReply: number;
}) {
  const router = useRouter();
  const pending = requests.filter((r) => r.recipientStatus === 'pending').length;
  return (
    <div className="pb-6" data-testid="studio-inbox">
      <h1 className="text-[36px] leading-none">Inbox</h1>
      <div className="mt-4">
        <Segmented
          value={tab}
          onChange={(v) =>
            router.replace(v === 'requests' ? '/studio/inbox' : '/studio/inbox?tab=messages')
          }
          label="Inbox"
          testId="studio-inbox-tabs"
          options={[
            { value: 'requests', label: 'Requests', count: pending },
            { value: 'messages', label: 'Messages', count: needsReply },
          ]}
        />
      </div>
      {tab === 'requests' ? (
        requests.length ? (
          <ul className="mt-3 space-y-2" role="list" data-testid="request-cards">
            {requests.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/studio/inbox/requests/${r.id}`}
                  className="flex gap-3 rounded-app border border-line bg-surface p-3"
                  data-testid={`request-${r.number}`}
                >
                  <span className="relative h-[80px] w-[64px] shrink-0 overflow-hidden rounded-[6px] bg-[#D2CBC1]">
                    {r.thumb && (
                      <Image
                        src={r.thumb}
                        alt=""
                        fill
                        sizes="64px"
                        className="object-cover object-[center_20%]"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span
                        className={`truncate text-[13px] ${r.viewed ? 'text-muted' : 'font-medium'}`}
                      >
                        {r.who}
                      </span>
                      <Countdown r={r} />
                    </span>
                    <span className="mt-0.5 block truncate text-[15px]">
                      {r.title[0]!.toUpperCase() + r.title.slice(1)}
                    </span>
                    <span className="block truncate text-[12px] text-muted">
                      {r.occasion}
                      {r.neededBy ? ` · by ${fmtDay(r.neededBy)}` : ''} · {r.budget}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-10 px-4 text-center text-[13px] text-muted">
            Requests come to you when a buyer picks you from their Have it made matches.
          </p>
        )
      ) : threads.length ? (
        <ul className="mt-3 divide-y divide-line" role="list" data-testid="studio-thread-list">
          {threads.map((t) => (
            <li key={t.id}>
              <Link
                href={`/studio/messages/${t.id}`}
                className="flex items-center gap-3 py-3.5"
                data-testid="inbox-row"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-circle bg-stone text-[13px] uppercase">
                  {t.counterpartName.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-[15px] ${t.needsReply ? 'font-medium' : ''}`}>
                      {t.counterpartName}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-2">
                      {ago(t.lastMessageAt)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    {t.needsReply && (
                      <span
                        aria-label="Needs a reply"
                        className="h-2 w-2 shrink-0 rounded-circle bg-[#8A2E1C]"
                      />
                    )}
                    <span className="truncate text-[13px] text-muted">
                      {t.lastFromMe ? 'You: ' : ''}
                      {t.lastBody ?? t.context.productTitle ?? ''}
                    </span>
                  </span>
                </span>
                {t.context.imageUrl && (
                  <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-[6px] bg-stone">
                    <Image
                      src={t.context.imageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover object-top"
                    />
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 px-4 text-center text-[13px] text-muted">
          No messages yet. Buyers ask here before they order.
        </p>
      )}
    </div>
  );
}
