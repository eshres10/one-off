'use client';

import { useState, useTransition } from 'react';
import { Switch } from '@/components/studio/Switch';
import { saveNotificationsAction } from '@/lib/actions/account';
import type { BuyerNotify } from '@/lib/services/notifications';

const ROWS: Array<{ key: BuyerNotify; label: string; detail?: string }> = [
  { key: 'delivery_sms', label: 'Delivery texts', detail: 'A text when a piece is on its way.' },
  { key: 'maker_messages', label: 'Messages from makers' },
  {
    key: 'following_weekly',
    label: 'New from makers you follow',
    detail: 'At most one email a week.',
  },
  { key: 'one_of_ones_in_size', label: 'One-of-ones in your size' },
  { key: 'news', label: 'News from One Off' },
];

/** Each switch saves as it's flipped. Order and delivery updates are always on. */
export function NotificationSwitches({ initial }: { initial: Record<BuyerNotify, boolean> }) {
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const [, start] = useTransition();
  const flip = (key: BuyerNotify, on: boolean) => {
    const next = { ...prefs, [key]: on };
    setPrefs(next);
    start(async () => {
      const res = await saveNotificationsAction(next);
      setSaved(res.ok ? 'Saved' : 'Couldn’t save. Try again.');
      if (!res.ok) setPrefs(prefs);
    });
  };
  return (
    <>
      <ul className="border-t border-line" role="list">
        <li className="flex min-h-[64px] items-center justify-between gap-4 border-b border-line py-2">
          <span>
            <span id="n-orders" className="block text-[15px]">
              Order and delivery updates
            </span>
            <span className="block text-[12px] text-muted">
              Always on. These can’t be turned off.
            </span>
          </span>
          <Switch
            checked
            onChange={() => {}}
            labelledBy="n-orders"
            disabled
            testId="notify-orders"
          />
        </li>
        {ROWS.map((r) => (
          <li
            key={r.key}
            className="flex min-h-[64px] items-center justify-between gap-4 border-b border-line py-2"
          >
            <span>
              <span id={`n-${r.key}`} className="block text-[15px]">
                {r.label}
              </span>
              {r.detail && <span className="block text-[12px] text-muted">{r.detail}</span>}
            </span>
            <Switch
              checked={prefs[r.key]}
              onChange={(on) => flip(r.key, on)}
              labelledBy={`n-${r.key}`}
              testId={`notify-${r.key}`}
            />
          </li>
        ))}
      </ul>
      <p className="mt-3 min-h-[20px] text-[12px] text-muted" role="status" aria-live="polite">
        {saved}
      </p>
    </>
  );
}
