'use client';

import { useState, useTransition } from 'react';
import { shopLinkCopiedAction } from '@/lib/actions/studio-listings';
import { EmptyState } from '@/components/states/EmptyState';
import { SpoolIcon } from '@/components/states/illustrations';
import type { FirstOrderChecklist } from '@/lib/services/studio-states';

const FIRST_ORDER_PIECES = 6;

function Tick({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-circle border ${done ? 'border-ink bg-ink text-ground' : 'border-line-strong'}`}
    >
      {done && (
        <svg
          viewBox="0 0 12 12"
          width={10}
          height={10}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M2.5 6.2 5 8.5 9.5 3.5" />
        </svg>
      )}
    </span>
  );
}

/** Studio Orders before the first sale: what helps, ticked off as it's done. */
export function NoOrdersYet({ list, shopUrl }: { list: FirstOrderChecklist; shopUrl: string }) {
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  const items = [
    { key: 'payouts', label: 'Connect payouts', done: list.payouts, href: '/studio/payouts' },
    {
      key: 'pieces',
      label: `Add more pieces (${Math.min(list.livePieces, FIRST_ORDER_PIECES)} of ${FIRST_ORDER_PIECES})`,
      done: list.livePieces >= FIRST_ORDER_PIECES,
      href: '/studio/listings/new',
    },
    { key: 'share', label: 'Share your shop link', done: list.sharedLink || copied, href: null },
    {
      key: 'mto',
      label: 'Turn on made to order',
      done: list.madeToOrder,
      href: '/studio/settings#made-to-order',
    },
  ];
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(shopUrl);
    } catch {
      // Clipboard blocked: the link is shown underneath to copy by hand.
    }
    setCopied(true);
    start(() => shopLinkCopiedAction());
  };
  return (
    <EmptyState
      testId="studio-no-orders"
      icon={<SpoolIcon size={80} />}
      title="Your first order is on its way."
      body="Shops with 6+ pieces and a shared link usually get their first order in the first two weeks."
      actions={[
        {
          label: 'Copy my shop link',
          button: (
            <button
              type="button"
              onClick={copy}
              className="glass-dark min-h-[52px] w-full px-6 text-[11px] uppercase tracking-[0.2em] text-ground"
              data-testid="copy-shop-link"
            >
              {copied ? 'Copied' : 'Copy my shop link'}
            </button>
          ),
        },
      ]}
    >
      <ul
        className="divide-y divide-line border-y border-line text-left"
        data-testid="first-order-checklist"
      >
        {items.map((i) => {
          const row = (
            <span className="flex min-h-[52px] items-center gap-3 text-[14px]">
              <Tick done={i.done} />
              <span className={i.done ? 'text-muted line-through' : ''}>{i.label}</span>
            </span>
          );
          return (
            <li key={i.key} data-done={i.done ? 'true' : 'false'} data-testid={`check-${i.key}`}>
              {i.href && !i.done ? (
                <a href={i.href} className="block hover:bg-surface">
                  {row}
                </a>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 truncate text-[12px] text-muted-2">{shopUrl}</p>
    </EmptyState>
  );
}
