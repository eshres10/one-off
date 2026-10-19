import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { removeStyleTagAction } from '@/lib/actions/onboarding';
import { getPrefs } from '@/lib/services/taste';
import { OCCASIONS, topTags } from '@/lib/taste/tags';
import { CloseIcon } from '@/components/ui/icons';

export const metadata = { title: 'Your style' };

/** The taste profile that ranks Discover and "Picked for you": remove tags or redo the picker. */
export default async function YourStylePage() {
  const user = await requireUser('/account/style');
  const prefs = await getPrefs(user.id);
  const tags = topTags(prefs.tasteTags, 8);
  return (
    <div className="max-w-xl space-y-10">
      <section>
        <h1 className="text-[40px] leading-none">Your style</h1>
        <p className="mt-3 text-[14px] text-muted">
          What you pick, save and buy shapes your Discover feed and the pieces we pick for you.
          Remove anything that isn’t you.
        </p>
        {tags.length ? (
          <ul className="mt-6 flex flex-wrap gap-2" role="list" data-testid="style-tags-list">
            {tags.map((t) => (
              <li key={t}>
                <form action={removeStyleTagAction}>
                  <input type="hidden" name="tag" value={t} />
                  <button
                    className="flex min-h-[40px] items-center gap-2 rounded-circle bg-ink px-4 text-[12px] text-ground"
                    aria-label={`Remove ${t}`}
                  >
                    {t}
                    <CloseIcon width={12} height={12} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-[13px] text-muted-2">
            Nothing yet. Pick a few pieces to get started.
          </p>
        )}
        <Link
          href="/welcome?step=3&redo=1"
          className="mt-6 inline-flex min-h-[48px] items-center border border-ink px-5 text-[11px] uppercase tracking-label"
          data-testid="redo-picker"
        >
          Redo the picker
        </Link>
      </section>
      <section className="border-t border-line pt-8 text-[14px]">
        <h2 className="text-[28px] leading-none">Fit and occasions</h2>
        <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2">
          <dt className="text-muted-2">Sizes</dt>
          <dd>{prefs.sizes.length ? prefs.sizes.join(', ') : '—'}</dd>
          <dt className="text-muted-2">Occasions</dt>
          <dd>
            {prefs.occasions.length
              ? prefs.occasions
                  .map((o) => OCCASIONS.find((x) => x.value === o)?.label ?? o)
                  .join(', ')
              : '—'}
          </dd>
        </dl>
        <Link href="/welcome?step=1" className="mt-4 inline-block underline underline-offset-4">
          Change
        </Link>
      </section>
    </div>
  );
}
