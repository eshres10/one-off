'use client';

import { useState } from 'react';

const W = 720;
const H = 220;
const PAD = { top: 16, right: 12, bottom: 28, left: 36 };

/** Single-series line chart (views per day): 2px ink line, crosshair + tooltip, table fallback. */
export function ViewsChart({ data }: { data: Array<{ day: string; views: number }> }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(4, ...data.map((d) => d.views));
  const niceMax = Math.ceil(max / 4) * 4;
  const x = (i: number) =>
    PAD.left + (i / Math.max(1, data.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v / niceMax) * (H - PAD.top - PAD.bottom);
  const path = data
    .map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.views).toFixed(1)}`)
    .join(' ');
  const ticks = [0, niceMax / 2, niceMax];
  const label = (day: string) =>
    new Date(`${day}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const h = hover !== null ? data[hover] : null;

  return (
    <figure>
      <figcaption className="eyebrow mb-3 text-ink">
        Product views per day · last {data.length} days
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={`Product views per day over the last ${data.length} days`}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * W;
            const i = Math.round(
              ((px - PAD.left) / (W - PAD.left - PAD.right)) * (data.length - 1),
            );
            setHover(Math.max(0, Math.min(data.length - 1, i)));
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--line)"
                strokeWidth={1}
              />
              <text
                x={PAD.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--muted-2)"
              >
                {t}
              </text>
            </g>
          ))}
          {[0, Math.floor((data.length - 1) / 2), data.length - 1].map((i) =>
            data[i] ? (
              <text
                key={i}
                x={x(i)}
                y={H - 8}
                textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
                fontSize={11}
                fill="var(--muted-2)"
              >
                {label(data[i]!.day)}
              </text>
            ) : null,
          )}
          <path
            d={path}
            fill="none"
            stroke="var(--ink)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {h && hover !== null && (
            <g>
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={PAD.top}
                y2={H - PAD.bottom}
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
              <circle
                cx={x(hover)}
                cy={y(h.views)}
                r={4.5}
                fill="var(--ink)"
                stroke="var(--ground)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute top-0 border border-line bg-surface px-2.5 py-1.5 text-[12px] shadow-sm"
            style={{
              left: `${(x(hover) / W) * 100}%`,
              transform: `translateX(${hover > data.length / 2 ? '-105%' : '5%'})`,
            }}
          >
            <span className="block text-muted-2">{label(h.day)}</span>
            <span className="block text-ink">{h.views} views</span>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>Product views per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{d.views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
