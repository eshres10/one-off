'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Img as Image } from '@/components/ui/Img';
import { Switch } from '@/components/studio/Switch';
import { BUDGET_BANDS, CUSTOM, CUSTOM_KINDS } from '@/lib/custom/config';
import {
  COLOURS,
  DETAIL_CHIPS,
  FABRIC_CHIPS,
  INSPIRATION_MAX,
  MAKERS_CHOICE,
  MEASURE_FIELDS,
  OCCASIONS,
  PATTERNS,
  PRICE_GUIDE,
  WORDS_MIN,
  dateNote,
  dateShortcuts,
  fmtDay,
  weeksAway,
  type Brief,
  type Measurements,
} from '@/lib/custom/brief';
import { lookupPostcodeAction, savedSizesAction } from '@/lib/actions/custom';
import { Cap, Chip, Note, OptionRow, Square, Title, areaClass, fieldClass } from './ui';

export type Set = <K extends keyof Brief>(key: K, value: Brief[K]) => void;

const KIND_IMAGE: Record<string, string> = {
  dress: '/custom/kind-dress.jpg',
  one_piece: '/custom/kind-one-piece.jpg',
  suit: '/custom/kind-suit.jpg',
  bridal: '/custom/kind-bridal.jpg',
  top_or_skirt: '/custom/kind-top-or-skirt.jpg',
  other: '/custom/kind-other.jpg',
};

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** 1 · Kind: picture tiles. */
export function KindStep({ brief, set }: { brief: Brief; set: Set }) {
  return (
    <div className="step-in flex flex-col gap-[18px]">
      <Title plain="What are you" italic="dreaming of?" />
      <div
        className="grid grid-cols-2 gap-1.5 md:grid-cols-3"
        role="group"
        aria-label="Kind of piece"
      >
        {CUSTOM_KINDS.map((k) => {
          const on = brief.kind === k.value;
          return (
            <button
              key={k.value}
              type="button"
              aria-pressed={on}
              data-testid={`kind-${k.value}`}
              onClick={() => set('kind', k.value)}
              className={`relative aspect-4/5 overflow-hidden bg-[#D2CBC1] text-left ${on ? 'outline outline-2 outline-offset-2 outline-ink' : ''}`}
            >
              <Image
                src={KIND_IMAGE[k.value]!}
                alt=""
                fill
                sizes="(min-width: 768px) 210px, 45vw"
                className="object-cover object-[center_20%]"
              />
              <span
                aria-hidden
                className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0)_50%,rgba(0,0,0,0.55))]"
              />
              <span className="absolute inset-x-2.5 bottom-2.5 font-display text-[22px] leading-none text-white">
                {k.label}
              </span>
              <span
                aria-hidden
                className={`absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-circle text-[12px] ${on ? 'bg-ink text-ground' : 'bg-white/50 text-transparent'}`}
              >
                ✓
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 2 · Occasion and needed-by. */
export function OccasionStep({ brief, set, today }: { brief: Brief; set: Set; today: Date }) {
  const s = dateShortcuts(today);
  const minDate = new Date(today.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const dates: Array<{ key: Brief['dateChoice']; label: string; sub: string }> = [
    { key: 'soon', label: fmtDay(s.soon), sub: weeksAway(s.soon, today) },
    { key: 'later', label: fmtDay(s.later), sub: weeksAway(s.later, today) },
    {
      key: 'custom',
      label: 'Pick a date',
      sub: brief.customDate ? fmtDay(brief.customDate) : 'choose your own',
    },
    { key: 'flexible', label: 'Flexible', sub: 'no rush' },
  ];
  return (
    <div className="step-in flex flex-col gap-[18px]">
      <Title plain="What’s it" italic="for?" />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Occasion">
        {OCCASIONS.map((o) => (
          <Chip
            key={o.value}
            pressed={brief.occasion === o.value}
            onClick={() => set('occasion', o.value)}
            data-testid={`occasion-${o.value}`}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      {brief.occasion === 'other' && (
        <label className="step-in flex flex-col gap-1.5">
          <Cap>Tell us what it’s for</Cap>
          <input
            className={fieldClass}
            value={brief.occasionOther}
            onChange={(e) => set('occasionOther', e.target.value)}
            placeholder="e.g. my graduation, a gallery opening, a christening"
            maxLength={120}
            data-testid="occasion-other"
          />
        </label>
      )}
      <div className="flex flex-col gap-2">
        <Cap>I need it by</Cap>
        <div className="grid grid-cols-2 gap-1 md:grid-cols-4" role="group" aria-label="Needed by">
          {dates.map((d) => (
            <Square
              key={d.key}
              pressed={brief.dateChoice === d.key}
              label={d.label}
              sub={d.sub}
              onClick={() => set('dateChoice', d.key)}
              data-testid={`date-${d.key}`}
            />
          ))}
        </div>
        {brief.dateChoice === 'custom' && (
          <label className="step-in flex flex-col gap-1.5">
            <Cap>Your date</Cap>
            <input
              type="date"
              className={fieldClass}
              min={minDate}
              value={brief.customDate}
              onChange={(e) => set('customDate', e.target.value)}
              data-testid="date-custom-input"
            />
          </label>
        )}
        <span className="text-[12px] text-muted" data-testid="date-note">
          {dateNote(brief, today)}
        </span>
      </div>
    </div>
  );
}

/** 3 · Inspiration photos, a link and their words. */
export function InspirationStep({
  brief,
  set,
  signedIn,
  onNeedSignIn,
}: {
  brief: Brief;
  set: Set;
  signedIn: boolean;
  onNeedSignIn: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const words = brief.words.trim().length;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (!signedIn) return onNeedSignIn();
    setError(null);
    setBusy(true);
    const next = [...brief.inspiration];
    for (const file of Array.from(files).slice(0, INSPIRATION_MAX - next.length)) {
      const body = new FormData();
      body.set('file', file);
      body.set('kind', 'commissions');
      const res = await fetch('/api/uploads', { method: 'POST', body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.status === 401) {
        setBusy(false);
        return onNeedSignIn();
      }
      if (!res.ok || !json.url) setError(json.error ?? 'That photo didn’t upload.');
      else next.push(json.url);
    }
    set('inspiration', next);
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="step-in flex flex-col gap-[18px]">
      <Title plain="Show us" italic="what you love." />
      <p className="-mt-1.5 text-[13px] text-muted">
        Screenshots, Pinterest, a photo of your mum’s wedding dress. Anything helps.
      </p>
      <div className="grid grid-cols-3 gap-1" data-testid="inspiration">
        {brief.inspiration.map((src) => (
          <div key={src} className="relative aspect-4/5 overflow-hidden bg-[#D2CBC1]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-[center_20%]"
            />
            <button
              type="button"
              aria-label="Remove photo"
              onClick={() =>
                set(
                  'inspiration',
                  brief.inspiration.filter((x) => x !== src),
                )
              }
              className="glass-light absolute right-1 top-1 flex h-[26px] w-[26px] items-center justify-center text-ink"
            >
              ×
            </button>
          </div>
        ))}
        {brief.inspiration.length < INSPIRATION_MAX && (
          <label className="flex aspect-4/5 cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-muted-2 text-[12px] text-ink">
            <span className="text-[22px] leading-none">+</span>
            {busy ? 'Adding…' : 'Add photos'}
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => upload(e.target.files)}
              disabled={busy}
              data-testid="inspiration-input"
            />
          </label>
        )}
      </div>
      {error && (
        <p className="text-[12px] text-error" role="alert">
          {error}
        </p>
      )}
      <input
        className={fieldClass}
        value={brief.link}
        onChange={(e) => set('link', e.target.value)}
        placeholder="Or paste a Pinterest or Instagram link"
        inputMode="url"
        aria-label="Pinterest or Instagram link"
        data-testid="brief-link"
      />
      <label className="flex flex-col gap-1.5">
        <span className="flex items-baseline justify-between">
          <Cap>In your words</Cap>
          <span className={`text-[11px] ${words < WORDS_MIN ? 'text-muted-2' : 'text-muted'}`}>
            {words < WORDS_MIN ? `${WORDS_MIN - words} more characters` : `${words}`}
          </span>
        </span>
        <textarea
          className={areaClass}
          rows={4}
          value={brief.words}
          onChange={(e) => set('words', e.target.value)}
          placeholder="Like the butter slip, but floor-length with a low back and fluttery sleeves. Something I can dance in at my sister’s wedding."
          maxLength={2000}
          data-testid="brief-words"
        />
      </label>
    </div>
  );
}

/** 4 · Fabric, details, colour and print. All optional. */
export function FabricStep({ brief, set }: { brief: Brief; set: Set }) {
  const custom = brief.colour?.startsWith('custom:') ? brief.colour.slice(7) : null;
  const [customHex, setCustomHex] = useState(custom ?? '#7A5C9E');
  const ring = 'shadow-[0_0_0_2px_#F6F4F0,0_0_0_3px_#111111]';
  const colourName = !brief.colour
    ? 'Pick one, or leave it to the maker'
    : brief.colour === MAKERS_CHOICE
      ? 'Maker’s choice'
      : custom
        ? `Your colour · ${custom.toUpperCase()}`
        : brief.colour;
  return (
    <div className="step-in flex flex-col gap-[18px]">
      <Title plain="Fabric and" italic="details." />
      <p className="-mt-1.5 text-[13px] text-muted">
        Optional. Pick any that matter, or let the maker suggest.
      </p>
      <div className="flex flex-col gap-2">
        <Cap>Fabric</Cap>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fabric">
          {FABRIC_CHIPS.map((f) => (
            <Chip
              key={f}
              pressed={brief.fabrics.includes(f)}
              onClick={() => set('fabrics', toggle(brief.fabrics, f))}
              data-testid={`fabric-${f.toLowerCase().replace(/\s/g, '-')}`}
            >
              {f}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Cap>Details</Cap>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Details">
          {DETAIL_CHIPS.map((d) => (
            <Chip
              key={d}
              pressed={brief.details.includes(d)}
              onClick={() => set('details', toggle(brief.details, d))}
            >
              {d}
            </Chip>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <Cap>Colour</Cap>
          <span className="text-[12px]" data-testid="colour-name">
            {colourName}
          </span>
        </div>
        <div className="flex flex-wrap gap-2.5" role="group" aria-label="Colour">
          {COLOURS.map(([name, hex]) => (
            <button
              key={name}
              type="button"
              aria-label={name}
              aria-pressed={brief.colour === name}
              title={name}
              onClick={() => set('colour', name)}
              className={`h-10 w-10 rounded-circle border border-black/10 ${brief.colour === name ? ring : ''}`}
              style={{ background: hex }}
              data-testid={`colour-${name.toLowerCase()}`}
            />
          ))}
          <label
            title="Pick your own colour"
            className={`relative h-10 w-10 cursor-pointer overflow-hidden rounded-circle ${custom ? ring : ''}`}
            style={{
              background: 'conic-gradient(#E53935, #FDD835, #43A047, #1E88E5, #8E24AA, #E53935)',
            }}
          >
            <span
              aria-hidden
              className="absolute inset-[7px] rounded-circle border border-white/80"
              style={{ background: customHex }}
            />
            <input
              type="color"
              value={customHex}
              aria-label="Pick your own colour"
              onChange={(e) => {
                setCustomHex(e.target.value);
                set('colour', `custom:${e.target.value}`);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              data-testid="colour-custom"
            />
          </label>
          <Chip
            pressed={brief.colour === MAKERS_CHOICE}
            onClick={() => set('colour', MAKERS_CHOICE)}
            className="text-[12px]"
          >
            Maker’s choice
          </Chip>
        </div>
        <span className="text-[11px] text-muted-2">
          Tap the rainbow to pick any colour you like.
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="flex items-baseline justify-between">
          <Cap>Print or pattern</Cap>
          <span className="text-[12px]">
            {PATTERNS.find((p) => p.value === brief.pattern)?.name}
          </span>
        </div>
        <div
          className="grid grid-cols-4 gap-2 md:grid-cols-6"
          role="group"
          aria-label="Print or pattern"
        >
          {PATTERNS.map((p) => {
            const on = brief.pattern === p.value;
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={on}
                onClick={() => set('pattern', p.value)}
                className="flex flex-col gap-1.5 text-left text-[11px]"
                data-testid={`pattern-${p.value}`}
              >
                <span
                  aria-hidden
                  className={`block aspect-square w-full border border-black/10 ${on ? 'outline outline-2 outline-offset-2 outline-ink' : ''}`}
                  style={{ background: p.bg }}
                />
                <span>{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export interface SavedSizes {
  usualSize: string | null;
  bust: number | null;
  waist: number | null;
  hips: number | null;
}

/** 5 · Fit: saved sizes, measurements or an in-person fitting. */
export function FitStep({
  brief,
  set,
  saved,
  signedIn,
}: {
  brief: Brief;
  set: Set;
  saved: SavedSizes | null;
  signedIn: boolean;
}) {
  const hasSaved = Boolean(saved && (saved.bust || saved.waist || saved.hips));
  // Picking "Use my saved sizes" pulls the account's measurements into the brief.
  useEffect(() => {
    if (brief.fitMode !== 'saved' || !signedIn) return;
    savedSizesAction().then((m) => set('measurements', { ...m, ...brief.measurements }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief.fitMode, signedIn]);
  const num = (key: keyof Measurements, v: string) => {
    const n = v.trim() === '' ? undefined : Number(v);
    const next = { ...brief.measurements };
    if (n === undefined || Number.isNaN(n)) delete next[key];
    else next[key] = n;
    set('measurements', next);
  };
  const savedLine = saved
    ? [
        saved.usualSize ? `AU ${saved.usualSize}` : null,
        saved.bust ? `bust ${saved.bust}` : null,
        saved.waist ? `waist ${saved.waist}` : null,
        saved.hips ? `hip ${saved.hips}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';
  return (
    <div className="step-in flex flex-col gap-[18px]">
      <Title plain="Let’s get" italic="the fit right." />
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Fit">
        {hasSaved && (
          <OptionRow
            pressed={brief.fitMode === 'saved'}
            label="Use my saved sizes"
            sub={savedLine}
            onClick={() => set('fitMode', 'saved')}
            data-testid="fit-saved"
          />
        )}
        <OptionRow
          pressed={brief.fitMode === 'measurements'}
          label="Enter my measurements"
          sub="Best for something fitted"
          onClick={() => set('fitMode', 'measurements')}
          data-testid="fit-measurements"
        />
        <OptionRow
          pressed={brief.fitMode === 'fitting'}
          label="I’d like an in-person fitting"
          sub="We’ll match makers near you"
          onClick={() => set('fitMode', 'fitting')}
          data-testid="fit-fitting"
        />
      </div>
      {brief.fitMode === 'measurements' && (
        <>
          <p className="text-[12px] text-muted">
            In centimetres. Bust, waist and hips are the three we need.
          </p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4" data-testid="measurements">
            {MEASURE_FIELDS.map((f) => {
              const v = brief.measurements[f.key];
              const low = typeof v === 'number' && v > 0 && v < f.min;
              const high = typeof v === 'number' && v > f.max;
              return (
                <label key={f.key} className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-2">
                    {f.label}
                    {['bust', 'waist', 'hips'].includes(f.key) ? '' : ' (optional)'}
                  </span>
                  <span className="relative">
                    <input
                      className={`${fieldClass} min-h-[44px] px-2 pr-9 text-[15px] ${low || high ? 'border-[#8A2E1C]' : ''}`}
                      inputMode="decimal"
                      value={v ?? ''}
                      onChange={(e) => num(f.key, e.target.value)}
                      aria-label={`${f.label}, cm`}
                      aria-invalid={low || high ? true : undefined}
                      data-testid={`measure-${f.key}`}
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[12px] text-muted-2"
                    >
                      cm
                    </span>
                  </span>
                  {low && (
                    <button
                      type="button"
                      onClick={() => num(f.key, String(Math.round(v * 2.54)))}
                      className="text-left text-[11px] text-[#8A2E1C] underline underline-offset-[3px]"
                      data-testid={`measure-${f.key}-inches`}
                    >
                      Looks like inches. Use {Math.round(v * 2.54)} cm?
                    </button>
                  )}
                  {high && (
                    <span className="text-[11px] text-[#8A2E1C]">
                      Up to {f.max} cm. Check it and try again.
                    </span>
                  )}
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/size-guide"
              className="text-[12px] text-muted underline-offset-[3px] hover:underline"
            >
              How to measure yourself · 2 min
            </Link>
            {signedIn && (
              <span className="flex items-center gap-2 text-[12px]">
                <span id="save-sizes-label">Save these to my sizes</span>
                <Switch
                  checked={brief.saveMeasurements}
                  onChange={(v) => set('saveMeasurements', v)}
                  labelledBy="save-sizes-label"
                  testId="save-sizes"
                />
              </span>
            )}
          </div>
        </>
      )}
      <Note className="flex gap-2.5">
        <span aria-hidden>🔒</span>
        <span>
          Your measurements go only to the makers you choose, so they can check they can make it for
          you. They’re never shown publicly.
        </span>
      </Note>
    </div>
  );
}

/** 6 · Budget band. */
export function BudgetStep({ brief, set }: { brief: Brief; set: Set }) {
  const guide = PRICE_GUIDE[brief.kind ?? 'other'];
  const kind = CUSTOM_KINDS.find((k) => k.value === brief.kind)?.label.toLowerCase() ?? 'piece';
  return (
    <div className="step-in flex flex-col gap-[18px]">
      <Title plain="What’s your" italic="budget?" />
      <div className="flex flex-col items-center gap-1 pb-1.5 pt-[18px]">
        <span
          className="font-display text-[56px] leading-none md:text-[72px]"
          data-testid="budget-big"
        >
          {BUDGET_BANDS[brief.budget]?.label}
        </span>
        <span className="text-[12px] text-muted-2">including fabric and making</span>
      </div>
      <div className="grid grid-cols-2 gap-1 md:grid-cols-4" role="group" aria-label="Budget">
        {BUDGET_BANDS.map((b, i) => (
          <Square
            key={b.label}
            pressed={brief.budget === i}
            label={b.label}
            onClick={() => set('budget', i)}
            className="min-h-[48px]"
            data-testid={`budget-${i}`}
          />
        ))}
      </div>
      <div className="border border-line bg-[#FBFAF8] p-3.5 text-[13px] leading-[1.55] text-text2">
        <Cap className="mb-1.5">Good to know</Cap>A custom{' '}
        {kind === 'something else' ? 'piece' : kind} usually takes {guide.hours} to make. On Off
        One, most land between{' '}
        <b className="font-medium">
          A${guide.from} and A${guide.to.toLocaleString('en-AU')}
        </b>
        . A higher budget gives you more makers to choose from.
      </div>
    </div>
  );
}

/** 7 · Where: postcode, reach and anonymity. */
export function WhereStep({ brief, set }: { brief: Brief; set: Set }) {
  const [state, setState] = useState<'idle' | 'looking' | 'unknown'>('idle');
  const fitting = brief.fitMode === 'fitting';
  useEffect(() => {
    if (!/^\d{4}$/.test(brief.postcode)) return;
    if (brief.suburb) return;
    let cancelled = false;
    setState('looking');
    lookupPostcodeAction(brief.postcode).then((p) => {
      if (cancelled) return;
      if (p) {
        set('suburb', p.suburb);
        set('state', p.state);
        setState('idle');
      } else setState('unknown');
    });
    return () => {
      cancelled = true;
    };
  }, [brief.postcode, brief.suburb, set]);
  const hint =
    brief.suburb && /^\d{4}$/.test(brief.postcode)
      ? `${brief.suburb}, ${brief.state}. Makers see your suburb, never your address.`
      : state === 'looking'
        ? 'Looking that up…'
        : state === 'unknown'
          ? 'We don’t know that postcode. Check it and try again.'
          : 'Makers see your suburb, never your address.';
  return (
    <div className="step-in flex flex-col gap-[18px]">
      <Title plain="Where are" italic="you?" />
      <label className="flex flex-col gap-1.5">
        <Cap>Postcode</Cap>
        <input
          className={fieldClass}
          inputMode="numeric"
          maxLength={4}
          value={brief.postcode}
          onChange={(e) => {
            set('postcode', e.target.value.replace(/\D/g, '').slice(0, 4));
            set('suburb', '');
            set('state', '');
          }}
          data-testid="postcode"
        />
        <span className="text-[12px] text-muted" data-testid="postcode-hint">
          {hint}
        </span>
      </label>
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Delivery">
        <OptionRow
          pressed={!fitting && brief.reach === 'both'}
          label="Posted or nearby, either is fine"
          sub="Makers anywhere in Australia"
          onClick={() => set('reach', 'both')}
          disabled={fitting}
          data-testid="reach-both"
        />
        <OptionRow
          pressed={fitting || brief.reach === 'near'}
          label="Nearby only, for fittings"
          sub={`Within ${CUSTOM.cityRadiusKm} km of ${brief.suburb || 'you'}${fitting ? ' · you asked for an in-person fitting' : ''}`}
          onClick={() => set('reach', 'near')}
          data-testid="reach-near"
        />
      </div>
      <div className="flex items-center justify-between gap-3.5 border border-line bg-[#FBFAF8] p-3.5">
        <span className="flex flex-col">
          <span id="anon-label" className="font-medium">
            Ask anonymously
          </span>
          <span className="text-[12px] text-muted-2">
            Makers see “A buyer in {brief.suburb || 'your suburb'}”, not your name or photo, until
            you accept a quote.
          </span>
        </span>
        <Switch
          checked={brief.anonymous}
          onChange={(v) => set('anonymous', v)}
          labelledBy="anon-label"
          testId="anonymous"
        />
      </div>
    </div>
  );
}
