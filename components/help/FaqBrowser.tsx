'use client';

import { Fragment, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import type { FaqCategory, FaqItem } from '@/content/faq';
import { ContactForm } from './ContactForm';

/** Wraps each match of `q` in <mark>. */
function highlight(text: string, q: string): ReactNode {
  const needle = q.trim();
  if (!needle) return text;
  const parts = text.split(new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) =>
    i % 2 ? (
      <mark key={i} className="bg-[#E9DCC4] text-ink">
        {p}
      </mark>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/**
 * Help & FAQ: categories (a list on desktop, chips on phone), an accordion with one answer open
 * at a time, search across every question and answer, and the "Message us" card. Each question
 * is reachable at /help#its-id, which opens it.
 */
export function FaqBrowser({
  categories,
  searchPlaceholder,
  contact,
  supportEmail,
}: {
  categories: FaqCategory[];
  searchPlaceholder: string;
  contact: { kicker: string; title: string; body: string; cta: string };
  supportEmail: string;
}) {
  const [active, setActive] = useState(categories[0]!.id);
  const [open, setOpen] = useState<string | null>(categories[0]!.items[0]?.id ?? null);
  const [q, setQ] = useState('');
  const [contacting, setContacting] = useState(false);
  const searchId = useId();

  // /help#made-to-order opens that question; /help#contact opens the form.
  useEffect(() => {
    const go = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) return;
      if (hash === 'contact') {
        setContacting(true);
        document.getElementById('contact')?.scrollIntoView({ block: 'center' });
        return;
      }
      const cat = categories.find((c) => c.items.some((i) => i.id === hash));
      if (cat) {
        setQ('');
        setActive(cat.id);
        setOpen(hash);
        requestAnimationFrame(() =>
          document.getElementById(hash)?.scrollIntoView({ block: 'center' }),
        );
      }
    };
    go();
    window.addEventListener('hashchange', go);
    return () => window.removeEventListener('hashchange', go);
  }, [categories]);

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    if (!needle) return null;
    return categories.flatMap((c) =>
      c.items
        .filter((i) => `${i.q} ${i.a}`.toLowerCase().includes(needle))
        .map((i) => ({ ...i, category: c.title })),
    );
  }, [categories, needle]);
  // Searching opens the first match.
  useEffect(() => {
    if (results?.length) setOpen(results[0]!.id);
  }, [results]);

  const category = categories.find((c) => c.id === active)!;
  const shown: Array<FaqItem & { category?: string }> = results ?? category.items;

  const contactCard = (
    <aside
      id="contact"
      className="scroll-mt-32 bg-stone px-6 py-8 md:sticky md:top-[calc(var(--header-offset)+24px)] md:px-8"
      aria-labelledby="contact-title"
      data-testid="help-contact"
    >
      <p className="eyebrow">{contact.kicker}</p>
      <h2 id="contact-title" className="mt-3 text-[32px] leading-tight">
        {contact.title}
      </h2>
      {contacting ? (
        <ContactForm onCancel={() => setContacting(false)} />
      ) : (
        <>
          <p className="mt-3 text-[14px] leading-relaxed text-text2">{contact.body}</p>
          <button
            type="button"
            onClick={() => setContacting(true)}
            className="glass-dark mt-6 min-h-[52px] w-full text-[11px] uppercase tracking-[0.2em] text-ground"
            data-testid="message-us"
          >
            {contact.cta}
          </button>
          <p className="mt-4 text-[13px]">
            Or email{' '}
            <a href={`mailto:${supportEmail}`} className="underline underline-offset-[3px]">
              {supportEmail}
            </a>
          </p>
        </>
      )}
    </aside>
  );

  return (
    <>
      <div className="mx-auto mt-8 max-w-[calc(630px+2*var(--gutter))] px-[var(--gutter)]">
        <label htmlFor={searchId} className="sr-only">
          Search help
        </label>
        <div className="flex items-center gap-3 border border-ink bg-surface px-5">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-4-4" />
          </svg>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-h-[56px] w-full bg-transparent text-[15px] outline-none placeholder:text-muted-2"
            data-testid="help-search"
          />
        </div>
      </div>

      <div className="mt-12 border-t border-line pt-12 md:mt-14 md:pt-14">
        <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-10 md:grid-cols-[220px_minmax(0,1fr)_minmax(260px,300px)] md:gap-12 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          {/* Categories: a list on desktop, chips on phone. */}
          <nav aria-label="Help topics" className={results ? 'hidden md:block md:opacity-40' : ''}>
            <ul className="no-scrollbar -mx-[var(--gutter)] flex gap-2 overflow-x-auto px-[var(--gutter)] md:mx-0 md:block md:overflow-visible md:border-t md:border-ink md:px-0">
              {categories.map((c) => (
                <li key={c.id} className="shrink-0 md:border-b md:border-line">
                  <button
                    type="button"
                    onClick={() => {
                      setQ('');
                      setActive(c.id);
                      setOpen(c.items[0]?.id ?? null);
                    }}
                    aria-current={!results && active === c.id ? 'true' : undefined}
                    className={`min-h-[44px] whitespace-nowrap border px-4 text-[13px] md:w-full md:border-0 md:px-0 md:py-3 md:text-left md:text-[15px] ${!results && active === c.id ? 'border-ink bg-ink text-ground md:bg-transparent md:font-medium md:text-ink' : 'border-line-strong text-muted md:hover:text-ink'}`}
                    data-testid={`help-cat-${c.id}`}
                  >
                    {c.title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-live="polite" data-testid="help-questions">
            <h2 className="border-b border-line pb-4 text-[36px] leading-none md:text-[44px]">
              {results ? `Results for “${q.trim()}”` : category.title}
            </h2>
            {results && results.length === 0 ? (
              <div className="py-8 text-[15px]" data-testid="help-no-results">
                <p>
                  No answers for “{q.trim()}”.{' '}
                  <button
                    type="button"
                    className="underline underline-offset-[3px]"
                    onClick={() => {
                      setContacting(true);
                      document.getElementById('contact')?.scrollIntoView({ block: 'center' });
                    }}
                  >
                    Message us
                  </button>{' '}
                  and we’ll help.
                </p>
              </div>
            ) : (
              <ul role="list">
                {shown.map((item) => {
                  const isOpen = open === item.id;
                  return (
                    <li key={item.id} id={item.id} className="scroll-mt-32 border-b border-line">
                      <h3>
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-controls={`${item.id}-answer`}
                          onClick={() => setOpen(isOpen ? null : item.id)}
                          className="flex w-full items-start justify-between gap-6 py-5 text-left font-display text-[22px] leading-snug md:text-[24px]"
                          data-testid="faq-question"
                        >
                          <span>
                            {highlight(item.q, q)}
                            {'category' in item && item.category && (
                              <span className="mt-1 block font-sans text-[11px] uppercase tracking-label text-muted-2">
                                {item.category}
                              </span>
                            )}
                          </span>
                          <span
                            aria-hidden
                            className={`mt-1 shrink-0 font-sans text-[20px] leading-none transition-transform duration-300 motion-reduce:transition-none ${isOpen ? 'rotate-45' : ''}`}
                          >
                            +
                          </span>
                        </button>
                      </h3>
                      {/* 300ms height animation: grid rows 0fr → 1fr. */}
                      <div
                        id={`${item.id}-answer`}
                        role="region"
                        aria-label={item.q}
                        aria-hidden={!isOpen}
                        className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
                        data-testid="faq-answer"
                      >
                        <div className="overflow-hidden">
                          <p className="max-w-[62ch] pb-6 text-[15px] leading-relaxed text-text2">
                            {highlight(item.a, q)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {contactCard}
        </div>
      </div>
    </>
  );
}
