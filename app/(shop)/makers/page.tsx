import Link from 'next/link';
import { Img as Image } from '@/components/ui/Img';
import { getMakersDirectory } from '@/lib/queries/catalog';
import { PageTitle } from '@/components/ui/Panels';

export const metadata = { title: 'Makers' };

export default async function MakersPage() {
  const makers = await getMakersDirectory();
  return (
    <div className="pt-10 md:pt-16">
      <div className="container-page">
        <PageTitle kicker="The studios" title="Meet the makers">
          Every label here is independent, Australian and hand-selected. Most are one or two people
          making in small batches.
        </PageTitle>
      </div>
      <ul className="grid grid-cols-2 gap-[2px] md:grid-cols-4" role="list">
        {makers.map((m) => (
          <li key={m.id}>
            <Link href={`/makers/${m.slug}`} className="group block pb-6">
              <span className="relative block aspect-4/5 overflow-hidden bg-stone-light">
                {m.coverUrl && (
                  <Image
                    src={m.coverUrl}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 25vw, 50vw"
                    className="object-cover transition duration-700 group-hover:scale-[1.02]"
                  />
                )}
              </span>
              <span className="mt-3 block px-3 font-display text-[24px] leading-tight group-hover:underline md:text-[28px]">
                {m.displayName}
              </span>
              <span className="block px-3 text-[11px] uppercase tracking-label text-muted-2">
                {m.city}
                {m.reviewCount > 0 && ` · ★ ${m.rating.toFixed(1)}`}
              </span>
              {m.tagline && (
                <span className="mt-1 block px-3 text-[13px] text-muted">{m.tagline}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
