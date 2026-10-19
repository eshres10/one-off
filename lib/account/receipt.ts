import {
  PDFDocument,
  PDFOperator,
  PDFOperatorNames,
  StandardFonts,
  popGraphicsState,
  pushGraphicsState,
  scale as scaleOp,
  setFillingRgbColor,
  translate,
  type PDFFont,
} from 'pdf-lib';

import { BRAND } from '@/lib/brand';
import { LOGOS } from '@/components/ui/Wordmark';
import { formatPrice } from '@/lib/domain/money';
import type { BuyerOrder } from '@/lib/queries/account';
import { gstIncluded } from '@/lib/services/checkout';
import { SITE } from '@/lib/site/config';
import { INK, LINE, MUTED, pathOperators, safe, wrap } from '@/lib/studio/packing-slip';

const A4 = [595.28, 841.89] as const;

const longDate = (d: Date) =>
  new Date(d).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: SITE.adminTimeZone,
  });

/**
 * The buyer's receipt: wordmark, order number and date, ship-to, each maker's pieces and delivery,
 * totals with the GST-included line. It is a receipt, not a tax invoice (makers are the sellers).
 */
export async function receiptPdf(order: BuyerOrder): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${order.orderNumber}`);
  let page = pdf.addPage([...A4]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const [width, height] = A4;
  const m = 48;
  const w = width - m * 2;

  const scale = 130 / 1613;
  page.pushOperators(
    pushGraphicsState(),
    translate(m - 193 * scale, height - m + 193 * scale),
    scaleOp(scale, -scale),
    setFillingRgbColor(17 / 255, 17 / 255, 17 / 255),
    ...pathOperators(LOGOS.horizontal.d),
    PDFOperator.of(PDFOperatorNames.FillEvenOdd),
    popGraphicsState(),
  );

  let y = height - m - 36 - 30;
  const text = (
    s: string,
    opts: { size?: number; font?: PDFFont; color?: typeof INK; x?: number; right?: boolean } = {},
  ) => {
    const font = opts.font ?? sans;
    const size = opts.size ?? 10;
    const clean = safe(font, s);
    const x = opts.right ? width - m - font.widthOfTextAtSize(clean, size) : (opts.x ?? m);
    page.drawText(clean, { x, y, size, font, color: opts.color ?? INK });
  };
  const rule = () => {
    page.drawLine({ start: { x: m, y }, end: { x: width - m, y }, thickness: 0.6, color: LINE });
  };
  const room = (needed: number) => {
    if (y - needed > m + 40) return;
    page = pdf.addPage([...A4]);
    y = height - m;
  };

  text('RECEIPT', { size: 8, color: MUTED });
  text(longDate(order.paidAt ?? order.createdAt), { size: 8, color: MUTED, right: true });
  y -= 30;
  text(order.orderNumber, { size: 26, font: serif });
  y -= 34;

  const a = order.shippingAddress ?? {};
  text('DELIVERING TO', { size: 7.5, color: MUTED });
  y -= 15;
  for (const l of [
    a.name,
    a.line1,
    a.line2,
    [a.city ?? a.suburb, a.state, a.postal_code ?? a.postcode].filter(Boolean).join(' '),
  ].filter((x): x is string => Boolean(x))) {
    text(l);
    y -= 14;
  }
  y -= 10;
  rule();
  y -= 24;

  for (const f of order.fulfilments) {
    room(60 + f.items.length * 34);
    text(`FROM ${f.makerName.toUpperCase()}`, { size: 7.5, color: MUTED });
    if (f.makerPlace) text(f.makerPlace, { size: 7.5, color: MUTED, right: true });
    y -= 20;
    for (const i of f.items) {
      for (const [n, l] of wrap(serif, i.productTitle, 13, w - 110).entries()) {
        text(l, { size: 13, font: serif });
        if (n === 0) text(formatPrice(i.lineTotalCents), { right: true });
        y -= 16;
      }
      text(
        `${i.variantLabel.replace(/^AU /, 'Size ')}${i.quantity > 1 ? ` · x ${i.quantity}` : ''}${i.fulfilmentStatus === 'refunded' ? ' · Refunded' : ''}`,
        { size: 9, color: MUTED },
      );
      y -= 20;
    }
    text(`${f.speed === 'express' ? 'Express' : 'Standard'} delivery`, { color: MUTED });
    text(f.shippingCents ? formatPrice(f.shippingCents) : 'Free', { color: MUTED, right: true });
    y -= 18;
    rule();
    y -= 22;
  }

  room(110);
  const row = (label: string, value: string, strong = false) => {
    text(label, { size: strong ? 12 : 10, font: strong ? serif : sans });
    text(value, { size: strong ? 12 : 10, right: true });
    y -= strong ? 20 : 16;
  };
  row('Subtotal', formatPrice(order.subtotalCents));
  row('Delivery', order.shippingTotalCents ? formatPrice(order.shippingTotalCents) : 'Free');
  if (order.shippingSavingCents > 0)
    row('You saved on shipping', formatPrice(order.shippingSavingCents));
  if (order.refundedCents > 0) row('Refunded', `-${formatPrice(order.refundedCents)}`);
  row('Total paid', formatPrice(order.totalCents), true);
  if (SITE.tax.showGstIncludedLine)
    text(`Includes ${formatPrice(gstIncluded(order.totalCents))} GST`, {
      size: 9,
      color: MUTED,
      right: true,
    });
  y -= 36;

  room(60);
  for (const l of wrap(
    sans,
    `Each piece is sold by the maker named above, through ${BRAND.name}. Questions about this order: ${BRAND.supportEmail} or your account at ${BRAND.domain}/account.`,
    8.5,
    w,
  )) {
    text(l, { size: 8.5, color: MUTED });
    y -= 12;
  }
  return pdf.save();
}
