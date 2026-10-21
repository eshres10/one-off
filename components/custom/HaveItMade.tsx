'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Img as Image } from '@/components/ui/Img';
import { Wordmark } from '@/components/ui/Wordmark';
import { findMatchesAction, requestHelpAction, sendRequestAction } from '@/lib/actions/custom';
import { CUSTOM } from '@/lib/custom/config';
import {
  EMPTY_BRIEF,
  STEP_COUNT,
  clearDraft,
  neededBy,
  readDraft,
  stepReady,
  writeDraft,
  type Brief,
  firstIncompleteStep,
  stepMessage,
} from '@/lib/custom/brief';
import type { MatchResult } from '@/lib/services/custom';
import { BriefCard } from './BriefCard';
import {
  BudgetStep,
  FabricStep,
  FitStep,
  InspirationStep,
  KindStep,
  OccasionStep,
  WhereStep,
  type SavedSizes,
  type Set,
} from './BriefSteps';
import { Finding, MatchList, NoMatches } from './Matches';
import { Cap, Glass, Title, areaClass } from './ui';

export interface SourceListing {
  id: string;
  slug: string;
  title: string;
  maker: string;
  imageUrl: string | null;
}

interface Props {
  signedIn: boolean;
  saved: SavedSizes | null;
  source: SourceListing | null;
  /** From the search empty state: "I'm looking for…" */
  query: string | null;
  /** Back from sign-in: pick the draft up where it was left. */
  resume: boolean;
  closeHref: string;
  /** Makers open for custom work, for the finding screen. */
  makerCount: number;
}

// Screens: 0 intro · 1–7 the brief · 8 finding · 9 matches or no matches · 10 sent · 14 help.
const INTRO = 0;
const FINDING = 8;
const MATCHES = 9;
const SENT = 10;
const HELP = 14;

const SIGN_IN = '/login?next=' + encodeURIComponent('/have-it-made?resume=1');

/**
 * Have it made: one question per screen on a phone (progress bar, back and close, a sticky
 * glass button); on desktop the questions sit beside a "Your brief" card that fills in as
 * they go. The draft lives in localStorage so a guest can sign in at "Find my makers" and
 * carry on.
 */
export function HaveItMade({
  signedIn,
  saved,
  source,
  query,
  resume,
  closeHref,
  makerCount,
}: Props) {
  const router = useRouter();
  const today = useRef(new Date()).current;
  const [brief, setBrief] = useState<Brief>(() => ({
    ...EMPTY_BRIEF,
    sourceListingId: source?.id ?? null,
    words: query ? `I’m looking for ${query}.` : '',
    fitMode: saved ? 'saved' : null,
  }));
  const [step, setStep] = useState(INTRO);
  const [sourceShown, setSourceShown] = useState(Boolean(source));
  const [result, setResult] = useState<MatchResult | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [limitHit, setLimitHit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ number: string; makers: string[] } | null>(null);
  const [helpNote, setHelpNote] = useState('');
  const [helpSent, setHelpSent] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  // A saved draft wins over a fresh start (and resumes straight into matching after sign-in).
  useEffect(() => {
    const d = readDraft();
    if (d) {
      setBrief((b) => ({
        ...d.brief,
        sourceListingId: d.brief.sourceListingId ?? b.sourceListingId,
      }));
      setSourceShown(Boolean(d.brief.sourceListingId ?? source));
      // Back from sign-in: straight into matching only when that's where they left (the draft is
      // saved at FINDING by "Find my makers"); signing in for photos at step 3 comes back to step 3.
      if (resume && signedIn && d.step === FINDING) setStep(FINDING);
      else
        setStep(
          d.step > 0 && d.step <= STEP_COUNT ? d.step : d.step === FINDING ? STEP_COUNT : INTRO,
        );
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (step >= SENT) clearDraft();
    else writeDraft(brief, step);
  }, [brief, step, hydrated]);

  const set = useCallback<Set>((key, value) => setBrief((b) => ({ ...b, [key]: value })), []);

  // Matching: runs when the finding screen shows, and shows for at least CUSTOM.findingMs
  // unless the buyer skips the animation.
  const finding = useRef<{ run: number; skip: boolean; apply: (() => void) | null }>({
    run: 0,
    skip: false,
    apply: null,
  });
  useEffect(() => {
    if (step !== FINDING) return;
    const f = finding.current;
    const run = ++f.run;
    f.skip = false;
    f.apply = null;
    const started = Date.now();
    setError(null);
    findMatchesAction(brief).then((res) => {
      if (run !== f.run) return;
      const apply = () => {
        if (run !== f.run) return;
        f.apply = null;
        if (!res.ok) {
          if (res.signIn) return router.push(SIGN_IN);
          setError(res.message);
          // Back to the step that needs something, not just the last one.
          setStep(res.step && res.step >= 1 && res.step <= STEP_COUNT ? res.step : STEP_COUNT);
          return;
        }
        setResult(res.value);
        setPicked(
          res.value.matches
            .filter((m) => !m.warning)
            .slice(0, CUSTOM.maxMakers)
            .map((m) => m.makerId),
        );
        setLimitHit(false);
        setStep(MATCHES);
      };
      const wait = Math.max(0, CUSTOM.findingMs - (Date.now() - started));
      if (f.skip || wait === 0) return apply();
      f.apply = apply;
      setTimeout(() => f.apply?.(), wait);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const skipFinding = () => {
    finding.current.skip = true;
    finding.current.apply?.();
  };

  useEffect(() => {
    liveRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const by = neededBy(brief, today);
  const inBrief = step >= 1 && step <= STEP_COUNT;
  const ready = inBrief ? stepReady(step, brief) : true;

  const next = () => {
    setError(null);
    if (step === INTRO) return setStep(1);
    if (step === STEP_COUNT) {
      // Everything before this step has to be in too (a restored draft can be missing a bit).
      const missing = firstIncompleteStep(brief);
      if (missing !== null && missing < STEP_COUNT) {
        setError(stepMessage(missing));
        return setStep(missing);
      }
      if (!signedIn) {
        writeDraft(brief, FINDING);
        return router.push(SIGN_IN);
      }
      return setStep(FINDING);
    }
    if (step === MATCHES) return send();
    setStep(step + 1);
  };
  const back = () => {
    setError(null);
    if (step === MATCHES || step === HELP) return setStep(STEP_COUNT);
    if (step > INTRO && step <= STEP_COUNT) setStep(step - 1);
  };

  const pick = (makerId: string) => {
    setLimitHit(false);
    setPicked((p) => {
      if (p.includes(makerId)) return p.filter((x) => x !== makerId);
      if (p.length >= CUSTOM.maxMakers) {
        setLimitHit(true);
        return p;
      }
      return [...p, makerId];
    });
  };

  const send = () => {
    if (!result || picked.length === 0 || busy) return;
    setBusy(true);
    sendRequestAction(brief, picked).then((res) => {
      setBusy(false);
      if (!res.ok) {
        if (res.signIn) return router.push(SIGN_IN);
        setError(res.message);
        if (res.step && res.step >= 1 && res.step <= STEP_COUNT) setStep(res.step);
        return;
      }
      setSent({
        number: res.value.number,
        makers: result.matches.filter((m) => picked.includes(m.makerId)).map((m) => m.name),
      });
      setStep(SENT);
    });
  };

  const help = () => {
    if (busy) return;
    setBusy(true);
    requestHelpAction({ brief, note: helpNote }).then((res) => {
      setBusy(false);
      if (!res.ok) {
        if (res.signIn) return router.push(SIGN_IN);
        return setError(res.message);
      }
      setHelpSent(res.value.number);
    });
  };

  const widen = (b: Brief) => {
    setBrief(b);
    setResult(null);
    setStep(FINDING);
  };

  const cta: { label: string; enabled: boolean } | null =
    step === INTRO
      ? { label: 'Start', enabled: true }
      : inBrief
        ? { label: step === STEP_COUNT ? 'Find my makers' : 'Next', enabled: ready }
        : step === MATCHES && result && result.eligibleCount > 0
          ? {
              label: busy
                ? 'Sending…'
                : `Send to ${picked.length} maker${picked.length === 1 ? '' : 's'}`,
              enabled: picked.length > 0 && !busy,
            }
          : null;
  const showBack = step > INTRO && step !== FINDING && step !== SENT && !helpSent;
  const progress = inBrief ? Math.round((step / STEP_COUNT) * 100) : 0;

  return (
    <div className="min-h-screen bg-ground text-ink" data-testid="have-it-made" data-step={step}>
      <header className="sticky top-0 z-20 grid h-[64px] grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-ground px-4 md:h-[72px] md:px-10">
        <span>
          {showBack && (
            <button
              type="button"
              onClick={back}
              className="min-h-[44px] text-[11px] uppercase tracking-[0.16em]"
              data-testid="flow-back"
            >
              ← Back
            </button>
          )}
        </span>
        <Link href="/" aria-label="Off One home" className="justify-self-center">
          <Wordmark size="mobile" />
        </Link>
        <Link
          href={closeHref}
          className="min-h-[44px] justify-self-end text-[11px] uppercase leading-[44px] tracking-[0.16em]"
          data-testid="flow-close"
        >
          Close ×
        </Link>
      </header>
      {inBrief && (
        <div
          className="relative h-0.5 bg-line"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEP_COUNT}
          aria-valuenow={step}
          aria-valuetext={`Step ${step} of ${STEP_COUNT}`}
          aria-label="Your brief"
        >
          <span
            className="absolute inset-y-0 left-0 bg-ink transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mx-auto grid max-w-[1120px] items-start gap-10 px-4 pb-32 pt-7 md:grid-cols-[minmax(0,1fr)_340px] md:gap-[72px] md:px-10 md:pb-20 md:pt-12">
        <div ref={liveRef} tabIndex={-1} className="flex max-w-[640px] flex-col gap-7 outline-none">
          {inBrief && (
            <Cap>
              <span aria-live="polite">
                Step {step} of {STEP_COUNT}
              </span>
            </Cap>
          )}

          {step === INTRO && (
            <div className="step-in flex flex-col gap-[22px]">
              <div className="relative h-[300px] overflow-hidden bg-[#D2CBC1] md:h-[360px]">
                <Image
                  src="/custom/hero.jpg"
                  alt=""
                  fill
                  priority
                  sizes="(min-width: 768px) 640px, 100vw"
                  className="object-cover object-[center_25%]"
                />
                <span
                  aria-hidden
                  className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_45%,rgba(0,0,0,0.5))]"
                />
                <span className="absolute bottom-4 left-[18px] text-[10px] uppercase tracking-[0.18em] text-white/90">
                  Custom, made by hand
                </span>
              </div>
              <Title plain="Have something made" italic="just for you." size="lg" />
              <p className="text-[14px] text-muted">
                Tell us what you’re dreaming of. We’ll match you with makers who can make it, in
                your size, by your date. About two minutes.
              </p>
              <ol className="border-t border-line">
                {[
                  ['01', 'Describe it', 'Photos, words, your measurements, your budget'],
                  [
                    '02',
                    'Meet your matches',
                    `Pick up to ${CUSTOM.maxMakers} makers to send it to`,
                  ],
                  ['03', 'Compare quotes, choose one', 'Free to ask. Pay only when you accept.'],
                ].map(([n, t, s]) => (
                  <li key={n} className="flex gap-3.5 border-b border-line py-3">
                    <span className="pt-[3px] text-[10px] uppercase tracking-[0.18em]">{n}</span>
                    <span>
                      <b className="font-medium">{t}</b>
                      <br />
                      <span className="text-[13px] text-muted">{s}</span>
                    </span>
                  </li>
                ))}
              </ol>
              {source && sourceShown && (
                <div
                  className="flex items-center gap-2.5 bg-stone-light px-3 py-2.5"
                  data-testid="source-chip"
                >
                  <span className="relative h-[45px] w-9 shrink-0 overflow-hidden bg-[#D2CBC1]">
                    {source.imageUrl && (
                      <Image
                        src={source.imageUrl}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover object-top"
                      />
                    )}
                  </span>
                  <span className="flex flex-col text-[13px]">
                    <Cap>Starting from</Cap>
                    {source.title} · {source.maker}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceShown(false);
                      set('sourceListingId', null);
                    }}
                    className="ml-auto text-[12px] underline underline-offset-[3px]"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 1 && <KindStep brief={brief} set={set} />}
          {step === 2 && <OccasionStep brief={brief} set={set} today={today} />}
          {step === 3 && (
            <InspirationStep
              brief={brief}
              set={set}
              signedIn={signedIn}
              onNeedSignIn={() => {
                writeDraft(brief, 3);
                router.push(SIGN_IN);
              }}
            />
          )}
          {step === 4 && <FabricStep brief={brief} set={set} />}
          {step === 5 && <FitStep brief={brief} set={set} saved={saved} signedIn={signedIn} />}
          {step === 6 && <BudgetStep brief={brief} set={set} />}
          {step === 7 && <WhereStep brief={brief} set={set} />}

          {step === FINDING && (
            <Finding
              brief={brief}
              neededBy={by}
              checked={result?.checked ?? makerCount}
              onSkip={skipFinding}
            />
          )}

          {step === MATCHES && result && result.eligibleCount > 0 && (
            <MatchList
              result={result}
              picked={picked}
              onPick={pick}
              anonymous={brief.anonymous}
              onHelp={() => setStep(HELP)}
              limitHit={limitHit}
            />
          )}
          {step === MATCHES && result && result.eligibleCount === 0 && (
            <NoMatches
              result={result}
              brief={brief}
              neededBy={by}
              onWiden={widen}
              onHelp={() => setStep(HELP)}
            />
          )}

          {step === SENT && sent && (
            <div className="step-in flex flex-col gap-[18px]" data-testid="sent">
              <Cap>
                Sent to {sent.makers.length} maker{sent.makers.length === 1 ? '' : 's'} ·{' '}
                {sent.number}
              </Cap>
              <Title plain="Your brief is" italic="on its way." />
              <p className="-mt-1.5 text-[13px] text-muted">
                {brief.anonymous ? 'You’re anonymous until you accept a quote. ' : ''}
                {listNames(sent.makers)} {sent.makers.length === 1 ? 'has' : 'have'} your brief
                {brief.fitMode === 'fitting' ? '' : ' and measurements'}.
              </p>
              <Timeline />
              <Link
                href={`/account/requests/${sent.number}`}
                className="inline-flex min-h-[48px] items-center justify-center self-start border border-ink px-5 text-[10px] uppercase tracking-[0.18em]"
                data-testid="see-request"
              >
                See my request
              </Link>
            </div>
          )}

          {step === HELP && !helpSent && (
            <div className="step-in flex flex-col gap-4" data-testid="help">
              <Title plain="We’ll" italic="take it from here." />
              <p className="-mt-1.5 text-[13px] text-muted">
                Your brief goes to the Off One team. We’ll personally reach out to makers and reply
                within 1 business day.
              </p>
              <label className="flex flex-col gap-1.5">
                <Cap>Anything else we should know?</Cap>
                <textarea
                  className={areaClass}
                  rows={3}
                  value={helpNote}
                  onChange={(e) => setHelpNote(e.target.value)}
                  placeholder="e.g. I’m flexible on the date if it means the right maker"
                  maxLength={2000}
                  data-testid="help-note"
                />
              </label>
              <Glass
                onClick={help}
                disabled={busy}
                className="self-start md:min-w-[260px]"
                data-testid="help-send"
              >
                {busy ? 'Sending…' : 'Send to the Off One team'}
              </Glass>
            </div>
          )}
          {step === HELP && helpSent && (
            <div className="step-in flex flex-col gap-4" data-testid="help-sent">
              <Cap>{helpSent}</Cap>
              <Title plain="We’ll" italic="take it from here." />
              <p className="-mt-1.5 text-[13px] text-muted">
                Your brief is with the Off One team. We’ll reply within 1 business day, by email.
              </p>
              <Link
                href="/"
                className="inline-flex min-h-[48px] items-center justify-center border border-ink text-[10px] uppercase tracking-[0.18em]"
              >
                Back to browsing
              </Link>
            </div>
          )}

          {error && (
            <p
              className="bg-error-bg px-3 py-2.5 text-[13px] text-error"
              role="alert"
              data-testid="flow-error"
            >
              {error}
            </p>
          )}

          {cta && (
            <Glass
              onClick={next}
              disabled={!cta.enabled}
              className="hidden min-w-[260px] self-start md:inline-flex"
              data-testid="flow-next"
            >
              {cta.label}
            </Glass>
          )}
        </div>

        <BriefCard brief={brief} today={today} />
      </div>

      {cta && (
        <div className="glass-nav fixed inset-x-0 bottom-0 z-30 border-t border-line px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3 md:hidden">
          <Glass
            onClick={next}
            disabled={!cta.enabled}
            className="w-full"
            data-testid="flow-next-phone"
          >
            {cta.label}
          </Glass>
        </div>
      )}
    </div>
  );
}

const listNames = (names: string[]) =>
  names.length <= 1
    ? names.join('')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** Brief sent → Makers reply → You compare → They make it. */
export function Timeline({
  done = 1,
  items = DEFAULT_TIMELINE,
}: {
  done?: number;
  items?: Array<[string, string]>;
}) {
  return (
    <ol className="ml-1.5 flex flex-col gap-4 border-l border-ink" data-testid="timeline">
      {items.map(([t, s], i) => (
        <li key={t} className="relative pl-5">
          <span
            aria-hidden
            className={`absolute -left-[6px] top-1 h-[11px] w-[11px] rounded-circle border border-ink ${i < done ? 'bg-ink' : 'bg-ground'}`}
          />
          <b className="font-medium">{t}</b>
          <br />
          <span className="text-[12px] text-muted-2">{s}</span>
        </li>
      ))}
    </ol>
  );
}

const DEFAULT_TIMELINE: Array<[string, string]> = [
  ['Brief sent', 'Just now'],
  ['Makers reply with quotes', `Within ${CUSTOM.replyHours} hours. We’ll email you.`],
  ['You compare and choose', 'Message any maker with questions first'],
  ['They make it, you follow along', 'Sketch, fabric, fitting, sent'],
];
