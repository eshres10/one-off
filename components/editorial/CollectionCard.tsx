import { Img as Image } from '@/components/ui/Img';
import Link from 'next/link';
import type { Collection } from '@/lib/queries/catalog';

export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link href={`/collections/${collection.slug}`} className="group block">
      <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-stone-light">
        {collection.heroImageUrl && (
          <Image
            src={collection.heroImageUrl}
            alt=""
            fill
            sizes="(min-width: 768px) 33vw, 100vw"
            className="object-cover transition duration-500 group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-ink/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4 text-paper">
          <h3 className="text-2xl leading-tight">{collection.title}</h3>
          {collection.subtitle && (
            <p className="mt-1 text-sm text-paper/85">{collection.subtitle}</p>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-muted">{collection.productCount} pieces</p>
    </Link>
  );
}
