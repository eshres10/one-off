import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import type { Collection } from '@/lib/queries/catalog';

/** 2×2 editorial collection tile. */
export function CollectionCard({ collection }: { collection: Collection }) {
  return (
    <Link
      href={`/collections/${collection.slug}`}
      className="group relative block aspect-[4/5] overflow-hidden bg-stone-light text-ground md:aspect-[5/4]"
    >
      {collection.heroImageUrl && (
        <Image
          src={collection.heroImageUrl}
          alt=""
          fill
          sizes="(min-width: 768px) 50vw, 100vw"
          className="object-cover transition duration-700 group-hover:scale-[1.02]"
        />
      )}
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent"
      />
      <span className="absolute inset-x-0 bottom-0 p-6 md:p-8">
        <span className="block text-[11px] uppercase tracking-label">
          {collection.productCount} pieces
        </span>
        <span className="mt-2 block font-display text-[40px] leading-[0.95] md:text-[52px]">
          {collection.title}
        </span>
        {collection.subtitle && (
          <span className="mt-2 block text-[14px] text-ground/90">{collection.subtitle}</span>
        )}
        <span className="mt-3 inline-block text-[11px] uppercase tracking-label underline underline-offset-[6px]">
          Shop the collection
        </span>
      </span>
    </Link>
  );
}
