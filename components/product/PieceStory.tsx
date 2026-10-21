import { Img as Image } from '@/components/ui/Img';
import { storySubLine, storyTeaser } from '@/lib/listings/story';
import type { StoryForPage } from '@/lib/queries/story';

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-circle bg-line-strong"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[12px] text-ground">
          {name.charAt(0)}
        </span>
      )}
    </span>
  );
}

/** "Read the story of this piece": the stone row above the product details, down to #story. */
export function StoryLink({ data }: { data: StoryForPage }) {
  return (
    <a
      href="#story"
      className="mt-5 flex items-center gap-3 bg-stone-light px-4 py-3 hover:bg-stone"
      data-testid="story-link"
    >
      <Avatar src={data.writer.avatarUrl} name={data.writer.name} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">Read the story of this piece</span>
        <span className="block truncate text-[12px] text-muted">{storySubLine(data.story)}</span>
      </span>
      <span aria-hidden className="text-[16px]">
        ↓
      </span>
    </a>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">{children}</p>
);

/**
 * "The story of this piece", written by the maker: full width on stone, between the product and
 * reviews. Every part hides when it's empty. Phones get one column, a shortened inspiration with
 * "Read the full story", and close-ups that scroll sideways.
 */
export function StorySection({ data, id = 'story' }: { data: StoryForPage; id?: string }) {
  const { story: s, writer: w } = data;
  const people =
    w.teamSize === 1
      ? { n: '1 person', sub: 'cuts, sews and finishes it' }
      : w.teamSize && w.teamSize > 1
        ? { n: `${w.teamSize} people`, sub: 'in a small studio' }
        : null;
  const stats = [
    s.hoursToMake ? { n: `${s.hoursToMake} hrs`, sub: 'to make, start to finish' } : null,
    people,
  ].filter((x): x is { n: string; sub: string } => Boolean(x));
  const teaser = storyTeaser(s.inspiration);
  const long = teaser !== s.inspiration.trim();
  const right = s.inspiration || s.fabric || stats.length > 0;

  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="relative z-[1] scroll-mt-[calc(var(--header-h)+8px)] bg-stone-light py-14 md:py-20"
      data-testid={id}
    >
      <div className="container-page">
        <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-3">
          <h2
            id={`${id}-heading`}
            className="font-sans text-[11px] font-normal uppercase tracking-[0.18em]"
          >
            The story of this piece
          </h2>
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-2">
            Written by the maker
          </p>
        </div>

        <div
          className={`mt-10 grid gap-10 ${right && (s.quote || w) ? 'md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:gap-16' : ''}`}
        >
          <div>
            {s.quote && (
              <blockquote
                className="font-display text-[30px] leading-[1.08] md:text-[60px] md:leading-[1.02]"
                data-testid="story-quote"
              >
                “{s.quote}”
              </blockquote>
            )}
            <div className={`flex items-center gap-3 ${s.quote ? 'mt-7' : ''}`}>
              <Avatar src={w.avatarUrl} name={w.name} size={44} />
              <div>
                <p className="font-display text-[20px] italic leading-tight">{w.name}</p>
                <p className="text-[11px] text-muted">
                  Founder, {w.shop}
                  {w.suburb ? ` · ${w.suburb}` : ''}
                </p>
              </div>
            </div>
          </div>

          {right && (
            <div className="space-y-6 text-[14px] leading-relaxed">
              {s.inspiration && (
                <div data-testid="story-inspiration">
                  <Label>The inspiration</Label>
                  <p className="mt-2 hidden whitespace-pre-line md:block">{s.inspiration}</p>
                  {long ? (
                    <details className="group mt-2 md:hidden">
                      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <span className="group-open:hidden">{teaser} </span>
                        <span className="text-[13px] underline underline-offset-4 group-open:hidden">
                          Read the full story
                        </span>
                      </summary>
                      <p className="whitespace-pre-line">{s.inspiration}</p>
                    </details>
                  ) : (
                    <p className="mt-2 whitespace-pre-line md:hidden">{s.inspiration}</p>
                  )}
                </div>
              )}
              {s.fabric && (
                <div data-testid="story-fabric">
                  <Label>The fabric</Label>
                  <p className="mt-2">{s.fabric}</p>
                </div>
              )}
              {stats.length > 0 && (
                <dl className="flex gap-12 pt-2" data-testid="story-stats">
                  {stats.map((x) => (
                    <div key={x.n}>
                      <dt className="sr-only">{x.sub}</dt>
                      <dd>
                        <span className="block font-display text-[44px] leading-none md:text-[52px]">
                          {x.n}
                        </span>
                        <span aria-hidden className="mt-1 block text-[11px] text-muted">
                          {x.sub}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>

        {s.details.length > 0 && (
          <div className="mt-12">
            <Label>In the details</Label>
            <ul className="mt-3 flex flex-wrap gap-2" role="list" data-testid="story-details">
              {s.details.map((d) => (
                <li key={d} className="border border-ink px-3 py-1.5 text-[12px]">
                  {d}
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.closeups.length > 0 && (
          <ul
            className="-mx-4 mt-10 flex snap-x gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0"
            role="list"
            data-testid="story-closeups"
          >
            {s.closeups.map((c, i) => (
              <li key={c.path} className="w-[200px] shrink-0 snap-start md:w-auto">
                <figure>
                  <div className="relative aspect-square overflow-hidden bg-stone">
                    <Image
                      src={c.path}
                      alt={c.caption || `Close-up ${i + 1} of the piece`}
                      fill
                      sizes="(min-width: 768px) 33vw, 200px"
                      className="object-cover"
                    />
                  </div>
                  {c.caption && (
                    <figcaption className="mt-2 text-[11px] text-muted">
                      <span className="mr-2 tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      {c.caption}
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
