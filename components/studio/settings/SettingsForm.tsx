'use client';

import { BRAND } from '@/lib/brand';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { MAKER_TIMEZONES } from '@/lib/site/config';
import { closeShopAction, saveSettingsAction } from '@/lib/actions/settings';
import { RETURNS_TABLE } from '@/lib/studio/policy';
import type { ShopSettings } from '@/lib/services/settings';
import type { Channels, NotifyEvent } from '@/lib/services/notifications';
import { TERMS } from '@/lib/studio/terms';
import { ImageUploader } from '@/components/forms/ImageUploader';
import { Sheet } from '../Sheet';
import { Switch } from '../Switch';

const SECTIONS = [
  { id: 'profile', label: 'Shop profile' },
  { id: 'shipping', label: 'Shipping' },
  { id: 'made-to-order', label: 'Made to order & custom' },
  { id: 'returns', label: 'Returns & care' },
  { id: 'holiday', label: 'Holiday mode' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'account', label: 'Payouts, tax & account' },
] as const;

const EVENT_LABELS: Record<NotifyEvent, string> = {
  new_order: 'New order',
  ship_by_reminder: 'Ship-by reminder',
  message: 'New message',
  low_stock: 'Low stock',
  payout_sent: 'Payout sent',
  weekly_summary: 'Weekly summary',
};
const REGION_LABELS = {
  same_state: 'Within your state',
  au: 'Rest of Australia',
  nz: 'New Zealand',
} as const;

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-[90px] border-t border-line py-8 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-title`} className="mb-5 text-[32px] leading-none">
        {title}
      </h2>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

function SwitchRow({
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
    <div className="flex items-center justify-between gap-4">
      <span id={id} className="text-[14px]">
        {label}
        {sub && <span className="block text-[12px] text-muted">{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} labelledBy={id} testId={`${id}-switch`} />
    </div>
  );
}

function Chips({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          type="button"
          role="radio"
          aria-checked={value === o}
          onClick={() => onChange(o)}
          className={`min-h-[44px] rounded-circle border px-4 text-[13px] ${value === o ? 'border-ink bg-ink text-ground' : 'border-line-strong hover:border-ink'}`}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const BUNDLE_OPTIONS = [
  { value: 'none', label: 'No bundle deal' },
  { value: 'free', label: 'Free shipping' },
  { value: 'percent', label: '% off shipping' },
] as const;

const dollars = (c: number | null) => (c === null ? '' : String(c / 100));
const toCents = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100));

/**
 * Shop settings: seven sections on one page with a left rail, and a save bar that saves them
 * all ("Changes save to your live shop" → "Saved ✓").
 */
export function SettingsForm({
  initial,
  shopTags,
  replyWithin,
  stripeLink,
}: {
  initial: ShopSettings;
  shopTags: readonly string[];
  replyWithin: readonly string[];
  stripeLink: React.ReactNode;
}) {
  const [s, setS] = useState(initial);
  const [saved, setSaved] = useState<ShopSettings>(initial);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, start] = useTransition();
  const [active, setActive] = useState<string>('profile');
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(saved), [s, saved]);
  const set = <K extends keyof ShopSettings>(k: K, v: ShopSettings[K]) => {
    setS((x) => ({ ...x, [k]: v }));
    setJustSaved(false);
  };
  const setRate = (region: string, patch: Partial<ShopSettings['rates'][number]>) =>
    set(
      'rates',
      s.rates.map((r) => (r.region === region ? { ...r, ...patch } : r)),
    );
  const setPref = (event: NotifyEvent, ch: keyof Channels, v: boolean) =>
    set('prefs', { ...s.prefs, [event]: { ...s.prefs[event], [ch]: v } });

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-90px 0px -60% 0px' },
    );
    SECTIONS.forEach((x) => {
      const el = document.getElementById(x.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  const save = () =>
    start(async () => {
      const res = await saveSettingsAction(s);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const next = { ...s, slug: res.slug, slugLocked: s.slugLocked || res.slug !== saved.slug };
      setS(next);
      setSaved(next);
      setError(null);
      setJustSaved(true);
    });

  const awayLabel = s.holidayUntil
    ? `Away until ${new Date(`${s.holidayUntil}T00:00:00Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`
    : 'Away for now';

  return (
    <div className="pb-28 md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-12">
      <nav
        aria-label="Settings sections"
        className="no-scrollbar -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 md:sticky md:top-[90px] md:mx-0 md:mb-0 md:block md:self-start md:px-0"
      >
        {SECTIONS.map((x) => (
          <a
            key={x.id}
            href={`#${x.id}`}
            aria-current={active === x.id ? 'true' : undefined}
            className={`flex min-h-[44px] shrink-0 items-center whitespace-nowrap border-l-0 px-3 text-[12px] md:border-l md:px-4 ${active === x.id ? 'border-ink text-ink md:font-normal' : 'border-line text-muted-2 hover:text-ink'} ${active === x.id ? 'max-md:rounded-circle max-md:bg-ink max-md:text-ground' : 'max-md:rounded-circle max-md:border max-md:border-line-strong'}`}
          >
            {x.label}
          </a>
        ))}
      </nav>

      <div className="max-w-2xl">
        <Section id="profile" title="Shop profile">
          <div className="grid gap-5 sm:grid-cols-[120px_1fr]">
            <div>
              <p className="label">Avatar</p>
              <ImageUploader
                key={`a-${saved.avatarUrl}`}
                kind="makers"
                max={1}
                name="avatar"
                initial={s.avatarUrl ? [s.avatarUrl] : []}
                label="Upload"
                onChange={(u) => set('avatarUrl', u[0] ?? '')}
              />
            </div>
            <div>
              <p className="label">Banner</p>
              <ImageUploader
                key={`b-${saved.bannerUrl}`}
                kind="makers"
                max={1}
                name="banner"
                initial={s.bannerUrl ? [s.bannerUrl] : []}
                label="Upload"
                onChange={(u) => set('bannerUrl', u[0] ?? '')}
              />
            </div>
          </div>
          <Field id="set-name" label="Shop name">
            <input
              id="set-name"
              className="input"
              value={s.name}
              onChange={(e) => set('name', e.target.value)}
              data-testid="set-name"
            />
          </Field>
          <Field
            id="set-slug"
            label="Shop link"
            hint={
              s.slugLocked
                ? 'Your link has been changed once already.'
                : 'You can change this once. The old link keeps working.'
            }
          >
            <div className="flex items-center border border-line-strong bg-surface focus-within:border-ink">
              <span className="pl-3 text-[13px] text-muted-2">{BRAND.domain}/makers/</span>
              <input
                id="set-slug"
                className="min-h-[44px] min-w-0 flex-1 bg-transparent pr-3 text-[14px] focus:outline-none"
                value={s.slug}
                disabled={s.slugLocked}
                onChange={(e) => set('slug', e.target.value.toLowerCase())}
              />
            </div>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="set-suburb" label="Suburb">
              <input
                id="set-suburb"
                className="input"
                value={s.suburb}
                onChange={(e) => set('suburb', e.target.value)}
              />
            </Field>
            <Field id="set-instagram" label="Instagram">
              <input
                id="set-instagram"
                className="input"
                value={s.instagram}
                placeholder="@yourlabel"
                onChange={(e) => set('instagram', e.target.value)}
              />
            </Field>
          </div>
          <Field
            id="set-timezone"
            label="Time zone"
            hint="Reminders, your morning greeting and problem due times use this."
          >
            <select
              id="set-timezone"
              className="input"
              value={s.timezone}
              onChange={(e) => set('timezone', e.target.value)}
              data-testid="set-timezone"
            >
              {MAKER_TIMEZONES.map((z) => (
                <option key={z.value} value={z.value}>
                  {z.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="set-tagline" label="Short line" hint={`${s.tagline.length}/80`}>
            <input
              id="set-tagline"
              className="input"
              maxLength={80}
              value={s.tagline}
              onChange={(e) => set('tagline', e.target.value)}
            />
          </Field>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field
              id="set-owner-name"
              label="Your name"
              hint="Signs the stories on your pieces. Leave it blank to use the shop name."
            >
              <input
                id="set-owner-name"
                className="input"
                maxLength={80}
                value={s.ownerDisplayName}
                onChange={(e) => set('ownerDisplayName', e.target.value)}
                data-testid="owner-name"
              />
            </Field>
            <Field id="set-team-size" label="People making" hint="Just you? Put 1.">
              <input
                id="set-team-size"
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                className="input"
                value={s.teamSize ?? ''}
                onChange={(e) =>
                  set(
                    'teamSize',
                    e.target.value ? Math.max(0, Math.round(Number(e.target.value))) : null,
                  )
                }
                data-testid="team-size"
              />
            </Field>
          </div>
          <Field id="set-story" label="Story">
            <textarea
              id="set-story"
              className="input min-h-[160px]"
              value={s.story}
              onChange={(e) => set('story', e.target.value)}
            />
          </Field>
          <fieldset>
            <legend className="label">What you make</legend>
            <div className="flex flex-wrap gap-2">
              {shopTags.map((t) => {
                const on = s.tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => set('tags', on ? s.tags.filter((x) => x !== t) : [...s.tags, t])}
                    className={`min-h-[40px] rounded-circle border px-4 text-[12px] ${on ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </Section>

        <Section id="shipping" title="Shipping">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-[13px]" data-testid="rates-table">
              <thead>
                <tr className="text-[10px] uppercase tracking-label text-muted-2">
                  <th scope="col" className="pb-2 font-normal">
                    Region
                  </th>
                  <th scope="col" className="pb-2 font-normal">
                    Standard A$
                  </th>
                  <th scope="col" className="pb-2 font-normal">
                    Express A$
                  </th>
                  <th scope="col" className="pb-2 font-normal">
                    On
                  </th>
                </tr>
              </thead>
              <tbody>
                {s.rates.map((r) => (
                  <tr key={r.region} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 font-light">
                      {REGION_LABELS[r.region]}
                    </th>
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`${REGION_LABELS[r.region]} standard`}
                        type="number"
                        min={0}
                        step="0.5"
                        className="input"
                        value={dollars(r.standardCents)}
                        onChange={(e) =>
                          setRate(r.region, { standardCents: toCents(e.target.value) ?? 0 })
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <input
                        aria-label={`${REGION_LABELS[r.region]} express`}
                        type="number"
                        min={0}
                        step="0.5"
                        className="input"
                        value={dollars(r.expressCents)}
                        onChange={(e) =>
                          setRate(r.region, { expressCents: toCents(e.target.value) })
                        }
                      />
                    </td>
                    <td className="py-2">
                      <Switch
                        checked={r.enabled}
                        disabled={r.region === 'au'}
                        label={`${REGION_LABELS[r.region]} shipping on`}
                        onChange={(v) => setRate(r.region, { enabled: v })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-muted">
            Buyers pay the rest-of-Australia rate at checkout for now; same-state and New Zealand
            rates are saved for when they’re offered.
          </p>
          <SwitchRow
            id="free-ship"
            label="Free shipping over an amount"
            checked={s.freeShipping}
            onChange={(v) => set('freeShipping', v)}
          />
          {s.freeShipping && (
            <Field id="set-free-over" label="Free over (A$)">
              <input
                id="set-free-over"
                type="number"
                min={0}
                className="input max-w-[200px]"
                value={dollars(s.freeOverCents)}
                onChange={(e) => set('freeOverCents', toCents(e.target.value) ?? 0)}
              />
            </Field>
          )}
          <fieldset>
            <legend className="label">Bundle deal</legend>
            <p className="mb-2 text-[12px] text-muted">
              When someone buys several of your pieces together, you send one parcel. Pass some of
              that saving on and they’re more likely to add another piece.
            </p>
            <Chips
              label="Bundle deal"
              options={BUNDLE_OPTIONS.map((o) => o.label)}
              value={BUNDLE_OPTIONS.find((o) => o.value === s.bundleShipping)!.label}
              onChange={(v) =>
                set('bundleShipping', BUNDLE_OPTIONS.find((o) => o.label === v)!.value)
              }
            />
          </fieldset>
          {s.bundleShipping !== 'none' && (
            <div className="flex flex-wrap gap-4">
              {s.bundleShipping === 'percent' && (
                <Field id="set-bundle-pct" label="Off standard shipping (%)">
                  <input
                    id="set-bundle-pct"
                    type="number"
                    min={5}
                    max={90}
                    step={5}
                    className="input max-w-[140px]"
                    value={s.bundlePercentOff}
                    onChange={(e) => set('bundlePercentOff', Number(e.target.value) || 0)}
                  />
                </Field>
              )}
              <Field id="set-bundle-min" label="From this many pieces">
                <input
                  id="set-bundle-min"
                  type="number"
                  min={2}
                  max={10}
                  className="input max-w-[140px]"
                  value={s.bundleMinPieces}
                  onChange={(e) => set('bundleMinPieces', Number(e.target.value) || 2)}
                />
              </Field>
            </div>
          )}
          <p className="text-[12px] text-muted">
            When Off One runs a shipping offer for buyers, it never comes out of your pocket: you’re
            always paid your full shipping rate (less any bundle deal you choose here).
          </p>
          <SwitchRow
            id="pickup"
            label="Local pick-up"
            sub="Buyers can collect from you instead."
            checked={s.localPickup}
            onChange={(v) => set('localPickup', v)}
          />
          <fieldset>
            <legend className="label">Ready to ship: you send it within</legend>
            <Chips
              label="Dispatch time"
              options={TERMS.readyToShipDispatchOptions}
              value={s.dispatchOption}
              onChange={(v) => set('dispatchOption', v)}
            />
          </fieldset>
        </Section>

        <Section id="made-to-order" title="Made to order & custom">
          <fieldset>
            <legend className="label">Default making time</legend>
            <Chips
              label="Making time"
              options={TERMS.mtoLeadOptions}
              value={s.mtoDefaultLead}
              onChange={(v) => set('mtoDefaultLead', v)}
            />
          </fieldset>
          <Field id="set-capacity" label="Weekly capacity (pieces)">
            <input
              id="set-capacity"
              type="number"
              min={1}
              max={500}
              className="input max-w-[200px]"
              value={s.mtoWeeklyCapacity ?? ''}
              onChange={(e) =>
                set('mtoWeeklyCapacity', e.target.value ? Number(e.target.value) : null)
              }
            />
          </Field>
          <SwitchRow
            id="custom"
            label="Accept custom requests"
            sub="Buyers can ask for a piece made for them."
            checked={s.acceptsCustom}
            onChange={(v) => set('acceptsCustom', v)}
          />
          {s.acceptsCustom && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="set-custom-from" label="Starting price (A$)">
                  <input
                    id="set-custom-from"
                    type="number"
                    min={0}
                    className="input"
                    value={dollars(s.customFromCents)}
                    onChange={(e) => set('customFromCents', toCents(e.target.value))}
                  />
                </Field>
                <Field id="set-deposit" label="Deposit (%)">
                  <input
                    id="set-deposit"
                    type="number"
                    min={0}
                    max={100}
                    className="input"
                    value={s.customDepositPct ?? ''}
                    onChange={(e) =>
                      set('customDepositPct', e.target.value ? Number(e.target.value) : null)
                    }
                  />
                </Field>
              </div>
              <fieldset>
                <legend className="label">You reply within</legend>
                <Chips
                  label="Reply within"
                  options={replyWithin}
                  value={s.customReplyWithin}
                  onChange={(v) => set('customReplyWithin', v)}
                />
              </fieldset>
              <Field id="set-blurb" label="What buyers see">
                <textarea
                  id="set-blurb"
                  className="input min-h-[100px]"
                  maxLength={600}
                  value={s.customBlurb}
                  onChange={(e) => set('customBlurb', e.target.value)}
                />
              </Field>
            </>
          )}
        </Section>

        <Section id="returns" title="Returns & care">
          <div className="bg-stone p-4 text-[13px] leading-relaxed" data-testid="platform-policy">
            <p>
              Off One’s returns policy applies to every shop, so buyers get the same promise
              wherever they shop.
            </p>
            <table className="mt-3 w-full text-left">
              <tbody>
                {RETURNS_TABLE.map(([type, rule]) => (
                  <tr key={type} className="border-t border-ink/10 align-top">
                    <th scope="row" className="py-2 pr-4 font-medium">
                      {type}
                    </th>
                    <td className="py-2">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Field
            id="set-return-address"
            label="Return address"
            hint="Where buyers post ready-to-ship returns. Only shown to a buyer once they start a return."
          >
            <textarea
              id="set-return-address"
              className="input min-h-[90px]"
              maxLength={400}
              value={s.returnAddress}
              onChange={(e) => set('returnAddress', e.target.value)}
              data-testid="return-address"
            />
          </Field>
          <Field
            id="set-policy-extra"
            label="Anything to add (shown on your pieces)"
            hint={`${s.policyExtra.length}/300`}
          >
            <input
              id="set-policy-extra"
              className="input"
              maxLength={300}
              value={s.policyExtra}
              onChange={(e) => set('policyExtra', e.target.value)}
            />
          </Field>
          <Field
            id="set-size-notes"
            label="Size notes"
            hint="Shown with the size guide on your pieces, e.g. “Cut generously: size down if you’re between sizes.”"
          >
            <textarea
              id="set-size-notes"
              className="input min-h-[70px]"
              maxLength={400}
              value={s.sizeNotes}
              onChange={(e) => set('sizeNotes', e.target.value)}
              data-testid="size-notes"
            />
          </Field>
          <Field id="set-care" label="Default care notes" hint="Filled in on new pieces.">
            <textarea
              id="set-care"
              className="input min-h-[90px]"
              value={s.careDefault}
              onChange={(e) => set('careDefault', e.target.value)}
            />
          </Field>
        </Section>

        <Section id="holiday" title="Holiday mode">
          <SwitchRow
            id="holiday-on"
            label="I’m away"
            sub="Your shop stays visible and saveable; buying pauses. Messages still work."
            checked={s.holidayOn}
            onChange={(v) => set('holidayOn', v)}
          />
          {s.holidayOn && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <Field id="set-away" label="Away from">
                  <input
                    id="set-away"
                    type="date"
                    className="input"
                    value={s.holidayFrom}
                    onChange={(e) => set('holidayFrom', e.target.value)}
                  />
                </Field>
                <Field id="set-back" label="Back on">
                  <input
                    id="set-back"
                    type="date"
                    className="input"
                    value={s.holidayUntil}
                    onChange={(e) => set('holidayUntil', e.target.value)}
                    data-testid="holiday-until"
                  />
                </Field>
              </div>
              <Field id="set-note" label="Note for buyers">
                <input
                  id="set-note"
                  className="input"
                  maxLength={280}
                  value={s.holidayNote}
                  placeholder="Gone to the coast. Orders open again soon!"
                  onChange={(e) => set('holidayNote', e.target.value)}
                />
              </Field>
              <div className="border border-line p-4" aria-label="What buyers see">
                <p className="text-[10px] uppercase tracking-label text-muted-2">What buyers see</p>
                <p className="mt-2 flex min-h-[48px] items-center justify-center bg-stone text-[11px] uppercase tracking-[0.18em] text-muted">
                  {awayLabel}
                </p>
                {s.holidayNote && <p className="mt-2 text-[13px]">{s.holidayNote}</p>}
              </div>
              <p className="text-[12px] text-muted">
                It turns off on your back date, and people who saved your pieces get an email.
              </p>
            </>
          )}
        </Section>

        <Section id="notifications" title="Notifications">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[300px] text-[13px]" data-testid="prefs-grid">
              <thead>
                <tr className="text-[10px] uppercase tracking-label text-muted-2">
                  <th scope="col" className="pb-2 text-left font-normal">
                    When
                  </th>
                  {(['email', 'push', 'sms'] as const).map((c) => (
                    <th key={c} scope="col" className="pb-2 font-normal">
                      {c === 'sms' ? 'SMS' : c[0]!.toUpperCase() + c.slice(1)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(EVENT_LABELS) as NotifyEvent[]).map((e) => (
                  <tr key={e} className="border-t border-line">
                    <th scope="row" className="py-1 text-left font-light">
                      {EVENT_LABELS[e]}
                    </th>
                    {(['email', 'push', 'sms'] as const).map((c) => (
                      <td key={c} className="text-center">
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-[#111111]"
                          aria-label={`${EVENT_LABELS[e]} by ${c}`}
                          checked={s.prefs[e][c]}
                          onChange={(ev) => setPref(e, c, ev.target.checked)}
                          data-testid={`pref-${e}-${c}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-muted">
            Texts go to your mobile below. Push notifications arrive with the Off One app.
          </p>
        </Section>

        <Section id="account" title="Payouts, tax & account">
          <div className="flex items-center justify-between gap-4 border border-line p-4">
            <span className="text-[14px]">{s.bank ?? 'No bank connected yet'}</span>
            {stripeLink}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="set-abn" label="ABN">
              <input
                id="set-abn"
                inputMode="numeric"
                className="input"
                value={s.abn}
                placeholder="11 digits"
                onChange={(e) => set('abn', e.target.value)}
              />
            </Field>
            <div className="pt-6">
              <SwitchRow
                id="gst"
                label="Registered for GST"
                sub="Shown on your packing slips."
                checked={s.gstRegistered}
                onChange={(v) => set('gstRegistered', v)}
              />
            </div>
            <Field id="set-email" label="Login email">
              <input id="set-email" className="input" value={s.loginEmail} disabled />
            </Field>
            <Field id="set-mobile" label="Mobile (for texts)">
              <input
                id="set-mobile"
                type="tel"
                className="input"
                value={s.mobile}
                placeholder="0412 345 678"
                onChange={(e) => set('mobile', e.target.value)}
              />
            </Field>
          </div>
          <div className="border-t border-line pt-5">
            {s.shopStatus === 'closed' ? (
              <button
                type="button"
                className="min-h-[44px] border border-ink px-5 text-[11px] uppercase tracking-label"
                onClick={() =>
                  start(async () => {
                    await closeShopAction(false);
                    setS({ ...s, shopStatus: 'live' });
                    setSaved({ ...saved, shopStatus: 'live' });
                  })
                }
              >
                Reopen my shop
              </button>
            ) : (
              <button
                type="button"
                className="min-h-[44px] text-[13px] text-alert underline underline-offset-4"
                onClick={() => setConfirmClose(true)}
                data-testid="close-shop"
              >
                Close shop
              </button>
            )}
          </div>
        </Section>
      </div>

      <div
        className="glass-light fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 border-t border-line md:bottom-0"
        data-testid="save-bar"
      >
        <div className="container-page flex items-center justify-between gap-4 py-3">
          <p className="text-[13px]" role="status" aria-live="polite">
            {error ? (
              <span className="text-alert">{error}</span>
            ) : justSaved && !dirty ? (
              'Saved ✓'
            ) : dirty ? (
              'Changes save to your live shop'
            ) : (
              'All saved'
            )}
          </p>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="glass-dark min-h-[48px] shrink-0 px-6 text-[11px] uppercase tracking-[0.18em] disabled:opacity-50"
            data-testid="save-settings"
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {confirmClose && (
        <Sheet
          testId="close-sheet"
          variant="center"
          width={460}
          onClose={() => setConfirmClose(false)}
          title={<h2 className="font-display text-[28px] leading-tight">Close your shop?</h2>}
        >
          <p className="text-[14px]">
            Your shop and pieces disappear from Off One straight away. Orders you already have still
            need to be made and sent. You can reopen any time.
          </p>
          <div className="mt-5 grid gap-2">
            <button
              type="button"
              data-testid="confirm-close"
              className="min-h-[48px] border border-alert text-[11px] uppercase tracking-[0.18em] text-alert"
              onClick={() =>
                start(async () => {
                  await closeShopAction(true);
                  setS({ ...s, shopStatus: 'closed' });
                  setSaved({ ...saved, shopStatus: 'closed' });
                  setConfirmClose(false);
                })
              }
            >
              Close my shop
            </button>
            <button
              type="button"
              className="min-h-[48px] text-[13px] underline"
              onClick={() => setConfirmClose(false)}
            >
              Keep it open
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
