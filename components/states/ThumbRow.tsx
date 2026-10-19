import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';

export interface Thumb {
  slug: string;
  title: string;
  imageUrl: string | null;
}

/** Three pieces in a row at 4:5, under an empty state ("Start with these", "Recently viewed"). */
export function ThumbRow({ items, label }: { items: Thumb[]; label?: string }) {
  if (!items.length) return null;
  return (
    <div className="w-full" data-testid="thumb-row">
      {label && (
        <p className="mb-3 text-left text-[11px] uppercase tracking-label text-muted-2">{label}</p>
      )}
      <ul className="grid grid-cols-3 gap-2" role="list">
        {items.slice(0, 3).map((t) => (
          <li key={t.slug}>
            <Link href={`/products/${t.slug}`} className="group block text-left">
              <span className="relative block aspect-4/5 overflow-hidden bg-stone">
                {t.imageUrl && (
                  <Image
                    src={t.imageUrl}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 180px, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                )}
              </span>
              <span className="mt-1.5 block truncate text-[12px]">{t.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
