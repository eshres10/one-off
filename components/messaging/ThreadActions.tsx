import { blockBuyerAction, reportThreadAction, setNeedsReplyAction } from '@/lib/actions/messages';
import { MoreIcon } from '@/components/ui/icons';

/** Studio thread actions: mark replied/unread, and a ⋯ menu with Report and Block. */
export function ThreadActions({
  threadId,
  needsReply,
  blocked,
}: {
  threadId: string;
  needsReply: boolean;
  blocked: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <form action={setNeedsReplyAction}>
        <input type="hidden" name="threadId" value={threadId} />
        <input type="hidden" name="needsReply" value={needsReply ? 'false' : 'true'} />
        <button className="min-h-[44px] whitespace-nowrap px-2 text-[11px] uppercase tracking-label underline underline-offset-[5px]">
          {needsReply ? 'Mark as replied' : 'Mark as unread'}
        </button>
      </form>
      <details className="relative">
        <summary
          className="flex h-11 w-11 cursor-pointer list-none items-center justify-center [&::-webkit-details-marker]:hidden"
          aria-label="More actions"
        >
          <MoreIcon width={18} height={18} />
        </summary>
        <div className="absolute right-0 top-full z-20 w-44 border border-line bg-surface py-1 text-ink shadow-[0_8px_24px_rgba(17,17,17,0.08)]">
          <form action={reportThreadAction}>
            <input type="hidden" name="threadId" value={threadId} />
            <button className="block min-h-[44px] w-full px-4 text-left text-[13px] hover:bg-ground">
              Report
            </button>
          </form>
          {!blocked && (
            <form action={blockBuyerAction}>
              <input type="hidden" name="threadId" value={threadId} />
              <button className="block min-h-[44px] w-full px-4 text-left text-[13px] text-error hover:bg-ground">
                Block buyer
              </button>
            </form>
          )}
        </div>
      </details>
    </div>
  );
}
