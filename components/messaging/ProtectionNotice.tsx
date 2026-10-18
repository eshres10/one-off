import { ShieldIcon } from '@/components/ui/icons';
import { BRAND } from '@/lib/brand';

export function ProtectionNotice() {
  return (
    <p className="flex items-start gap-2 rounded-xl bg-stone-light px-3 py-2.5 text-xs text-ink-soft">
      <ShieldIcon width={16} height={16} className="mt-px shrink-0" />
      <span>
        For buyer protection, complete purchases through {BRAND.name}. Never share contact or bank
        details, or pay a maker directly — messages that do are blocked.
      </span>
    </p>
  );
}
