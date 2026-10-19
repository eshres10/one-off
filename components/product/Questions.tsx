'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { askQuestionAction, replyQuestionAction } from '@/lib/actions/questions';
import type { QaEntry } from '@/lib/queries/questions';
import type { FormState } from '@/lib/validation';
import { shortAge } from '@/lib/quickview/format';

function Initials({ name, dark = false }: { name: string; dark?: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-circle text-[11px] uppercase ${dark ? 'bg-ink text-ground' : 'bg-stone-light text-ink'}`}
    >
      {name.slice(0, 2)}
    </span>
  );
}

function Submit({ label, className = '' }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`min-h-[44px] shrink-0 px-3 text-[11px] uppercase tracking-label disabled:opacity-60 ${className}`}
    >
      {pending ? 'Sending…' : label}
    </button>
  );
}

function ReplyForm({ questionId, slug }: { questionId: string; slug: string }) {
  const [state, action] = useFormState<FormState, FormData>(replyQuestionAction, undefined);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 min-h-[32px] text-[11px] uppercase tracking-label text-muted underline underline-offset-4"
      >
        Reply
      </button>
    );
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex border border-line-strong">
        <label className="sr-only" htmlFor={`reply-${questionId}`}>
          Your public reply
        </label>
        <input
          id={`reply-${questionId}`}
          name="body"
          required
          maxLength={600}
          autoFocus
          placeholder="Your public reply"
          className="min-w-0 flex-1 bg-transparent px-3 text-[13px] focus:outline-none"
        />
        <Submit label="Reply" />
      </div>
      {state?.ok === false && (
        <p role="alert" className="mt-1 text-[12px] text-error">
          {state.message}
        </p>
      )}
    </form>
  );
}

/** Questions and reviews in one list, Instagram-comment style; maker replies indented. */
export function Questions({
  entries,
  slug,
  canReply = false,
}: {
  entries: QaEntry[];
  slug: string;
  canReply?: boolean;
}) {
  if (!entries.length)
    return (
      <p className="text-[13px] text-muted-2">
        No questions yet. Ask about fit, fabric or timing below.
      </p>
    );
  return (
    <ul className="space-y-5" role="list" data-testid="qa-list">
      {entries.map((e) => (
        <li key={e.id} className="text-[13px]">
          <div className="flex gap-3">
            <Initials name={e.name} />
            <div className="min-w-0">
              <p className="leading-snug">
                <span className="font-normal">{e.name}</span>{' '}
                <span className="whitespace-pre-line text-text2">{e.body}</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-2">
                {e.kind === 'question' ? (
                  <>{shortAge(e.createdAt)} · Question</>
                ) : (
                  <>
                    <span aria-hidden>{'★★★★★'.slice(0, Math.round(e.rating))}</span>
                    <span className="sr-only">Rated {e.rating} out of 5</span> ·{' '}
                    {shortAge(e.createdAt)}
                    {e.size ? ` · Size ${e.size}` : ''} · Verified buyer
                  </>
                )}
              </p>
              {e.kind === 'question' && canReply && e.replies.length === 0 && (
                <ReplyForm questionId={e.id} slug={slug} />
              )}
            </div>
          </div>
          {e.kind === 'question' &&
            e.replies.map((r) => (
              <div key={r.id} className="ml-11 mt-3 flex gap-3">
                <Initials name={r.name} dark />
                <div className="min-w-0">
                  <p className="leading-snug">
                    <span className="font-normal">{r.name}</span>{' '}
                    <span className="ml-1 inline-block border border-ink px-1 text-[9px] uppercase leading-[14px] tracking-[0.14em]">
                      Maker
                    </span>{' '}
                    <span className="whitespace-pre-line text-text2">{r.body}</span>
                  </p>
                  <p className="mt-1 text-[11px] text-muted-2">{shortAge(r.createdAt)} · Reply</p>
                </div>
              </div>
            ))}
        </li>
      ))}
    </ul>
  );
}

/** The pinned "Ask {maker} a question" field. Questions are public; contact details are refused. */
export function AskQuestionForm({
  productId,
  slug,
  makerName,
  signedIn,
  isMaker = false,
}: {
  productId: string;
  slug: string;
  makerName: string;
  signedIn: boolean;
  isMaker?: boolean;
}) {
  const [state, action] = useFormState<FormState, FormData>(askQuestionAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  if (isMaker)
    return (
      <p className="text-[12px] text-muted">Shoppers’ questions on your piece appear above.</p>
    );
  if (!signedIn)
    return (
      <p className="text-[13px]">
        <a href={`/login?next=${encodeURIComponent(`/products/${slug}`)}`} className="link">
          Sign in
        </a>{' '}
        to ask {makerName} a question.
      </p>
    );
  return (
    <form ref={form} action={action} data-testid="ask-question">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex items-center border border-line-strong focus-within:border-ink">
        <label htmlFor={`ask-${productId}`} className="sr-only">
          Ask {makerName} a question
        </label>
        <input
          id={`ask-${productId}`}
          name="body"
          required
          maxLength={600}
          autoComplete="off"
          placeholder={`Ask ${makerName} a question`}
          className="min-h-[44px] min-w-0 flex-1 bg-transparent px-3 text-[13px] focus:outline-none"
        />
        <Submit label="Send" />
      </div>
      <div aria-live="polite">
        {state?.ok === false && (
          <p className="mt-2 text-[12px] text-error" data-testid="question-error">
            {state.message}
          </p>
        )}
        {state?.ok && <p className="mt-2 text-[12px] text-muted">{state.message}</p>}
      </div>
    </form>
  );
}
