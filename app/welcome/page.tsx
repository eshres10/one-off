import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { getMostPopular, getPickedForYou } from '@/lib/queries/rails';
import {
  getPrefs,
  pickerPieces,
  readBack,
  savePrefs,
  suggestedMakers,
  topTags,
} from '@/lib/services/taste';
import { FitStep } from '@/components/onboarding/FitStep';
import { HowItWorks } from '@/components/onboarding/HowItWorks';
import { MakersStep } from '@/components/onboarding/MakersStep';
import { OccasionsStep } from '@/components/onboarding/OccasionsStep';
import { WelcomeShell } from '@/components/onboarding/Shell';
import { TastePicker } from '@/components/onboarding/TastePicker';
import { Img as Image } from '@/components/ui/Img';
import { Monogram } from '@/components/ui/Monogram';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome', robots: { index: false } };

const firstName = (name: string | null, email: string) =>
  (name?.trim().split(/\s+/)[0] || email.split('@')[0] || '').replace(/^\w/, (c) =>
    c.toUpperCase(),
  );

/** Onboarding for new shoppers: fit, occasions, taste, makers, how it works, done. */
export default async function WelcomePage({
  searchParams,
}: {
  searchParams: { step?: string; redo?: string };
}) {
  const user = await requireUser('/welcome');
  const prefs = await getPrefs(user.id);
  const resume = prefs.onboardingCompletedAt ? 6 : Math.min(6, prefs.onboardingStep + 1);
  const step = Math.max(1, Math.min(6, Number(searchParams.step ?? resume) || 1));

  if (step === 1) return <FitStep sizes={prefs.sizes} heightBand={prefs.heightBand} />;
  if (step === 2) return <OccasionsStep occasions={prefs.occasions} />;
  if (step === 3) {
    const pieces = await pickerPieces(user.id);
    return (
      <TastePicker
        initialPieces={pieces}
        initialPicks={prefs.tastePicks}
        initialTop={topTags(prefs.tasteTags, 3)}
        redo={searchParams.redo === '1'}
      />
    );
  }
  if (step === 4) return <MakersStep makers={await suggestedMakers(user.id, 4)} />;
  if (step === 5) {
    const pieces = await pickerPieces(user.id, [], 2);
    return <HowItWorks images={pieces.map((p) => p.imageUrl).filter((u): u is string => !!u)} />;
  }

  if (!prefs.onboardingCompletedAt) await savePrefs(user, { onboardingStep: 6, completed: true });
  const [summary, picked] = await Promise.all([readBack(user.id), getPickedForYou(user.id, 3)]);
  const thumbs = picked.length ? picked : await getMostPopular(3);
  return (
    <WelcomeShell
      step={6}
      title={`All set, ${firstName(user.displayName, user.email)}`}
      lead={<Monogram className="mt-8 h-16 w-16 text-ink" />}
    >
      <p className="font-display text-[26px] leading-tight">Your feed is ready.</p>
      {summary && (
        <p className="mt-3 text-[14px] leading-relaxed text-muted" data-testid="welcome-readback">
          {summary}
        </p>
      )}
      <ul className="mt-6 grid grid-cols-3 gap-1.5" role="list">
        {thumbs.slice(0, 3).map((p) => (
          <li key={p.id} className="relative aspect-4/5 overflow-hidden bg-stone">
            {p.imageUrl && (
              <Image
                src={p.imageUrl}
                alt={p.title}
                fill
                sizes="150px"
                className="object-cover object-top"
              />
            )}
          </li>
        ))}
      </ul>
      <p className="mt-6 bg-stone p-4 text-[13px] leading-relaxed">
        We’ll email you when a piece you saved drops in price or is nearly gone, and when makers you
        follow add something new. Change this any time in Account.
      </p>
      <Link
        href="/discover"
        className="glass-dark mt-8 flex min-h-[52px] w-full items-center justify-center text-[11px] uppercase tracking-[0.18em] text-ground"
        data-testid="start-exploring"
      >
        Start exploring
      </Link>
      <p className="mt-4 text-center text-[12px] text-muted-2">
        Replay the tour any time from Account → Help.
      </p>
    </WelcomeShell>
  );
}
