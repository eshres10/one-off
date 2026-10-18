import { sql } from '@/lib/db';
import { ManualEmailForm } from '@/components/admin/ManualEmailForm';
import { StatusPill } from '@/components/ui/Badge';

export const metadata = { title: 'Emails' };

export default async function AdminEmailsPage() {
  const emails = await sql()<
    {
      id: string;
      toEmail: string;
      template: string;
      subject: string;
      bodyText: string;
      status: string;
      provider: string;
      createdAt: Date;
    }[]
  >`
    select id, to_email, template, subject, body_text, status, provider, created_at from public.email_outbox order by created_at desc limit 50`;
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="mb-2 text-3xl">Email log</h1>
        <p className="mb-4 text-sm text-ink-muted">
          Every transactional email is recorded here. With the local outbox driver this is the only
          delivery — open a message to copy links (e.g. sign-in links) during development.
        </p>
        <ul className="space-y-2" role="list">
          {emails.map((e) => (
            <li key={e.id}>
              <details className="card p-3 text-sm">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{e.subject}</span>{' '}
                    <span className="text-ink-muted">→ {e.toEmail}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-muted">
                    {e.template} ·{' '}
                    {new Date(e.createdAt).toLocaleString('en-AU', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}{' '}
                    <StatusPill status={e.status} />
                  </span>
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-ink-soft">
                  {e.bodyText}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </div>
      <aside>
        <ManualEmailForm />
      </aside>
    </div>
  );
}
