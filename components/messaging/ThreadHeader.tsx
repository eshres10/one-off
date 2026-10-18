import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { ChevronIcon } from '@/components/ui/icons';
import { responseTimeLabel } from '@/components/maker/MakerByline';

export function ThreadHeader({
  backHref,
  name,
  responseHours,
  avatarUrl,
}: {
  backHref: string;
  name: string;
  responseHours?: number;
  avatarUrl?: string | null;
}) {
  return (
    <div className="grid grid-cols-[44px_1fr_44px] items-center border-b border-line py-3">
      <Link
        href={backHref}
        aria-label="Back"
        className="flex h-11 w-11 items-center justify-center"
      >
        <ChevronIcon dir="left" width={18} height={18} />
      </Link>
      <div className="text-center">
        <h1 className="text-[30px] leading-none">{name}</h1>
        {responseHours !== undefined && (
          <p className="mt-1 text-[11px] text-muted-2">{responseTimeLabel(responseHours)}</p>
        )}
      </div>
      <span className="relative h-10 w-10 justify-self-end overflow-hidden rounded-circle bg-stone-light">
        {avatarUrl && <Image src={avatarUrl} alt="" fill sizes="40px" className="object-cover" />}
      </span>
    </div>
  );
}
