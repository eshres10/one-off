import { ShieldIcon } from '@/components/ui/icons';
import { BRAND } from '@/lib/brand';

export function ProtectionNotice() {
  return (
    <p className="flex items-start gap-2.5 bg-stone-light px-3.5 py-3 text-[12px] text-text2">
      <ShieldIcon width={15} height={15} className="mt-px shrink-0" />
      <span>
        For buyer protection, complete purchases through {BRAND.name}. Messages that share contact
        or bank details are blocked.
      </span>
    </p>
  );
}
