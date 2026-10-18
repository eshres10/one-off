import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { getMakersDirectory } from '@/lib/queries/catalog';
import { Stars } from '@/components/ui/Stars';

export const metadata = { title: 'Makers' };

export default async function MakersPage() {
  const makers = await getMakersDirectory();
  return (
    <div className="container-page pt-8">
      <p className="eyebrow">The studios</p>
      <h1 className="mt-2 text-4xl sm:text-5xl">Meet the makers</h1>
      <p className="mt-3 max-w-xl text-ink-soft">
        Every label on {`Atelier Locale`} is independent, Australian and hand-selected. Most are one
        or two people making in small batches.
      </p>
      <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" role="list">
        {makers.map((m) => (
          <li key={m.id}>
            <Link
              href={`/makers/${m.slug}`}
              className="group block overflow-hidden rounded-2xl border border-stone/70 bg-white"
            >
              <div className="relative aspect-[16/7] bg-stone-light">
                {m.coverUrl && (
                  <Image
                    src={m.coverUrl}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 33vw, 100vw"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex items-start gap-3 p-4">
                <span className="relative -mt-10 h-14 w-14 shrink-0 overflow-hidden rounded-full border-4 border-white bg-stone-light">
                  {m.avatarUrl && (
                    <Image src={m.avatarUrl} alt="" fill sizes="56px" className="object-cover" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="font-medium group-hover:underline">{m.displayName}</p>
                  <p className="text-xs text-ink-muted">
                    {m.city}
                    {m.reviewCount > 0 && (
                      <>
                        {' '}
                        · <Stars rating={m.rating} count={m.reviewCount} size={11} />
                      </>
                    )}
                  </p>
                  {m.tagline && (
                    <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{m.tagline}</p>
                  )}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
