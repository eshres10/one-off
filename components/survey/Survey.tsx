'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Wordmark } from '@/components/ui/Wordmark';
import {
  FOLLOW_UP,
  MIN_SECONDS,
  Q9_MAX,
  Q9_NOTHING,
  QUESTIONS,
  STEP_COUNT,
  WISH_MAX,
  type SingleKey,
  type SurveyQuestion,
} from '@/lib/survey/questions';

/*
 * The maker survey: one screen per question, auto-advance after a tap, Back and Next, a
 * progress bar, saved in localStorage until it's sent. Phone first; nothing but the survey.
 *
 * Screens: INTRO → 1…11 → FOLLOW (12) → THANKS.
 */

const INTRO = 0;
const FOLLOW = STEP_COUNT; // 12
const THANKS = STEP_COUNT + 1;
const AUTO_MS = 250;
const STORAGE = 'oo:survey';

type Answers = Partial<Record<SingleKey, string>> & {
  q9_blockers: string[];
  q11_wish: string;
  follow_up: string;
  contact_name: string;
  label_name: string;
  contact_email: string;
  instagram: string;
  consent_contact: boolean;
};

const EMPTY: Answers = {
  q9_blockers: [],
  q11_wish: '',
  follow_up: '',
  contact_name: '',
  label_name: '',
  contact_email: '',
  instagram: '',
  consent_contact: false,
};

interface Saved {
  answers: Answers;
  step: number;
  startedAt: number;
}

function read(): Saved | null {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (!raw) return null;
    const s = JSON.parse(raw) as Saved;
    if (!s || typeof s !== 'object' || !s.answers) return null;
    return { answers: { ...EMPTY, ...s.answers }, step: s.step ?? INTRO, startedAt: s.startedAt };
  } catch {
    return null;
  }
}
function write(s: Saved) {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(s));
  } catch {
    /* private mode or full: the survey still works */
  }
}
function clear() {
  try {
    localStorage.removeItem(STORAGE);
  } catch {
    /* ignore */
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function Survey({ src, refTag }: { src: string | null; refTag: string | null }) {
  const [step, setStep] = useState(INTRO);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [honey, setHoney] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const s = read();
    if (s) {
      setAnswers(s.answers);
      setStep(s.step > THANKS ? INTRO : s.step);
      setStartedAt(s.startedAt || Date.now());
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || step === THANKS) return;
    write({ answers, step, startedAt });
  }, [answers, step, startedAt, hydrated]);

  // Each screen starts at the top, with its heading announced.
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const set = useCallback(<K extends keyof Answers>(key: K, value: Answers[K]) => {
    setAnswers((a) => ({ ...a, [key]: value }));
  }, []);

  const q: SurveyQuestion | null =
    step >= 1 && step <= QUESTIONS.length ? QUESTIONS[step - 1]! : null;

  const ready = useMemo(() => {
    if (q?.kind === 'single') return Boolean(answers[q.key as SingleKey]);
    if (q?.kind === 'multi') return answers.q9_blockers.length > 0;
    if (q?.kind === 'text') return true;
    if (step === FOLLOW) {
      if (!answers.follow_up) return false;
      if (answers.follow_up === 'no') return true;
      return (
        answers.contact_name.trim().length > 0 &&
        EMAIL_RE.test(answers.contact_email.trim()) &&
        answers.consent_contact
      );
    }
    return true;
  }, [q, answers, step]);

  const go = (to: number) => {
    setError(null);
    setStep(Math.max(INTRO, Math.min(THANKS, to)));
  };

  const pick = (key: SingleKey, value: string) => {
    set(key, value);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => go(step + 1), AUTO_MS);
  };

  const toggleBlocker = (key: string) => {
    setAnswers((a) => {
      const has = a.q9_blockers.includes(key);
      if (key === Q9_NOTHING) return { ...a, q9_blockers: has ? [] : [Q9_NOTHING] };
      const rest = a.q9_blockers.filter((k) => k !== Q9_NOTHING);
      if (has) return { ...a, q9_blockers: rest.filter((k) => k !== key) };
      if (rest.length >= Q9_MAX) return a;
      return { ...a, q9_blockers: [...rest, key] };
    });
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const duration = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    const optedIn = answers.follow_up !== 'no';
    const body = {
      src,
      ref: refTag,
      ...Object.fromEntries(
        QUESTIONS.filter((x) => x.kind === 'single').map((x) => [
          x.key,
          answers[x.key as SingleKey] ?? null,
        ]),
      ),
      q9_blockers: answers.q9_blockers,
      q11_wish: answers.q11_wish.trim() || null,
      follow_up: answers.follow_up,
      contact_name: optedIn ? answers.contact_name.trim() || null : null,
      label_name: optedIn ? answers.label_name.trim() || null : null,
      contact_email: optedIn ? answers.contact_email.trim() || null : null,
      instagram: optedIn ? answers.instagram.trim().replace(/^@/, '') || null : null,
      consent_contact: optedIn ? answers.consent_contact : false,
      duration_seconds: duration,
      website: honey,
    };
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setError(
          duration < MIN_SECONDS
            ? 'That was quick. Take a moment and try again.'
            : (json.message ?? 'Couldn’t send that. Please try again.'),
        );
        return;
      }
      clear();
      setStep(THANKS);
    } catch {
      setError('Couldn’t reach Off One. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const next = () => {
    if (!ready) return;
    if (step === FOLLOW) return void submit();
    go(step + 1);
  };

  const progressN = step >= 1 && step <= FOLLOW ? step : 0;
  const pct = step === THANKS ? 100 : Math.round((progressN / FOLLOW) * 100);
  const founding = answers.follow_up === 'founding';

  const optionClass = (on: boolean, disabled = false) =>
    `flex min-h-[56px] w-full items-center justify-between gap-3 border px-4 py-3 text-left text-[16px] leading-snug transition-colors ${
      on
        ? 'border-ink bg-ink text-ground'
        : disabled
          ? 'border-line text-muted-2'
          : 'border-ink bg-ground text-ink hover:bg-stone-light'
    }`;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-5 pb-10 pt-5">
      <header className="flex flex-col items-center gap-4">
        <Wordmark size="mobile" />
        {step >= 1 && step <= FOLLOW && (
          <div className="w-full" data-testid="survey-progress">
            <div
              className="h-[3px] w-full bg-stone-light"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={FOLLOW}
              aria-valuenow={progressN}
              aria-valuetext={`${progressN} of ${FOLLOW}`}
            >
              <div className="h-full bg-ink transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted">
              {progressN} of {FOLLOW}
            </p>
          </div>
        )}
      </header>

      <main className="flex flex-1 flex-col pt-8" aria-live="polite">
        {step === INTRO && (
          <section data-testid="survey-intro">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-[40px] leading-[1.02] outline-none"
            >
              Help shape a marketplace <em>made for makers.</em>
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              I’m building Off One, a home for Australian independent designers. 10 quick taps,
              about 5 minutes. Answers are anonymous unless you choose to leave your details.
            </p>
            <p className="mt-3 text-[16px] text-muted">— Ena, founder</p>
            <button
              type="button"
              onClick={() => {
                setStartedAt(Date.now());
                go(1);
              }}
              className="mt-8 flex min-h-[56px] w-full items-center justify-center bg-ink text-[12px] uppercase tracking-[0.18em] text-ground"
              data-testid="survey-start"
            >
              Start
            </button>
          </section>
        )}

        {q && (
          <section data-testid={`survey-q${q.n}`} key={q.key}>
            <h1
              ref={headingRef}
              tabIndex={-1}
              id={`q-${q.n}`}
              className="font-display text-[32px] leading-[1.08] outline-none"
            >
              {q.question}
            </h1>
            {q.hint && <p className="mt-2 text-[14px] text-muted">{q.hint}</p>}

            {q.kind === 'single' && (
              <div
                role="radiogroup"
                aria-labelledby={`q-${q.n}`}
                className="mt-6 flex flex-col gap-2"
              >
                {q.options.map((o) => {
                  const on = answers[q.key as SingleKey] === o.key;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => pick(q.key as SingleKey, o.key)}
                      className={optionClass(on)}
                      data-testid={`opt-${o.key}`}
                    >
                      <span>{o.label}</span>
                      <span
                        aria-hidden
                        className={`h-4 w-4 shrink-0 rounded-circle border ${on ? 'border-ground bg-ground' : 'border-ink'}`}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {q.kind === 'multi' && (
              <div role="group" aria-labelledby={`q-${q.n}`} className="mt-6 flex flex-col gap-2">
                {q.options.map((o) => {
                  const on = answers.q9_blockers.includes(o.key);
                  const full =
                    !on &&
                    o.key !== Q9_NOTHING &&
                    answers.q9_blockers.filter((k) => k !== Q9_NOTHING).length >= Q9_MAX;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      aria-disabled={full || undefined}
                      disabled={full}
                      onClick={() => toggleBlocker(o.key)}
                      className={optionClass(on, full)}
                      data-testid={`opt-${o.key}`}
                    >
                      <span>{o.label}</span>
                      <span
                        aria-hidden
                        className={`h-4 w-4 shrink-0 border ${on ? 'border-ground bg-ground' : full ? 'border-line' : 'border-ink'}`}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {q.kind === 'text' && (
              <div className="mt-6">
                <label htmlFor="wish" className="sr-only">
                  {q.question}
                </label>
                <textarea
                  id="wish"
                  value={answers.q11_wish}
                  maxLength={WISH_MAX}
                  rows={5}
                  onChange={(e) => set('q11_wish', e.target.value.slice(0, WISH_MAX))}
                  placeholder="Anything at all."
                  className="w-full border border-ink bg-ground p-4 text-[16px] leading-relaxed outline-none focus:ring-2 focus:ring-ink/30"
                  data-testid="wish"
                />
                <p className="mt-1 text-right text-[12px] text-muted" aria-live="polite">
                  {answers.q11_wish.length}/{WISH_MAX}
                </p>
              </div>
            )}
          </section>
        )}

        {step === FOLLOW && (
          <section data-testid="survey-follow-up">
            <h1
              ref={headingRef}
              tabIndex={-1}
              id="q-follow"
              className="font-display text-[32px] leading-[1.08] outline-none"
            >
              Can I follow up?
            </h1>
            <div role="radiogroup" aria-labelledby="q-follow" className="mt-6 flex flex-col gap-2">
              {FOLLOW_UP.map((o) => {
                const on = answers.follow_up === o.key;
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set('follow_up', o.key)}
                    className={optionClass(on)}
                    data-testid={`follow-${o.key}`}
                  >
                    <span>{o.label}</span>
                    <span
                      aria-hidden
                      className={`h-4 w-4 shrink-0 rounded-circle border ${on ? 'border-ground bg-ground' : 'border-ink'}`}
                    />
                  </button>
                );
              })}
            </div>
            {answers.follow_up && answers.follow_up !== 'no' && (
              <div className="mt-6 flex flex-col gap-4" data-testid="contact-fields">
                <Field
                  id="contact_name"
                  label="First name"
                  value={answers.contact_name}
                  onChange={(v) => set('contact_name', v)}
                  autoComplete="given-name"
                  required
                />
                <Field
                  id="label_name"
                  label="Label name"
                  value={answers.label_name}
                  onChange={(v) => set('label_name', v)}
                  autoComplete="organization"
                />
                <Field
                  id="contact_email"
                  label="Email"
                  type="email"
                  value={answers.contact_email}
                  onChange={(v) => set('contact_email', v)}
                  autoComplete="email"
                  required
                  invalid={
                    answers.contact_email.length > 0 && !EMAIL_RE.test(answers.contact_email.trim())
                  }
                />
                <Field
                  id="instagram"
                  label="Instagram handle (optional)"
                  value={answers.instagram}
                  onChange={(v) => set('instagram', v.replace(/^@/, ''))}
                  autoComplete="off"
                  prefix="@"
                />
                <label className="flex items-start gap-3 text-[14px] leading-snug">
                  <input
                    type="checkbox"
                    checked={answers.consent_contact}
                    onChange={(e) => set('consent_contact', e.target.checked)}
                    required
                    className="mt-1 h-5 w-5 shrink-0 accent-ink"
                    data-testid="consent"
                  />
                  <span>
                    Off One can contact me about this survey and founding maker places. I can opt
                    out any time.
                  </span>
                </label>
                <p className="text-[12px] text-muted">
                  We’ll only use this to get in touch about Off One. We won’t share it.
                </p>
              </div>
            )}
            {/* Honeypot: hidden from people, filled in by bots. */}
            <div className="absolute left-[-9999px] top-0 h-px w-px overflow-hidden" aria-hidden>
              <label htmlFor="website">Website</label>
              <input
                id="website"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={honey}
                onChange={(e) => setHoney(e.target.value)}
              />
            </div>
          </section>
        )}

        {step === THANKS && (
          <section data-testid="survey-thanks">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-display text-[40px] leading-[1.02] outline-none"
            >
              Thank you. <em>Truly.</em>
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              Every answer goes straight into how Off One is built.
            </p>
            {founding && (
              <p className="mt-3 text-[16px] leading-relaxed" data-testid="founding-note">
                I’ll be in touch within 48 hours.
              </p>
            )}
            <a
              href="https://instagram.com/offone___"
              className="mt-8 inline-flex min-h-[52px] w-full items-center justify-center border border-ink text-[12px] uppercase tracking-[0.18em]"
              rel="noreferrer"
            >
              Follow @offone___
            </a>
          </section>
        )}

        {error && (
          <p className="mt-5 bg-[#F3E3DF] px-4 py-3 text-[14px] text-[#8A2E1C]" role="alert">
            {error}
          </p>
        )}
      </main>

      {step >= 1 && step <= FOLLOW && (
        <nav className="mt-8 flex items-center gap-3" aria-label="Survey">
          <button
            type="button"
            onClick={() => go(step - 1)}
            className="min-h-[52px] px-4 text-[12px] uppercase tracking-[0.18em] underline underline-offset-[5px]"
            data-testid="survey-back"
          >
            Back
          </button>
          {q?.kind === 'text' && !answers.q11_wish && (
            <button
              type="button"
              onClick={() => go(step + 1)}
              className="min-h-[52px] px-4 text-[12px] uppercase tracking-[0.18em] text-muted"
              data-testid="survey-skip"
            >
              Skip
            </button>
          )}
          <button
            type="button"
            onClick={next}
            disabled={!ready || busy}
            className="ml-auto flex min-h-[52px] min-w-[140px] items-center justify-center bg-ink px-6 text-[12px] uppercase tracking-[0.18em] text-ground disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="survey-next"
          >
            {step === FOLLOW ? (busy ? 'Sending…' : 'Send') : 'Next'}
          </button>
        </nav>
      )}

      <footer className="mt-10 text-center text-[12px] text-muted">
        <a href="https://offone.com.au/privacy" className="underline underline-offset-[3px]">
          Privacy policy
        </a>
      </footer>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required,
  invalid,
  prefix,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  invalid?: boolean;
  prefix?: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.18em] text-muted">
        {label}
        {required ? '' : ''}
      </span>
      <span className="flex items-center border border-ink bg-ground">
        {prefix && <span className="pl-4 text-[16px] text-muted">{prefix}</span>}
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={invalid || undefined}
          className="min-h-[52px] w-full bg-transparent px-4 text-[16px] outline-none"
          data-testid={id}
        />
      </span>
      {invalid && <span className="text-[12px] text-[#8A2E1C]">Check that email.</span>}
    </label>
  );
}
