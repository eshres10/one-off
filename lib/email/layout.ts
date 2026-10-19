import { BRAND } from '@/lib/brand';
import { env } from '@/lib/env';

/**
 * The brand email layout: a white 560px body, the wordmark, a serif headline, a black
 * full-width button and a stone footer. Table-based with inline styles so it holds up in
 * Gmail and Outlook. All text passed in is escaped.
 */
export interface EmailLayout {
  preheader?: string;
  /** Small label above the headline, e.g. "Ship by Thu 23 Oct". */
  eyebrow?: string;
  heading: string;
  image?: string | null;
  paragraphs?: string[];
  rows?: Array<[string, string]>;
  /** A bold line under the rows, e.g. "You get A$231.40". */
  total?: [string, string];
  button?: { label: string; url: string };
  after?: string[];
  /** Makers' emails link to their notification settings. */
  sellerFooter?: boolean;
}

const SERIF = `'Instrument Serif', Georgia, 'Times New Roman', serif`;
const SANS = `Jost, 'Helvetica Neue', Helvetica, Arial, sans-serif`;
const INK = '#111111';
const MUTED = '#4a4743';
const STONE = '#eeeae3';
const LINE = '#e2ded7';
const GROUND = '#f6f4f0';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Escapes text, keeps line breaks and turns bare links into anchors. */
function rich(s: string): string {
  return esc(s)
    .replace(
      /https?:\/\/[^\s<]+/g,
      (u) => `<a href="${u}" style="color:${INK};text-decoration:underline;">${u}</a>`,
    )
    .replace(/\n/g, '<br>');
}

const abs = (u: string) => (u.startsWith('http') ? u : `${env().APP_URL}${u}`);

export function renderEmail(l: EmailLayout): string {
  const p = (t: string, extra = '') =>
    `<p style="margin:0 0 16px;font-family:${SANS};font-size:15px;line-height:1.6;color:${INK};${extra}">${rich(t)}</p>`;
  const rows = (l.rows ?? [])
    .map(
      ([k, v]) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:13px;color:${MUTED};vertical-align:top;">${esc(k)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${LINE};font-family:${SANS};font-size:14px;color:${INK};text-align:right;">${rich(v)}</td>
      </tr>`,
    )
    .join('');
  const total = l.total
    ? `<tr><td style="padding:14px 0 0;font-family:${SERIF};font-size:24px;color:${INK};">${esc(l.total[0])}</td>
        <td style="padding:14px 0 0;font-family:${SERIF};font-size:24px;color:${INK};text-align:right;">${esc(l.total[1])}</td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>${esc(l.heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Jost:wght@400;500&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${GROUND};">
${l.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(l.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${GROUND};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;">
  <tr><td style="padding:28px 32px 8px;">
    <a href="${abs('/')}"><img src="${abs('/brand/one-off-wordmark-email.png')}" width="101" height="28" alt="${esc(BRAND.name)}" style="display:block;border:0;"></a>
  </td></tr>
  ${l.image ? `<tr><td style="padding:16px 32px 0;"><img src="${esc(abs(l.image))}" width="496" alt="" style="display:block;width:100%;height:auto;max-height:320px;object-fit:cover;border:0;"></td></tr>` : ''}
  <tr><td style="padding:24px 32px 8px;">
    ${l.eyebrow ? `<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:${MUTED};">${esc(l.eyebrow)}</p>` : ''}
    <h1 style="margin:0 0 20px;font-family:${SERIF};font-weight:400;font-size:34px;line-height:1.1;color:${INK};">${esc(l.heading)}</h1>
    ${(l.paragraphs ?? []).map((t) => p(t)).join('')}
    ${rows || total ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">${rows}${total}</table>` : ''}
    ${
      l.button
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr>
        <td align="center" style="background:${INK};">
          <a href="${esc(abs(l.button.url))}" style="display:block;padding:16px 20px;font-family:${SANS};font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#ffffff;text-decoration:none;">${esc(l.button.label)}</a>
        </td></tr></table>`
        : ''
    }
    ${(l.after ?? []).map((t) => p(t, `font-size:13px;color:${MUTED};`)).join('')}
  </td></tr>
  <tr><td style="background:${STONE};padding:20px 32px;font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED};">
    ${esc(BRAND.name)} · ${esc(BRAND.tagline)}
    ${l.sellerFooter ? `<br><a href="${abs('/studio/settings#notifications')}" style="color:${MUTED};">Email settings</a>` : ''}
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Wraps a plain-text email in the brand layout: the subject becomes the headline. */
export function htmlFromText(subject: string, text: string): string {
  const body = text.replace(/\n\n— [\s\S]*$/, '');
  return renderEmail({ heading: subject, paragraphs: body.split(/\n{2,}/) });
}
