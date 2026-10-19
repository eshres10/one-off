'use client';

import { useEffect, useState } from 'react';

/** "On this page": the section list, with the one you're reading marked as you scroll. */
export function OnThisPage({ sections }: { sections: Array<{ id: string; label: string }> }) {
  const [current, setCurrent] = useState(sections[0]?.id ?? '');
  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((e): e is HTMLElement => !!e);
    const visible = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity);
        const best = [...visible.entries()]
          .filter(([, top]) => top !== Infinity)
          .sort((a, b) => a[1] - b[1])[0];
        if (best) setCurrent(best[0]);
      },
      { rootMargin: '-20% 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [sections]);
  return (
    <ol className="space-y-2 text-[13px]" data-testid="on-this-page">
      {sections.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            aria-current={current === s.id ? 'location' : undefined}
            className={
              current === s.id
                ? 'text-ink underline underline-offset-4'
                : 'text-muted hover:text-ink'
            }
          >
            {s.label}
          </a>
        </li>
      ))}
    </ol>
  );
}
