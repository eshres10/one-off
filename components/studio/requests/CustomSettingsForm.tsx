'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Img as Image } from '@/components/ui/Img';
import { Switch } from '@/components/studio/Switch';
import { saveCustomSettingsAction } from '@/lib/actions/custom-studio';
import {
  CUSTOM,
  CUSTOM_CATEGORIES,
  FABRIC_OPTIONS,
  LEAD_TIME_CHOICES,
  RADIUS_OPTIONS,
} from '@/lib/custom/config';
import { formatPrice } from '@/lib/domain/money';
import type { CustomSettings, CustomSettingsInput } from '@/lib/services/custom-studio';
import { TERMS } from '@/lib/studio/terms';

function Chip({
  on,
  children,
  onClick,
  testId,
}: {
  on: boolean;
  children: React.ReactNode;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      className={`min-h-[40px] rounded-circle border px-3.5 text-[13px] ${on ? 'border-ink bg-[rgba(17,17,17,0.86)] text-ground' : 'border-line-strong hover:border-ink'}`}
    >
      {children}
    </button>
  );
}

function Row({
  id,
  label,
  sub,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border border-line bg-surface px-4 py-3">
      <span id={id} className="text-[14px]">
        {label}
        {sub && <span className="block text-[12px] text-muted">{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} labelledBy={id} testId={`${id}-switch`} />
    </div>
  );
}

const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** Custom work settings: the switches and chips the matcher reads, with a live preview beside. */
export function CustomSettingsForm({ initial }: { initial: CustomSettings }) {
  const [s, setS] = useState<CustomSettingsInput>({
    open: initial.open,
    spotsPerMonth: initial.spotsPerMonth,
    categories: initial.categories,
    fabrics: initial.fabrics,
    minPrice: initial.minPrice,
    leadTime: initial.leadTime,
    fittingsInPerson: initial.fittingsInPerson,
    fittingRadiusKm: initial.fittingRadiusKm,
    postsAustraliaWide: initial.postsAustraliaWide,
    studioPostcode: initial.studioPostcode,
  });
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CustomSettingsInput>(k: K, v: CustomSettingsInput[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    setSaved(null);
  };
  const save = () =>
    start(async () => {
      setError(null);
      const res = await saveCustomSettingsAction(s);
      if (!res.ok) return setError(res.message);
      setSaved('Saved.');
    });
  const left = Math.max(0, s.spotsPerMonth - initial.spotsUsed);
  const month = new Date().toLocaleDateString('en-AU', {
    month: 'long',
    timeZone: 'Australia/Melbourne',
  });
  const place = initial.studioSuburb ? `${initial.studioSuburb}, ${initial.studioState}` : null;

  return (
    <div
      className="grid gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:gap-16"
      data-testid="custom-settings"
    >
      <div className="flex flex-col gap-6">
        <Row
          id="custom-open"
          label="Open for custom work"
          sub="Buyers can find you in their matches and send you a brief."
          checked={s.open}
          onChange={(v) => set('open', v)}
        />

        <div className="flex items-center justify-between gap-4 border border-line bg-surface px-4 py-3">
          <span className="text-[14px]">
            Custom spots this month
            <span className="block text-[12px] text-muted">
              {initial.spotsUsed} used · {left} left in {month}
            </span>
          </span>
          <span className="flex items-center gap-1" role="group" aria-label="Spots per month">
            <button
              type="button"
              onClick={() => set('spotsPerMonth', Math.max(0, s.spotsPerMonth - 1))}
              className="flex h-11 w-11 items-center justify-center border border-line-strong text-[18px]"
              aria-label="Fewer spots"
            >
              −
            </button>
            <span className="w-8 text-center font-display text-[24px]" data-testid="spots">
              {s.spotsPerMonth}
            </span>
            <button
              type="button"
              onClick={() => set('spotsPerMonth', Math.min(50, s.spotsPerMonth + 1))}
              className="flex h-11 w-11 items-center justify-center border border-line-strong text-[18px]"
              aria-label="More spots"
            >
              +
            </button>
          </span>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            What you make
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_CATEGORIES.map((c) => (
              <Chip
                key={c}
                on={s.categories.includes(c)}
                onClick={() => set('categories', toggle(s.categories, c))}
                testId={`cat-${c.toLowerCase().replace(/[^a-z]+/g, '-')}`}
              >
                {c}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Fabrics you work in
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {FABRIC_OPTIONS.map((f) => (
              <Chip
                key={f}
                on={s.fabrics.includes(f)}
                onClick={() => set('fabrics', toggle(s.fabrics, f))}
              >
                {f}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
              Custom work starts from
            </span>
            <span className="flex min-h-[48px] items-center border border-line-strong bg-[#FBFAF8] px-3">
              <span className="mr-2 text-muted-2">A$</span>
              <input
                inputMode="numeric"
                value={s.minPrice || ''}
                onChange={(e) => set('minPrice', Number(e.target.value.replace(/\D/g, '')) || 0)}
                className="w-full bg-transparent outline-none"
                aria-label="Minimum price, Australian dollars"
                data-testid="min-price"
              />
            </span>
            <span className="text-[12px] text-muted">
              Buyers with a lower budget won’t see you.
            </span>
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
              Usual time to make
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {LEAD_TIME_CHOICES.map((c) => (
                <Chip
                  key={c.label}
                  on={s.leadTime === c.label}
                  onClick={() => set('leadTime', c.label)}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Where you work
          </span>
          <div className="flex items-center justify-between gap-4 border border-line bg-surface px-4 py-3 text-[14px]">
            <span>
              Studio {place ? `· ${place}` : ''}
              <span className="block text-[12px] text-muted">
                {place
                  ? 'Buyers see your suburb, never your address.'
                  : 'Add your studio postcode so nearby buyers find you.'}
              </span>
            </span>
            <label className="flex items-center gap-2 text-[12px]">
              <span className="sr-only">Studio postcode</span>
              <input
                inputMode="numeric"
                maxLength={4}
                value={s.studioPostcode}
                onChange={(e) =>
                  set('studioPostcode', e.target.value.replace(/\D/g, '').slice(0, 4))
                }
                placeholder="3066"
                className="min-h-[44px] w-[88px] border border-line-strong bg-[#FBFAF8] px-3 text-[14px] outline-none focus-visible:border-ink"
                data-testid="studio-postcode"
              />
              <Link href="/studio/settings#profile" className="underline underline-offset-[3px]">
                Change
              </Link>
            </label>
          </div>
          <Row
            id="custom-fittings"
            label="In-person fittings"
            sub="At your studio, for buyers nearby."
            checked={s.fittingsInPerson}
            onChange={(v) => set('fittingsInPerson', v)}
          />
          {s.fittingsInPerson && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fitting radius">
              {RADIUS_OPTIONS.map((r) => (
                <Chip
                  key={r.label}
                  on={s.fittingRadiusKm === r.value}
                  onClick={() => set('fittingRadiusKm', r.value)}
                >
                  {r.label}
                </Chip>
              ))}
            </div>
          )}
          <Row
            id="custom-posts"
            label="Make for buyers anywhere in Australia"
            sub="Posted, tracked, like any order."
            checked={s.postsAustraliaWide}
            onChange={(v) => set('postsAustraliaWide', v)}
          />
        </div>

        {error && (
          <p
            className="bg-error-bg px-3 py-2.5 text-[13px] text-error"
            role="alert"
            data-testid="settings-error"
          >
            {error}
          </p>
        )}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="glass-dark min-h-[52px] px-7 text-[11px] uppercase tracking-[0.18em] text-ground disabled:opacity-60"
            data-testid="save-custom-settings"
          >
            {pending ? 'Saving…' : 'Save'}
          </button>
          {saved && (
            <span className="text-[13px]" role="status">
              {saved}
            </span>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-6">
        <div>
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            How buyers see you in matches
          </span>
          <div
            className={`mt-2 flex border bg-surface ${s.open ? 'border-ink' : 'border-line-strong opacity-60'}`}
            data-testid="settings-preview"
          >
            <span className="relative w-[96px] shrink-0 overflow-hidden bg-[#D2CBC1]">
              {(initial.shop.coverUrl ?? initial.shop.avatarUrl) && (
                <Image
                  src={initial.shop.coverUrl ?? initial.shop.avatarUrl!}
                  alt=""
                  fill
                  sizes="96px"
                  className="object-cover object-[center_20%]"
                />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1.5 px-3.5 py-3">
              <span className="font-display text-[22px] leading-none">{initial.shop.name}</span>
              <span className="text-[12px] text-muted">
                {place ?? 'Your suburb'} · {s.postsAustraliaWide ? 'posts' : 'nearby'}
                {initial.shop.reviewCount > 0 ? ` · ★ ${initial.shop.rating.toFixed(1)}` : ''}
              </span>
              <span className="flex flex-wrap gap-1">
                {[
                  s.fabrics[0] ? `Works in ${s.fabrics[0].toLowerCase()}` : null,
                  s.minPrice ? `From A$${s.minPrice}` : 'Fits your budget',
                  `Ready in ${s.leadTime}`,
                  left <= 2 ? `${left} spot${left === 1 ? '' : 's'} left` : null,
                  s.fittingsInPerson ? 'In-person fittings' : null,
                ]
                  .filter(Boolean)
                  .slice(0, 4)
                  .map((w) => (
                    <span key={w} className="bg-stone-light px-[7px] py-[3px] text-[11px]">
                      {w}
                    </span>
                  ))}
              </span>
            </span>
          </div>
          {!s.open && (
            <p className="mt-2 text-[12px] text-muted">
              Switch on custom work to appear in matches.
            </p>
          )}
        </div>

        <div className="border-t border-line pt-5 text-[13px] leading-relaxed text-text2">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-2">
            How matching works
          </span>
          <p className="mt-2">
            A buyer describes what they want, their date, budget and where they are. We show them up
            to five makers who make that kind of piece, work in a fabric they chose, can finish in
            time and are within their budget. Closer makers rank higher when fittings matter; quick
            replies and reviews help too. They pick up to {CUSTOM.maxMakers} to send the brief to,
            and you have {CUSTOM.replyHours} hours to quote or pass.
          </p>
        </div>

        <div className="border-t border-line pt-5 text-[13px] leading-relaxed text-text2">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted-2">
            How you’re paid for custom work
          </span>
          <p className="mt-2">
            The buyer pays in full when they accept your quote, and Off One holds it. You get{' '}
            {CUSTOM.advancePct}% when you mark the fabric bought, and the rest{' '}
            {TERMS.releaseDaysAfterDelivery} days after delivery.{' '}
            {initial.commissionPct === TERMS.foundingCommissionPct
              ? `As a founding maker you pay ${TERMS.foundingCommissionPct}% commission for now.`
              : `Commission is ${initial.commissionPct}%, like any sale.`}{' '}
            On a {formatPrice(60000)} piece, that’s about {formatPrice(Math.round(60000 * 0.3))} up
            front.
          </p>
        </div>
      </aside>
    </div>
  );
}
