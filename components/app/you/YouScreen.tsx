'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { logoutAction } from '@/lib/actions/auth';
import { STAGE_DOT, STAGE_LABEL, type Stage } from '@/lib/account/progress';
import { formatPrice } from '@/lib/domain/money';
import type { SavedSizes } from '@/lib/queries/account';
import { Img as Image } from '@/components/ui/Img';
import { ChevronIcon, MoreIcon } from '@/components/ui/icons';
import { Sheet } from '../Sheet';
import { Segmented, appButtonLinkClass } from '../ui';

export interface YouOrder {
  orderNumber: string;
  totalCents: number;
  placedAt: string;
  parcels: Array<{
    id: string;
    maker: string;
    title: string;
    imageUrl: string | null;
    stage: Stage;
    steps: Array<{ label: string; done: boolean; current: boolean }>;
  }>;
}

const MENU = [
  { href: '/account', label: 'Account' },
  { href: '/account/sizes', label: 'Sizes & fit' },
  { href: '/account/requests', label: 'Custom requests' },
  { href: '/help', label: 'Help' },
  { href: '/legal/terms', label: 'Terms' },
  { href: '/legal/privacy', label: 'Privacy' },
  { href: '/legal/returns', label: 'Returns policy' },
];

function ProgressBar({ steps }: { steps: YouOrder['parcels'][number]['steps'] }) {
  const done = steps.filter((s) => s.done).length + (steps.some((s) => s.current) ? 0.5 : 0);
  const pct = Math.min(100, Math.round((done / steps.length) * 100));
  return (
    <div className="mt-2" aria-hidden>
      <div className="h-1 overflow-hidden rounded-pill bg-stone">
        <div className="h-full rounded-pill bg-ink" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-2">
        {steps.map((s) => (
          <span key={s.label} className={s.current ? 'text-ink' : ''}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function YouScreen({
  tab,
  firstName,
  handle,
  initial,
  stats,
  likes,
  orders,
  sizes,
  studio,
}: {
  tab: 'likes' | 'orders' | 'sizes';
  firstName: string;
  handle: string;
  initial: string;
  stats: { orders: number; following: number; likes: number };
  likes: Array<{
    id: string;
    slug: string;
    title: string;
    priceCents: number;
    imageUrl: string | null;
  }>;
  orders: YouOrder[];
  sizes: SavedSizes | null;
  studio: boolean;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  return (
    <div className="pb-8" data-testid="you-screen">
      <div className="px-4 pt-4">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-circle bg-ink font-display text-[28px] text-ground">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[28px] leading-none">{firstName}</p>
            <p className="mt-1 truncate text-[13px] text-muted">@{handle}</p>
          </div>
          <button
            type="button"
            onClick={() => setMenu(true)}
            aria-label="Menu"
            data-testid="you-menu"
            className="flex h-11 w-11 items-center justify-center"
          >
            <MoreIcon width={22} height={22} />
          </button>
        </div>
        <dl className="mt-5 grid grid-cols-3 text-center">
          {[
            ['Orders', stats.orders],
            ['Following', stats.following],
            ['Likes', stats.likes],
          ].map(([l, n]) => (
            <div key={l}>
              <dd className="font-display text-[24px] leading-none">{n}</dd>
              <dt className="mt-1 text-[11px] uppercase tracking-label text-muted-2">{l}</dt>
            </div>
          ))}
        </dl>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Link href="/account" className={appButtonLinkClass('outline', 'min-h-[44px]')}>
            Edit profile
          </Link>
          <Link
            href="/account/sizes"
            className={appButtonLinkClass('outline', 'min-h-[44px]')}
            data-testid="you-sizes"
          >
            Saved sizes
          </Link>
        </div>
        <div className="mt-5">
          <Segmented
            value={tab}
            onChange={(v) => router.replace(v === 'likes' ? '/you' : `/you?tab=${v}`)}
            label="You"
            testId="you-tabs"
            options={[
              { value: 'likes', label: 'Likes' },
              { value: 'orders', label: 'Orders' },
              { value: 'sizes', label: 'Sizes' },
            ]}
          />
        </div>
      </div>

      {tab === 'likes' &&
        (likes.length ? (
          <ul className="mt-3 grid grid-cols-3 gap-[2px]" role="list" data-testid="you-likes">
            {likes.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/products/${p.slug}`}
                  className="relative block aspect-4/5 bg-stone"
                  aria-label={p.title}
                >
                  {p.imageUrl && (
                    <Image
                      src={p.imageUrl}
                      alt=""
                      fill
                      sizes="33vw"
                      className="object-cover object-top"
                    />
                  )}
                  <span className="absolute bottom-1.5 left-1.5 rounded-pill bg-ground/90 px-2 py-0.5 text-[11px]">
                    {formatPrice(p.priceCents)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-14 text-center text-[13px] text-muted">
            Tap the heart on any piece and it lands here.
          </p>
        ))}

      {tab === 'orders' &&
        (orders.length ? (
          <ul className="mt-3 divide-y divide-line" role="list" data-testid="you-orders">
            {orders.map((o) => (
              <li key={o.orderNumber} className="px-4 py-4">
                <Link
                  href={`/account/orders/${o.orderNumber}`}
                  className="flex items-baseline justify-between"
                >
                  <span className="text-[14px]">{o.orderNumber}</span>
                  <span className="text-[12px] text-muted">
                    {formatPrice(o.totalCents)}{' '}
                    <ChevronIcon width={12} height={12} className="inline" />
                  </span>
                </Link>
                {o.parcels.map((p) => (
                  <div key={p.id} className="mt-3 flex gap-3">
                    <span className="relative h-16 w-[52px] shrink-0 overflow-hidden rounded-[8px] bg-stone">
                      {p.imageUrl && (
                        <Image
                          src={p.imageUrl}
                          alt=""
                          fill
                          sizes="52px"
                          className="object-cover object-top"
                        />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px]">{p.title}</span>
                          <span className="block truncate text-[12px] text-muted">{p.maker}</span>
                        </span>
                        <span
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-stone px-2.5 py-1 text-[11px]"
                          data-testid="order-status-pill"
                        >
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-circle"
                            style={{ background: STAGE_DOT[p.stage] }}
                          />
                          {STAGE_LABEL[p.stage]}
                        </span>
                      </div>
                      <ProgressBar steps={p.steps} />
                    </div>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-6 py-14 text-center text-[13px] text-muted">
            Your first order will live here.
          </p>
        ))}

      {tab === 'sizes' && (
        <div className="px-4 pt-4" data-testid="you-sizes-tab">
          {sizes ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-app bg-surface p-4 text-[14px]">
              {[
                ['Usual size', sizes.usualSize ? `AU ${sizes.usualSize}` : '—'],
                ['Height', sizes.heightCm ? `${Number(sizes.heightCm)} cm` : '—'],
                ['Bust', sizes.bustCm ? `${Number(sizes.bustCm)} cm` : '—'],
                ['Waist', sizes.waistCm ? `${Number(sizes.waistCm)} cm` : '—'],
                ['Hips', sizes.hipsCm ? `${Number(sizes.hipsCm)} cm` : '—'],
                [
                  'Fit',
                  sizes.fitPref === 'close'
                    ? 'Close to the body'
                    : sizes.fitPref === 'relaxed'
                      ? 'Relaxed'
                      : 'True to size',
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[11px] uppercase tracking-label text-muted-2">{k}</dt>
                  <dd className="mt-0.5">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="rounded-app bg-surface p-4 text-[13px] text-muted">
              No measurements saved yet.
            </p>
          )}
          <p className="mt-3 text-[12px] text-muted">
            Shared only with makers you order from or ask for a quote.
          </p>
          <Link href="/account/sizes" className={appButtonLinkClass('outline', 'mt-4 w-full')}>
            {sizes ? 'Edit measurements' : 'Add measurements'}
          </Link>
        </div>
      )}

      <Sheet open={menu} onOpenChange={setMenu} label="Menu" testId="you-menu-sheet">
        <ul className="divide-y divide-line" role="list">
          {studio && (
            <li>
              <Link
                href="/studio?mode=studio"
                className="flex min-h-[52px] items-center justify-between text-[15px] font-medium"
                data-testid="menu-studio"
              >
                Studio
                <ChevronIcon width={16} height={16} className="text-muted-2" />
              </Link>
            </li>
          )}
          {MENU.map((m) => (
            <li key={m.href}>
              <Link
                href={m.href}
                className="flex min-h-[52px] items-center justify-between text-[15px]"
              >
                {m.label}
                <ChevronIcon width={16} height={16} className="text-muted-2" />
              </Link>
            </li>
          ))}
          <li>
            <form action={logoutAction}>
              <button
                className="flex min-h-[52px] w-full items-center text-[15px] text-muted"
                data-testid="menu-sign-out"
              >
                Sign out
              </button>
            </form>
          </li>
        </ul>
      </Sheet>
    </div>
  );
}
