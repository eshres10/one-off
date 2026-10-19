import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { BRAND } from '@/lib/brand';
import { INK, MUTED, safe, wrap } from '@/lib/studio/packing-slip';
import { PLACEHOLDER, updatedLine, type LegalDoc } from '@/lib/legal';

const A4 = [595.28, 841.89] as const;
const DRAFT = rgb(138 / 255, 46 / 255, 28 / 255);

/** A legal document as a PDF, from the same content as the page. */
export async function legalPdf(doc: LegalDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${doc.title} · ${BRAND.name}`);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const [width, height] = A4;
  const m = 56;
  const w = width - m * 2;
  let page: PDFPage = pdf.addPage([...A4]);
  let y = height - m;

  const ensure = (needed: number) => {
    if (y - needed < m) {
      page = pdf.addPage([...A4]);
      y = height - m;
    }
  };
  const para = (text: string, font: PDFFont, size: number, color = INK, gap = 6) => {
    for (const line of wrap(font, text, size, w)) {
      ensure(size + 4);
      page.drawText(safe(font, line), { x: m, y: y - size, size, font, color });
      y -= size + 4;
    }
    y -= gap;
  };

  para(BRAND.name.toUpperCase(), sans, 9, MUTED, 14);
  if (doc.draft)
    para(
      'Draft layout for legal review. Wording to be written by a lawyer before launch.',
      sans,
      9,
      DRAFT,
      12,
    );
  para(doc.title, serif, 28, INK, 4);
  para(updatedLine(doc), sans, 9, MUTED, 16);
  para('IN SHORT', sans, 8, MUTED, 2);
  for (const s of doc.summary) para(`•  ${s}`, sans, 10, INK, 2);
  y -= 12;
  for (const s of doc.sections) {
    ensure(60);
    para(`${s.number}. ${s.heading}`, serif, 16, INK, 4);
    if (s.covers) para(s.covers, sans, 10, MUTED, 4);
    for (const p of s.paragraphs)
      para(p, p === PLACEHOLDER ? italic : sans, 10, p === PLACEHOLDER ? MUTED : INK, 6);
    y -= 8;
  }
  return pdf.save();
}
