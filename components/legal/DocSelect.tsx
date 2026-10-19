'use client';

import { useRouter } from 'next/navigation';

/** Phone: the list of legal documents as a select. */
export function DocSelect({
  docs,
  current,
}: {
  docs: ReadonlyArray<{ slug: string; label: string }>;
  current: string;
}) {
  const router = useRouter();
  return (
    <label className="block md:hidden">
      <span className="sr-only">Legal document</span>
      <select
        className="input"
        value={current}
        onChange={(e) => router.push(`/legal/${e.target.value}`)}
        data-testid="legal-select"
      >
        {docs.map((d) => (
          <option key={d.slug} value={d.slug}>
            {d.label}
          </option>
        ))}
      </select>
    </label>
  );
}
