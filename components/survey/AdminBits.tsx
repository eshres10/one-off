'use client';

import { useState, useTransition } from 'react';
import { markContactedAction } from '@/lib/actions/survey';
import { SURVEY_HOME } from '@/lib/survey/host';
import { TAG_RE } from '@/lib/survey/questions';

/** The "Mark contacted" toggle on an opt-in row. */
export function ContactedToggle({ id, contactedAt }: { id: string; contactedAt: string | null }) {
  const [on, setOn] = useState(Boolean(contactedAt));
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await markContactedAction(id, !on);
          if (res.ok) setOn(!on);
        })
      }
      className={`min-h-[32px] border px-3 text-[11px] uppercase tracking-[0.14em] ${on ? 'border-ink bg-ink text-ground' : 'border-ink'}`}
      data-testid="mark-contacted"
    >
      {on ? 'Contacted' : 'Mark contacted'}
    </button>
  );
}

const clean = (v: string) =>
  v
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 40);

/** Builds a share link like https://survey.offone.com.au/?src=ig-dm&ref=fern-thread. */
export function MakeLink() {
  const [src, setSrc] = useState('ig-dm');
  const [ref, setRef] = useState('');
  const [copied, setCopied] = useState(false);
  const s = clean(src);
  const r = clean(ref);
  const p = new URLSearchParams();
  if (s && TAG_RE.test(s)) p.set('src', s);
  if (r && TAG_RE.test(r)) p.set('ref', r);
  const url = `${SURVEY_HOME}/${p.toString() ? `?${p}` : ''}`;
  const field =
    'min-h-[40px] w-full border border-line bg-surface px-3 text-[14px] outline-none focus:border-ink';
  return (
    <div className="border border-line bg-surface p-4" data-testid="make-link">
      <p className="eyebrow mb-3">Make a link</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          Source (where you’re posting it)
          <input
            value={src}
            onChange={(e) => setSrc(e.target.value)}
            className={field}
            data-testid="link-src"
          />
        </label>
        <label className="flex flex-col gap-1 text-[12px] text-ink-muted">
          Ref (who it’s for)
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className={field}
            data-testid="link-ref"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <code className="break-all text-[13px]" data-testid="link-url">
          {url}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* older browsers: the link is selectable above */
            }
          }}
          className="min-h-[32px] border border-ink px-3 text-[11px] uppercase tracking-[0.14em]"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
