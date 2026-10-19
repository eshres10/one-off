import {
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  scale as scaleOp,
  setFillingRgbColor,
  translate,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  type PDFFont,
} from 'pdf-lib';

import { LOGOS } from '@/components/ui/Wordmark';
import type { StudioOrderDetail } from '@/lib/services/studio-orders';

const A5 = [419.53, 595.28] as const;

/** The logo path uses absolute M, L and C commands only; turn it into PDF path operators. */
function pathOperators(d: string) {
  const ops = [];
  const re = /([MLCZ])([^MLCZ]*)/gi;
  for (const [, cmd, args] of d.matchAll(re)) {
    const n = (args!.match(/-?\d*\.?\d+/g) ?? []).map(Number);
    if (cmd === 'M') {
      ops.push(moveTo(n[0]!, n[1]!));
      for (let i = 2; i + 1 < n.length; i += 2) ops.push(lineTo(n[i]!, n[i + 1]!));
    } else if (cmd === 'L') {
      for (let i = 0; i + 1 < n.length; i += 2) ops.push(lineTo(n[i]!, n[i + 1]!));
    } else if (cmd === 'C') {
      for (let i = 0; i + 5 < n.length; i += 6)
        ops.push(appendBezierCurve(n[i]!, n[i + 1]!, n[i + 2]!, n[i + 3]!, n[i + 4]!, n[i + 5]!));
    } else ops.push(closePath());
  }
  return ops;
}
const INK = rgb(17 / 255, 17 / 255, 17 / 255);
const MUTED = rgb(107 / 255, 103 / 255, 98 / 255);
const LINE = rgb(226 / 255, 222 / 255, 215 / 255);

/** The standard PDF fonts only cover Latin-1: drop accents and anything else they can't draw. */
function safe(font: PDFFont, text: string) {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return Array.from(plain)
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '';
      }
    })
    .join('');
}

function wrap(font: PDFFont, text: string, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** A5 packing slip: wordmark, order, ship-to, items, gift note and a thank-you line. */
export async function packingSlipPdf(
  order: StudioOrderDetail,
  shop: { displayName: string; city: string | null },
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Packing slip ${order.orderNumber}`);
  const page = pdf.addPage([...A5]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const [width, height] = A5;
  const m = 36;
  const w = width - m * 2;

  // Wordmark from the brand path (viewBox 193 193 1613 447), 120pt wide.
  const logo = LOGOS.horizontal;
  // Drawn with the even-odd rule so the letters' counters stay open (drawSvgPath can't).
  const scale = 120 / 1613;
  page.pushOperators(
    pushGraphicsState(),
    translate(m - 193 * scale, height - m + 193 * scale),
    scaleOp(scale, -scale),
    setFillingRgbColor(17 / 255, 17 / 255, 17 / 255),
    ...pathOperators(logo.d),
    PDFOperator.of(PDFOperatorNames.FillEvenOdd),
    popGraphicsState(),
  );

  let y = height - m - 33 - 26;
  const text = (
    s: string,
    opts: { size?: number; font?: PDFFont; color?: typeof INK; x?: number } = {},
  ) => {
    const font = opts.font ?? sans;
    page.drawText(safe(font, s), {
      x: opts.x ?? m,
      y,
      size: opts.size ?? 9.5,
      font,
      color: opts.color ?? INK,
    });
  };

  text('PACKING SLIP', { size: 8, color: MUTED });
  text(`Order #${order.orderNumber.replace(/^OO-/, '')}`, {
    size: 8,
    color: MUTED,
    x: width - m - 90,
  });
  y -= 26;
  text(shop.displayName, { size: 20, font: serif });
  y -= 30;

  text('SHIP TO', { size: 7.5, color: MUTED });
  y -= 14;
  const to = order.shipTo ?? {};
  for (const l of [
    to.name,
    to.line1,
    to.line2,
    [to.city, to.state, to.postal_code].filter(Boolean).join(' '),
  ].filter((x): x is string => Boolean(x))) {
    text(l);
    y -= 13;
  }
  y -= 10;
  page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 0.6, color: LINE });
  y -= 20;

  text('ITEMS', { size: 7.5, color: MUTED });
  y -= 16;
  for (const i of order.items) {
    text(i.title, { size: 12, font: serif });
    text(`x ${i.quantity}`, { x: width - m - 24 });
    y -= 14;
    text(i.variantLabel.replace(/^AU /, 'Size '), { color: MUTED });
    y -= 20;
  }
  page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 0.6, color: LINE });
  y -= 22;

  if (order.giftNote) {
    text('GIFT NOTE', { size: 7.5, color: MUTED });
    y -= 18;
    for (const l of wrap(serif, `“${order.giftNote}”`, 14, w)) {
      text(l, { size: 14, font: serif });
      y -= 18;
    }
    y -= 10;
  }

  y = Math.min(y, 120);
  const thanks = `Thank you for choosing a piece made by hand${shop.city ? ` in ${shop.city}` : ''}. We hope you love wearing it as much as we loved making it.`;
  for (const l of wrap(serif, thanks, 12, w)) {
    text(l, { size: 12, font: serif });
    y -= 16;
  }
  y -= 8;
  text(`${shop.displayName} on One Off · shoponeoff.com.au`, { size: 8, color: MUTED });
  return pdf.save();
}
