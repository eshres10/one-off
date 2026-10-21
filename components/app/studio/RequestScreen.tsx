'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { popScreen } from '@/lib/app/nav';
import type { MakerRequestDetail } from '@/lib/services/custom-studio';
import { formatPrice } from '@/lib/domain/money';
import { ChevronIcon } from '@/components/ui/icons';
import { AppButton } from '../ui';
import { PassSheet, QuoteSheet } from './QuoteSheet';

/** The request on a phone: the brief (server-rendered), "You're 1 of N", Pass and Send a quote. */
export function RequestScreen({
  request,
  commissionPct,
  fittingsInPerson,
  children,
}: {
  request: MakerRequestDetail;
  commissionPct: number;
  fittingsInPerson: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [quote, setQuote] = useState(false);
  const [pass, setPass] = useState(false);
  const closed = ['passed', 'expired', 'not_chosen', 'chosen'].includes(request.recipientStatus);
  return (
    <div className="pb-[100px]" data-testid="phone-request">
      <div className="-mx-4 flex h-[52px] items-center px-1">
        <button
          type="button"
          onClick={() => popScreen(router, '/studio/inbox')}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center"
          data-testid="bar-back"
        >
          <ChevronIcon dir="left" width={20} height={20} strokeWidth={1.6} />
        </button>
        <span className="text-[15px]">{request.number}</span>
      </div>
      <p className="rounded-app bg-stone px-4 py-2.5 text-[13px]" data-testid="one-of-n">
        You’re 1 of {request.otherMakers + 1} makers asked
        {request.hoursLeft != null ? ` · ${request.hoursLeft} h left to reply` : ''}
      </p>
      <div className="mt-4">{children}</div>
      {request.quote && (
        <p
          className="mt-4 rounded-app border border-ink px-4 py-3 text-[13px]"
          data-testid="quote-sent"
        >
          Your quote: {formatPrice(request.quote.price)} ·{' '}
          {request.quote.status === 'accepted' ? 'accepted' : 'sent'}
        </p>
      )}
      {!closed && (
        <div
          className="glass-nav fixed inset-x-0 bottom-0 z-40 flex gap-2 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 md:hidden"
          data-testid="request-bar"
        >
          {!request.quote && (
            <AppButton
              variant="outline"
              onClick={() => setPass(true)}
              className="flex-1"
              data-testid="pass"
            >
              Pass
            </AppButton>
          )}
          <AppButton onClick={() => setQuote(true)} className="flex-[1.4]" data-testid="open-quote">
            {request.quote ? 'Edit quote' : 'Send a quote'}
          </AppButton>
        </div>
      )}
      <QuoteSheet
        open={quote}
        onOpenChange={setQuote}
        request={request}
        commissionPct={commissionPct}
        fittingsInPerson={fittingsInPerson}
      />
      <PassSheet open={pass} onOpenChange={setPass} requestId={request.id} />
    </div>
  );
}
