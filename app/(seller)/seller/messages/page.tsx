import { requireSeller } from '@/lib/auth/session';
import { listThreads } from '@/lib/services/messaging';
import { getReplyTemplates } from '@/lib/queries/seller';
import { deleteTemplateAction, saveTemplateAction } from '@/lib/actions/seller';
import { ThreadList } from '@/components/messaging/ThreadList';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubmitButton } from '@/components/ui/SubmitButton';

export const metadata = { title: 'Messages' };

export default async function SellerMessagesPage() {
  const seller = await requireSeller();
  const [threads, templates] = await Promise.all([
    listThreads(seller, 'maker'),
    getReplyTemplates(seller),
  ]);
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div>
        <h1 className="mb-8 text-[40px] leading-none md:text-[48px]">Buyer questions</h1>
        {threads.length ? (
          <ThreadList threads={threads} base="/seller/messages" />
        ) : (
          <EmptyState title="No messages yet">Questions from shoppers will appear here.</EmptyState>
        )}
      </div>
      <aside className="space-y-4">
        <h2 className="font-sans text-[11px] font-normal uppercase tracking-label">
          Saved replies
        </h2>
        <ul className="space-y-2" role="list">
          {templates.map((t) => (
            <li key={t.id} className="card p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{t.title}</p>
                <form action={deleteTemplateAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs text-ink-muted underline">Delete</button>
                </form>
              </div>
              <p className="mt-1 line-clamp-3 text-ink-muted">{t.body}</p>
            </li>
          ))}
        </ul>
        <form action={saveTemplateAction} className="card space-y-2 p-3">
          <input
            name="title"
            required
            maxLength={60}
            placeholder="Template name"
            aria-label="Template name"
            className="input py-2 text-sm"
          />
          <textarea
            name="body"
            required
            maxLength={1000}
            rows={3}
            placeholder="Reply text"
            aria-label="Template text"
            className="input text-sm"
          />
          <SubmitButton size="sm">Add saved reply</SubmitButton>
        </form>
      </aside>
    </div>
  );
}
