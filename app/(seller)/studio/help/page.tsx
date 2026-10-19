import Link from 'next/link';
import { requireSeller } from '@/lib/auth/session';
import { GUIDES } from '@/lib/studio/guide-list';

export const metadata = { title: 'Guides · Studio' };

export default async function StudioHelpPage() {
  await requireSeller();
  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-[40px] leading-none md:text-[56px]">Guides</h1>
        <p className="mt-3 text-[14px] text-muted">
          Handy guides, whenever you need them. Stuck?{' '}
          <Link href="/studio/support" className="underline underline-offset-4">
            Message One Off
          </Link>
          .
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2" role="list">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/studio/help/${g.slug}`}
              className="flex min-h-[96px] items-end bg-stone p-5 font-display text-[24px] leading-tight hover:bg-line"
            >
              {g.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
