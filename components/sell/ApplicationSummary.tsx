import { MADE_BY, type ApplicationAnswers } from '@/lib/services/apply';
import { SELL_MODES } from '@/lib/services/sell';
import { Img as Image } from '@/components/ui/Img';

/** An application's answers, read-only. `large` shows full-size photos (admin review). */
export function ApplicationSummary({
  answers: a,
  large = false,
}: {
  answers: ApplicationAnswers;
  large?: boolean;
}) {
  const madeBy = MADE_BY.find((m) => m.value === a.madeBy)?.label ?? '—';
  const rows: Array<[string, React.ReactNode]> = [
    ['Label', a.name],
    ['Your name', a.ownerName],
    ['Email', a.email],
    ['Mobile', a.mobile],
    ['Where', [a.suburb, a.state].filter(Boolean).join(', ')],
    [
      'Instagram',
      a.instagram ? (
        <a
          href={`https://instagram.com/${a.instagram}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          @{a.instagram}
        </a>
      ) : (
        '—'
      ),
    ],
    [
      'Website',
      a.website ? (
        <a
          href={a.website}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="break-all underline underline-offset-4"
        >
          {a.website.replace(/^https?:\/\//, '')}
        </a>
      ) : (
        '—'
      ),
    ],
    ['Makes', a.makes.join(', ') || '—'],
    [
      'Sells',
      a.modes.map((m) => SELL_MODES.find((x) => x.value === m)?.label ?? m).join(', ') || '—',
    ],
    ['Who makes the pieces', a.madeByDetail ? `${madeBy}: ${a.madeByDetail}` : madeBy],
    ['Process', a.process || '—'],
    ['Fabrics', a.fabrics || '—'],
    ['Declaration', a.declaration ? 'Agreed' : 'Not agreed'],
  ];
  return (
    <div data-testid="application-summary">
      {a.photos.length > 0 && (
        <ul
          className={large ? 'grid grid-cols-2 gap-3 lg:grid-cols-3' : 'grid grid-cols-3 gap-2'}
          role="list"
        >
          {a.photos.map((src, i) => (
            <li key={src} className="relative aspect-4/5 overflow-hidden bg-stone">
              {large ? (
                <a href={src} target="_blank" rel="noopener noreferrer">
                  <Image
                    src={src}
                    alt={`Work photo ${i + 1}`}
                    fill
                    sizes="(min-width:1024px) 360px, 50vw"
                    className="object-cover"
                  />
                </a>
              ) : (
                <Image
                  src={src}
                  alt={`Work photo ${i + 1}`}
                  fill
                  sizes="150px"
                  className="object-cover"
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-5 divide-y divide-line border-y border-line">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[120px_1fr] gap-3 py-2.5 text-[13px]">
            <dt className="text-muted">{k}</dt>
            <dd className="whitespace-pre-line">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
