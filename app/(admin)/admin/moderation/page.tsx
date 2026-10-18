import { sql } from '@/lib/db';

export const metadata = { title: 'Moderation' };

export default async function ModerationPage() {
  const rows = await sql()<
    {
      id: string;
      body: string;
      flagReason: string | null;
      senderEmail: string;
      makerName: string;
      createdAt: Date;
    }[]
  >`
    select msg.id, msg.body, msg.flag_reason, u.email as sender_email, m.display_name as maker_name, msg.created_at
    from public.messages msg join public.message_threads t on t.id = msg.thread_id
    join public.users u on u.id = msg.sender_user_id join public.makers m on m.id = t.maker_id
    where msg.is_flagged order by msg.created_at desc limit 100`;
  return (
    <div className="space-y-4">
      <h1 className="text-[40px] leading-none md:text-[48px]">Flagged messages</h1>
      <p className="text-sm text-ink-muted">
        Blocked automatically for sharing contact details, bank details, links or off-platform
        payment requests. They were never delivered.
      </p>
      {rows.length === 0 && <p className="text-sm text-ink-muted">Nothing flagged.</p>}
      <ul className="space-y-2" role="list">
        {rows.map((r) => (
          <li key={r.id} className="card p-3 text-sm">
            <p className="text-xs text-ink-muted">
              {r.senderEmail} · thread with {r.makerName} ·{' '}
              {new Date(r.createdAt).toLocaleString('en-AU')} ·{' '}
              <span className="text-alert">{r.flagReason}</span>
            </p>
            <p className="mt-1 whitespace-pre-line">{r.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
